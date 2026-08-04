/**
 * FsPort — the minimal filesystem surface the data layer needs (MP2).
 *
 * The data layer (FileService, atomicWriteFile) must run unchanged on Electron
 * (Node), the browser (OPFS), and Android (Capacitor). Rather than hard-code
 * `node:fs`, every disk operation flows through this port, which each platform
 * implements once (`NodeFsPort` today; OPFS/Capacitor later). The data layer is
 * thereby platform-neutral: it names no Node built-in.
 *
 * Contract for implementations:
 *  - A missing path MUST reject with an error carrying `code === 'ENOENT'`. The
 *    data layer's `isNotFound()` recovery checks depend on this verbatim.
 *  - `writeFile` is the NON-atomic primitive. Atomicity (tmp + rename) is layered
 *    on top by {@link atomicWriteFile}, which stays platform-neutral.
 *  - Paths are forward-slash separated; a platform adapter translates to its
 *    native separator at its own boundary.
 */
export interface FsPort {
  mkdir(path: string, opts: { recursive: true }): Promise<void>
  /** Read a UTF-8 text file. Rejects with `code === 'ENOENT'` when absent. */
  readFile(path: string): Promise<string>
  /** Read a file's raw bytes (e.g. an imported `.docx`). */
  readFileBytes(path: string): Promise<Uint8Array>
  /** Non-atomic write. Strings are UTF-8 text; bytes are written verbatim. */
  writeFile(path: string, data: string | Uint8Array): Promise<void>
  /** Directory entry names (not full paths). Rejects `ENOENT` when absent. */
  readdir(path: string): Promise<string[]>
  rename(from: string, to: string): Promise<void>
  rm(path: string, opts?: { force?: boolean; recursive?: boolean }): Promise<void>
  stat(path: string): Promise<{ size: number; mtimeMs: number; isDirectory: boolean }>
  /**
   * Optional durability barrier (fsync). Node implements it; OPFS/Capacitor omit
   * it. Where absent, {@link atomicWriteFile} is still atomic (tmp + rename) but
   * not fsync-durable across power loss — an accepted reduction, not an oversight.
   */
  sync?(path: string): Promise<void>
}
