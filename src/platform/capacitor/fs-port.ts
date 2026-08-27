/**
 * CapacitorFsPort — the Android FsPort (MC2), over @capacitor/filesystem.
 *
 * Absolute-path only: every call passes a full file:// path with the `directory` param
 * OMITTED (documented plugin behaviour for all methods). The port therefore knows nothing
 * about Directory — that lives in roots.ts — which keeps it the same dumb translation layer
 * NodeFsPort is, and is what lets it pass the same contract suite.
 *
 * Error translation (CRITICAL): the plugin throws OS-PLUG-FILE-#### codes (≥7.1.0, asserted
 * by plugin-version.test.ts). ONLY the codes in the whitelist below become ENOENT; every
 * other code propagates unchanged. In particular 0007 (permission denied) must NEVER become
 * ENOENT — FileService would then treat a library it merely cannot read as absent and take
 * the recovery path over intact data.
 *
 * ON-DEVICE SPIKE (2026-08-25, @capacitor/filesystem 8.1.3, real Android tablet): 10/10
 * contract cases passed. Confirmed: absolute scheme-less paths (directory param omitted) are
 * accepted by every method; `rename` overwrites an existing target; the ENOENT whitelist below
 * is correct (the plugin's missing-entry code is inside {0008, 0011}). 0007 was NOT exercised
 * on device (needs a denied Documents permission — MC3's scope); `fake-filesystem.ts` +
 * `fs-port.test.ts` are this project's only coverage of that path. See `mkdir` below for the
 * one behaviour the spike proved surprising.
 *
 * WebView code: never import a `node:` built-in here.
 */
import { Encoding, Filesystem } from '@capacitor/filesystem'
import type { FsPort } from '@data/fs-port'
import { CODE_DIR_EXISTS, CODE_MISSING_PARENT, CODE_NOT_FOUND, codeOf } from './error-codes'

/** Error carrying the `code === 'ENOENT'` shape the data layer checks. */
function enoent(path: string): Error & { code: string } {
  return Object.assign(new Error(`ENOENT: no such file or directory, '${path}'`), {
    code: 'ENOENT'
  })
}

/** True only for "the thing is not there". Deliberately narrow — see the header. */
function isMissing(err: unknown): boolean {
  const code = codeOf(err)
  if (code === CODE_NOT_FOUND || code === CODE_MISSING_PARENT) return true
  // Fallback for a pre-7.1.0 plugin only; the version floor test makes this unreachable in
  // a correctly-installed tree, and it is never the primary path. KEPT deliberately
  // (belt-and-braces): plugin-version.test.ts is what makes this dead code today, and a
  // future edit to (or deletion of) that test could quietly resurrect a pre-7.1.0 plugin as
  // a live path. This is not accreted dead code — removing it would trade a harmless no-op
  // for a silent regression if that guard test ever goes away.
  return code === undefined && /does not exist/i.test((err as Error | null)?.message ?? '')
}

/** Re-throw as ENOENT when missing, otherwise propagate with the original code intact. */
function translate(err: unknown, path: string): never {
  if (isMissing(err)) throw enoent(path)
  throw err
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function base64ToBytes(data: string): Uint8Array {
  const binary = atob(data)
  const out = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i)
  return out
}

export class CapacitorFsPort implements FsPort {
  async mkdir(path: string, _opts: { recursive: true }): Promise<void> {
    try {
      await Filesystem.mkdir({ path, recursive: true })
    } catch (err) {
      // OBSERVED ON DEVICE 2026-08-25 (@capacitor/filesystem 8.1.3): Filesystem.mkdir with
      // recursive: true on an EXISTING directory THROWS 0010 — verbatim "Directory at
      // '<path>/' already exists, cannot be overwritten." — rather than the silent
      // idempotency Node's { recursive: true } gives for free. This swallow is therefore
      // load-bearing, not a defensive guess: FileService relies on mkdir being idempotent,
      // and the plugin does not provide that on its own. Regression-tested by "repeat mkdir
      // on the same existing directory resolves rather than throwing" in fs-port.test.ts,
      // which mkdirs the SAME path twice through this port. The shared contract suite cannot
      // cover this: every contract case (including "creates nested directories with recursive
      // mkdir") only ever mkdirs a fresh path once, so a repeat mkdir on an EXISTING directory
      // is never exercised there.
      if (codeOf(err) === CODE_DIR_EXISTS) return
      throw err
    }
  }

