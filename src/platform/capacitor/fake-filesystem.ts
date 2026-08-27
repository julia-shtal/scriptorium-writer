/**
 * Fake @capacitor/filesystem plugin surface, used by fs-port.test.ts (`vi.mock`) to run the
 * shared FsPort contract suite against `CapacitorFsPort` without a device.
 *
 * This mirrors behaviour observed on device on 2026-08-25, not a specification of the plugin.
 * Where the device disagrees with this file, the device is right.
 *
 * Observed facts this fake encodes (device: @capacitor/filesystem 8.1.3, 10/10 contract cases
 * passed):
 *  - `mkdir({ recursive: true })` on an EXISTING directory THROWS OS-PLUG-FILE-0010, verbatim
 *    message shape `Directory at '<path>/' already exists, cannot be overwritten.` — it does
 *    NOT silently succeed the way Node's `{ recursive: true }` does. See the comment on
 *    `mkdir` below: do not "fix" this into idempotent success.
 *  - Absolute, scheme-less paths are accepted by every operation (no Directory param).
 *  - `rename` overwrites an existing target successfully.
 *  - The plugin's missing-entry code is inside the {0008, 0011} whitelist `fs-port.ts`
 *    translates to ENOENT.
 *  - 0007 (permission denied) was never exercised on device (needs a denied Documents
 *    permission — MC3's scope). The `denied` set below is this project's ONLY coverage of
 *    that path; see fs-port.test.ts's whitelist regression test.
 *  - `getUri()` returns `file://` URIs; resolved DIRECTORY roots came back WITH a trailing
 *    slash (e.g. `file:///storage/emulated/0/Documents/Scriptorium-Writer/`). Files are not
 *    observed to carry one.
 *
 * A handful of details below are NOT device-observed — they are invented only so this fake
 * behaves consistently with itself. Each is labelled `NOT OBSERVED` at its definition. Do not
 * let an invented detail read as fact: that is exactly how a fake quietly becomes the spec
 * future readers trust instead of the device.
 *
 * Result shapes returned match the plugin's real types (`ReadFileResult`, `ReaddirResult`,
 * `StatResult`/`FileInfo`, `GetUriResult`) — see the imported types below, which are the same
 * ones `fs-port.ts` and the real plugin share.
 */
import {
  Directory,
  type DeleteFileOptions,
  type FileInfo,
  type GetUriOptions,
  type GetUriResult,
  type MkdirOptions,
  type ReaddirOptions,
  type ReaddirResult,
  type ReadFileOptions,
  type ReadFileResult,
  type RenameOptions,
  type RmdirOptions,
  type StatOptions,
  type StatResult,
  type WriteFileOptions,
  type WriteFileResult
} from '@capacitor/filesystem'

// Deliberately NOT imported from `./error-codes`, even though the three codes below are the
// exact same strings as CODE_NOT_FOUND / CODE_MISSING_PARENT / CODE_DIR_EXISTS there. That
// duplication is intentional, not an oversight a DRY pass should "fix": this fake stands in
// for an EXTERNAL system (the real plugin), and `fs-port.ts` encodes our READING of that
// external system's behaviour. If both sides imported the same constants, the whitelist test
// in fs-port.test.ts would stop testing anything — a typo'd code in error-codes.ts would
// silently "pass" against a fake built from the same typo, instead of catching the mismatch
// against what the fake independently asserts the device actually said. Keep these literal.
const CODES = {
  notFound: 'OS-PLUG-FILE-0008',
  permissionDenied: 'OS-PLUG-FILE-0007',
  dirExists: 'OS-PLUG-FILE-0010',
  missingParent: 'OS-PLUG-FILE-0011',
  // NOT OBSERVED — invented for internal consistency only: never asserted by any contract
  // case, and the device spike never exercised rmdir on a non-empty directory. Used here only
  // so that case has SOME distinct code rather than silently succeeding, in case a future case
  // exercises it. Do not treat this value as a confirmed plugin behaviour.
  notEmpty: 'OS-PLUG-FILE-0009',
  // NOT OBSERVED — invented. The real plugin's web implementation throws for Blob data
  // (native never does — see writeFile below), but the device spike never exercised this
  // path and this exact code is a guess, not a device reading.
  unsupportedData: 'OS-PLUG-FILE-0013'
} as const

