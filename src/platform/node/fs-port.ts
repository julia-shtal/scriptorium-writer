/**
 * NodeFsPort — the Electron/Node implementation of {@link FsPort} (MP2).
 *
 * A thin adapter over `node:fs/promises`. The data layer works in forward-slash
 * paths; this adapter is the single boundary that translates them to the OS-native
 * separator (`path.sep`) on the way into Node. It is the only file in the data +
 * platform-node surface that is allowed to import Node built-ins.
 *
 * Error shape: `node:fs` already sets `code === 'ENOENT'` for missing paths, so
 * the port's ENOENT contract (which `FileService.isNotFound` relies on) holds for
 * free — no re-wrapping needed.
 */
import * as fsp from 'node:fs/promises'
import { sep } from 'node:path'
import type { FsPort } from '@data/fs-port'

/** Translate a forward-slash data-layer path to the OS-native separator. */
const toNative = (path: string): string => (sep === '/' ? path : path.replace(/\//g, sep))

export class NodeFsPort implements FsPort {
  async mkdir(path: string, opts: { recursive: true }): Promise<void> {
    await fsp.mkdir(toNative(path), opts)
  }

  async readFile(path: string): Promise<string> {
    return fsp.readFile(toNative(path), 'utf8')
  }

  async readFileBytes(path: string): Promise<Uint8Array> {
    return fsp.readFile(toNative(path))
  }

  async writeFile(path: string, data: string | Uint8Array): Promise<void> {
    // Strings are UTF-8 text (JSON/Markdown canon); binary bytes (e.g. a generated
    // .docx) are written verbatim — no encoding, or Node would re-encode them as UTF-8.
    await fsp.writeFile(toNative(path), data, typeof data === 'string' ? { encoding: 'utf8' } : undefined)
  }

  async readdir(path: string): Promise<string[]> {
    return fsp.readdir(toNative(path))
  }

  async rename(from: string, to: string): Promise<void> {
    await fsp.rename(toNative(from), toNative(to))
  }

  async rm(path: string, opts?: { force?: boolean; recursive?: boolean }): Promise<void> {
    await fsp.rm(toNative(path), opts)
  }

  async stat(path: string): Promise<{ size: number; mtimeMs: number; isDirectory: boolean }> {
    const s = await fsp.stat(toNative(path))
    return { size: s.size, mtimeMs: s.mtimeMs, isDirectory: s.isDirectory() }
  }

  /**
   * Durability barrier: open the file and `fsync` it, matching the atomic-write
   * behaviour before MP2 (which fsynced the temp file's handle before renaming).
   */
  async sync(path: string): Promise<void> {
    const handle = await fsp.open(toNative(path), 'r+')
    try {
      await handle.sync()
    } finally {
      await handle.close()
    }
  }
}