  async readFile(path: string): Promise<string> {
    try {
      const { data } = await Filesystem.readFile({ path, encoding: Encoding.UTF8 })
      return typeof data === 'string' ? data : await data.text()
    } catch (err) {
      return translate(err, path)
    }
  }

  async readFileBytes(path: string): Promise<Uint8Array> {
    try {
      const { data } = await Filesystem.readFile({ path })
      if (typeof data === 'string') return base64ToBytes(data)
      return new Uint8Array(await data.arrayBuffer())
    } catch (err) {
      return translate(err, path)
    }
  }

  async writeFile(path: string, data: string | Uint8Array): Promise<void> {
    // DIVERGENCE FROM NodeFsPort (tolerated, not yet spike-verified): `recursive: true` here
    // makes a write into a missing parent directory silently create the parent tree, whereas
    // `NodeFsPort.writeFile` (fsp.writeFile with no `recursive` option) THROWS ENOENT in that
    // case. So this port is strictly more permissive than the contract's reference impl — a
    // path bug that fails loudly on desktop could silently create a stray directory tree on
    // Android instead. Tolerated for now because every current FileService call site mkdirs
    // the parent before writing, so this is not exercised in practice; not removed
    // speculatively since this port's semantics are still unverified pending the on-device
    // spike (see dev-fs-port-contract.ts). Worth revisiting once the spike has run.
    //
    // This is also why writeFile is the only method here with no try/catch: with
    // `recursive: true` a missing parent cannot produce the missing-parent ENOENT that
    // `translate()` exists to relabel, so there is nothing for a catch block to translate.
    if (typeof data === 'string') {
      await Filesystem.writeFile({ path, data, encoding: Encoding.UTF8, recursive: true })
      return
    }
    await Filesystem.writeFile({ path, data: bytesToBase64(data), recursive: true })
  }

  async readdir(path: string): Promise<string[]> {
    try {
      const { files } = await Filesystem.readdir({ path })
      return files.map((entry) => entry.name)
    } catch (err) {
      return translate(err, path)
    }
  }

  async rename(from: string, to: string): Promise<void> {
    try {
      await Filesystem.rename({ from, to })
    } catch (err) {
      // Naming only `from` would be a lie when the actual cause is `to`'s parent missing —
      // that path exists. Name both, mirroring Node's own rename ENOENT message shape.
      return translate(err, `${from} -> ${to}`)
    }
  }

  async rm(path: string, opts?: { force?: boolean; recursive?: boolean }): Promise<void> {
    try {
      if (opts?.recursive) {
        // LATENT CONTRACT ASYMMETRY (not correct-by-construction): this routes every
        // `recursive: true` call to `Filesystem.rmdir`, which fails on a regular file, whereas
        // Node's `fsp.rm(file, { recursive: true })` succeeds for a plain file too. No current
        // data-layer call site hits this (every `this.fs.rm` call passes `{ force: true }`
        // only, never `{ recursive: true }` on a file), and the shared contract suite does not
        // exercise it either, so it has never been observed to matter — but it means this port
        // and NodeFsPort disagree here, and that gap is not currently tested.
        await Filesystem.rmdir({ path, recursive: true })
        return
      }
      await Filesystem.deleteFile({ path })
    } catch (err) {
      if (opts?.force && isMissing(err)) return
      return translate(err, path)
    }
  }

  async stat(path: string): Promise<{ size: number; mtimeMs: number; isDirectory: boolean }> {
    try {
      const info = await Filesystem.stat({ path })
      return {
        size: info.size,
        mtimeMs: info.mtime,
        isDirectory: info.type === 'directory'
      }
    } catch (err) {
      return translate(err, path)
    }
  }
}