function pluginError(code: string, message: string): Error & { code: string } {
  return Object.assign(new Error(message), { code })
}

/** Parent of an absolute, `/`-separated path with no trailing slash. Root's parent is itself. */
function parentOf(path: string): string {
  const idx = path.lastIndexOf('/')
  return idx <= 0 ? '/' : path.slice(0, idx)
}

/** Final path component. */
function nameOf(path: string): string {
  const idx = path.lastIndexOf('/')
  return idx === -1 ? path : path.slice(idx + 1)
}

/** Materialise every ancestor of `path`, matching `Filesystem.mkdir({ recursive: true })`. */
function materialise(dirs: Set<string>, path: string): void {
  const parts = path.split('/').filter(Boolean)
  for (let i = 1; i <= parts.length; i += 1) dirs.add(`/${parts.slice(0, i).join('/')}`)
}

/**
 * NOT OBSERVED — invented synthetic root for a `Directory` enum member. The real plugin gives
 * each `Directory` a real, distinct absolute root on device (`roots.ts`'s whole job is
 * resolving those); this fake only needs each `Directory` to map to a distinct, stable,
 * absolute-looking root so two different `Directory` values can never collide on the same
 * relative `path` — which is exactly the bug this fix closes (see the file header of
 * fs-port.ts: `CapacitorFsPort` never passes `directory`, but `roots.ts`'s `resolveRoot` always
 * does, with a bare relative `path`).
 */
function directoryRoot(directory: Directory): string {
  return `/fake-root/${directory}`
}

/**
 * Resolve a `{ path, directory }` pair to the single absolute path this fake uses as its
 * identity key everywhere (`dirs` / `files`).
 *
 * `CapacitorFsPort` (fs-port.ts) always omits `directory` and passes an already-absolute
 * path — every contract case exercises exactly that shape. `roots.ts`'s `resolveRoot` is the
 * one caller in this codebase that supplies `directory` together with a bare relative `path`
 * (e.g. `{ directory: Directory.Documents, path: 'Scriptorium-Writer' }`).
 *
 * A relative path with no `directory` is refused rather than silently tolerated. The previous
 * version of this fake tolerated it, and that tolerance was the bug: `mkdir`'s existence check
 * read the raw relative `path` while its ancestor materialisation always produced an
 * absolute-looking string, so the two could never agree — a repeat `mkdir` on the same
 * directory silently succeeded instead of reproducing the device's 0010. Routing every path
 * through this one function keeps the existence check and the materialisation looking at the
 * same string by construction. The real plugin is never given a relative, directory-less path
 * by this port, so seeing one here is a test bug worth failing on immediately, not a case to
 * support quietly.
 */
function resolvePath(path: string, directory?: Directory): string {
  if (directory !== undefined) {
    const root = directoryRoot(directory)
    return path ? `${root}/${path}` : root
  }
  if (!path.startsWith('/')) {
    throw new Error(
      `FakeFilesystem: relative path '${path}' given with no directory. CapacitorFsPort always ` +
        'passes an absolute path when it omits directory, so this is almost certainly a test bug.'
    )
  }
  return path
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

export class FakeFilesystem {
  private readonly files = new Map<string, Uint8Array>()
  private readonly dirs = new Set<string>(['/fake'])
  /** Paths configured to reject with 0007, so the whitelist can be tested. */
  readonly denied = new Set<string>()

  private guard(path: string): void {
    if (this.denied.has(path)) throw pluginError(CODES.permissionDenied, `denied: ${path}`)
  }

  async mkdir({ path, directory, recursive }: MkdirOptions): Promise<void> {
    const resolved = resolvePath(path, directory)
    this.guard(resolved)
    // OBSERVED ON DEVICE 2026-08-25 (@capacitor/filesystem 8.1.3): mkdir on an existing
    // directory THROWS 0010 even with recursive: true, verbatim:
    //   "Directory at '<path>/' already exists, cannot be overwritten."
    // This diverges from Node, where { recursive: true } is silently idempotent. Do NOT
    // change this into idempotent success — CapacitorFsPort.mkdir's swallow of 0010 depends
    // on the plugin actually throwing here.
    if (this.dirs.has(resolved)) {
      throw pluginError(CODES.dirExists, `Directory at '${resolved}/' already exists, cannot be overwritten.`)
    }
    const parent = parentOf(resolved)
    if (!recursive && parent !== '/' && !this.dirs.has(parent)) {
      throw pluginError(CODES.missingParent, `missing parent: ${resolved}`)
    }
    materialise(this.dirs, resolved)
  }

  async readFile({ path, directory, encoding }: ReadFileOptions): Promise<ReadFileResult> {
    const resolved = resolvePath(path, directory)
    this.guard(resolved)
    const bytes = this.files.get(resolved)
    if (!bytes) throw pluginError(CODES.notFound, `not found: ${resolved}`)
    // Observed/documented plugin behaviour: UTF8 encoding returns a string; no encoding
    // returns base64. (Blob is web-only, never seen on native — see writeFile below.)
    if (encoding) return { data: new TextDecoder().decode(bytes) }
    return { data: bytesToBase64(bytes) }
  }

  async writeFile({ path, directory, data, encoding, recursive }: WriteFileOptions): Promise<WriteFileResult> {
    const resolved = resolvePath(path, directory)
    this.guard(resolved)
    const parent = parentOf(resolved)
    if (!this.dirs.has(parent)) {
      if (!recursive) throw pluginError(CODES.missingParent, `missing parent: ${resolved}`)
      // Mirrors the divergence documented on CapacitorFsPort.writeFile: recursive: true
      // silently materialises the parent tree (not spike-verified; see that comment).
      materialise(this.dirs, parent)
    }
    if (typeof data !== 'string') {
      // Blob is web-only per the plugin's own types; CapacitorFsPort never constructs one.
      // NOT OBSERVED — see CODES.unsupportedData above: the code is a guess, not a device
      // reading, since this path is never reachable through CapacitorFsPort.
      throw pluginError(CODES.unsupportedData, 'FakeFilesystem only accepts string data (native shape)')
    }
    const bytes = encoding ? new TextEncoder().encode(data) : base64ToBytes(data)
    this.files.set(resolved, bytes)
    return { uri: `file://${resolved}` }
  }

  async readdir({ path, directory }: ReaddirOptions): Promise<ReaddirResult> {
    const resolved = resolvePath(path, directory)
    this.guard(resolved)
    if (!this.dirs.has(resolved)) throw pluginError(CODES.notFound, `not found: ${resolved}`)
    const files: FileInfo[] = []
    for (const [filePath, bytes] of this.files) {
      if (parentOf(filePath) === resolved) {
        files.push({
          name: nameOf(filePath),
          type: 'file',
          size: bytes.length,
          mtime: Date.now(),
          uri: `file://${filePath}`
        })
      }
    }
    for (const dirPath of this.dirs) {
      if (dirPath !== resolved && parentOf(dirPath) === resolved) {
        files.push({ name: nameOf(dirPath), type: 'directory', size: 0, mtime: Date.now(), uri: `file://${dirPath}` })
      }
    }
    return { files }
  }

  async rename({ from, to, directory, toDirectory }: RenameOptions): Promise<void> {
    const resolvedFrom = resolvePath(from, directory)
    const resolvedTo = resolvePath(to, toDirectory ?? directory)
    this.guard(resolvedFrom)
    this.guard(resolvedTo)
    const bytes = this.files.get(resolvedFrom)
    if (bytes) {
      // Observed on device 2026-08-25: rename overwrites an existing target successfully.
      this.files.set(resolvedTo, bytes)
      this.files.delete(resolvedFrom)
      return
    }
    if (this.dirs.has(resolvedFrom)) {
      const prefix = `${resolvedFrom}/`
      this.dirs.delete(resolvedFrom)
      this.dirs.add(resolvedTo)
      for (const [filePath, fileBytes] of [...this.files]) {
        if (filePath.startsWith(prefix)) {
          this.files.set(`${resolvedTo}${filePath.slice(resolvedFrom.length)}`, fileBytes)
          this.files.delete(filePath)
        }
      }
      for (const dirPath of [...this.dirs]) {
        if (dirPath.startsWith(prefix)) {
          this.dirs.add(`${resolvedTo}${dirPath.slice(resolvedFrom.length)}`)
          this.dirs.delete(dirPath)
        }
      }
      return
    }
    throw pluginError(CODES.notFound, `not found: ${resolvedFrom}`)
  }

  async deleteFile({ path, directory }: DeleteFileOptions): Promise<void> {
    const resolved = resolvePath(path, directory)
    this.guard(resolved)
    if (!this.files.has(resolved)) throw pluginError(CODES.notFound, `not found: ${resolved}`)
    this.files.delete(resolved)
  }

  async rmdir({ path, directory, recursive }: RmdirOptions): Promise<void> {
    const resolved = resolvePath(path, directory)
    this.guard(resolved)
    // NOT OBSERVED — invented for internal consistency: rmdir on a plain FILE returning 0008
    // ("not found", as if the directory simply weren't there) is a guess, not a device
    // reading. The spike never exercised rmdir against a file path.
    if (!this.dirs.has(resolved)) throw pluginError(CODES.notFound, `not found: ${resolved}`)
    const prefix = `${resolved}/`
    const childDirs = [...this.dirs].filter((d) => d.startsWith(prefix))
    const childFiles = [...this.files.keys()].filter((f) => f.startsWith(prefix))
    if (!recursive && (childDirs.length > 0 || childFiles.length > 0)) {
      // NOT OBSERVED — invented for internal consistency; see CODES.notEmpty above.
      throw pluginError(CODES.notEmpty, `directory not empty: ${resolved}`)
    }
    for (const d of childDirs) this.dirs.delete(d)
    for (const f of childFiles) this.files.delete(f)
    this.dirs.delete(resolved)
  }

  async stat({ path, directory }: StatOptions): Promise<StatResult> {
    const resolved = resolvePath(path, directory)
    this.guard(resolved)
    if (this.dirs.has(resolved)) {
      return { name: nameOf(resolved), type: 'directory', size: 0, mtime: Date.now(), uri: `file://${resolved}` }
    }
    const bytes = this.files.get(resolved)
    if (bytes) return { name: nameOf(resolved), type: 'file', size: bytes.length, mtime: Date.now(), uri: `file://${resolved}` }
    throw pluginError(CODES.notFound, `not found: ${resolved}`)
  }

  async getUri({ path, directory }: GetUriOptions): Promise<GetUriResult> {
    const resolved = resolvePath(path, directory)
    this.guard(resolved)
    // OBSERVED ON DEVICE 2026-08-25: resolved DIRECTORY roots came back WITH a trailing slash
    // (e.g. `file:///storage/emulated/0/Documents/Scriptorium-Writer/`); files are not observed
    // to carry one. A path that is neither a known file nor a known directory (not observed —
    // getUri is only ever called on device after the corresponding mkdir succeeded) gets no
    // trailing slash, matching the file case, since there is nothing to infer it from.
    const trailingSlash = this.dirs.has(resolved) ? '/' : ''
    return { uri: `file://${resolved}${trailingSlash}` }
  }
}
