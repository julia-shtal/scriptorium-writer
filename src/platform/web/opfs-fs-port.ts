/**
 * OpfsFsPort — the browser implementation of {@link FsPort} over the Origin
 * Private File System (MP4).
 *
 * Persistent, per-origin storage that survives reloads (unlike the MemoryFsPort
 * scaffolding it replaces in MP4 Task 3). This port is browser-only: NO `node:`
 * imports anywhere in this file or its worker.
 *
 * Division of labour:
 *  - READS (`readFile`, `readFileBytes`, `readdir`, `stat`) and dir ops (`mkdir`,
 *    `rm`, `rename`) run on the MAIN thread — no write contention there.
 *  - WRITES (`writeFile`) are delegated to {@link ./opfs-worker.ts}, because the
 *    reliable OPFS write path (`createSyncAccessHandle`) exists only in a worker.
 *    Strings are UTF-8 encoded and the buffer is transferred to the worker.
 *
 * Durability model: OPFS has no separate fsync barrier, so this port DELIBERATELY
 * omits the optional `sync()`. Instead the worker `flush()`es each sync access
 * handle before `close()`, making every `writeFile` durable on its own. That keeps
 * {@link atomicWriteFile}'s tmp-write + rename atomic here — the tmp file is
 * durable before the rename swaps it over the target.
 *
 * Path creation policy (CRITICAL): a directory chain is created ONLY where the
 * semantics demand it — `mkdir` (whole chain) and the parent chain of a
 * `writeFile` (done inside the worker). Reads NEVER pass `{ create: true }`, so a
 * missing path surfaces as missing (ENOENT); `FileService.scanLibrary`'s recovery
 * scan relies on reads not silently materialising empty directories.
 *
 * Error translation (CRITICAL): OPFS raises `DOMException`s. `NotFoundError` is
 * re-thrown as an error carrying `code === 'ENOENT'` (verbatim what
 * `FileService.isNotFound` checks). `QuotaExceededError` becomes
 * `AppError('STORAGE_FULL', …)` so a failed save is loud, never swallowed.
 */
import type { FsPort } from '@data/fs-port'
import { AppError } from '@shared/errors'
import type { WriteRequest, WriteResponse } from './opfs-worker'

/** Error carrying the `code === 'ENOENT'` shape the data layer checks. */
function enoent(path: string): Error & { code: string } {
  return Object.assign(new Error(`ENOENT: no such file or directory, '${path}'`), {
    code: 'ENOENT'
  })
}

/** True for the OPFS "entry does not exist" DOMException. */
function isNotFoundError(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'NotFoundError'
}

/**
 * True for the OPFS "wrong entry kind" DOMException: raised when `getFileHandle`
 * hits a directory (or `getDirectoryHandle` hits a file). During a stat we probe
 * file-then-directory, so this means "not that kind — try the other".
 */
function isTypeMismatchError(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'TypeMismatchError'
}

/** Split a `/`-path into non-empty segments (leading/trailing slashes dropped). */
function segments(path: string): string[] {
  return path.split('/').filter((s) => s !== '')
}

const opfsRoot = (): Promise<FileSystemDirectoryHandle> => navigator.storage.getDirectory()

/**
 * Per-write timeout. Chapter JSON is a few KB, so a healthy worker replies in
 * single-digit milliseconds; this window only ever fires on a genuinely stuck or
 * dead worker, converting a silent hang into a loud WRITE_FAILED.
 */
const WRITE_TIMEOUT_MS = 30_000

interface PendingWrite {
  resolve: () => void
  reject: (err: unknown) => void
  path: string
  timer: ReturnType<typeof setTimeout>
}

export class OpfsFsPort implements FsPort {
  private worker: Worker | null = null
  private nextId = 1
  private readonly pending = new Map<number, PendingWrite>()

  /**
   * Resolve a directory handle by walking `/`-segments from the OPFS root. With
   * `create: false` (reads/dir-ops) a missing segment throws NotFoundError, which
   * callers translate to ENOENT. The root path (`/`, or empty) returns the root.
   */
  private async resolveDir(path: string, create: boolean): Promise<FileSystemDirectoryHandle> {
    let dir = await opfsRoot()
    for (const name of segments(path)) {
      dir = await dir.getDirectoryHandle(name, { create })
    }
    return dir
  }

  /**
   * Resolve the parent directory handle + basename for a file path (no creation).
   * A path with no segments (root) has no file basename and is rejected.
   */
  private async resolveParent(
    path: string,
    create: boolean
  ): Promise<{ parent: FileSystemDirectoryHandle; name: string }> {
    const parts = segments(path)
    if (parts.length === 0) throw enoent(path)
    const name = parts[parts.length - 1]!
    const parent = await this.resolveDir(parts.slice(0, -1).join('/'), create)
    return { parent, name }
  }

  private getWorker(): Worker {
    if (!this.worker) {
      const worker = new Worker(new URL('./opfs-worker.ts', import.meta.url), { type: 'module' })
      worker.onmessage = (event: MessageEvent<WriteResponse>): void => {
        const res = event.data
        const entry = this.pending.get(res.id)
        if (!entry) return
        this.pending.delete(res.id)
        clearTimeout(entry.timer)
        if (res.type === 'ok') {
          entry.resolve()
          return
        }
        entry.reject(this.translateWorkerError(res.error, entry.path))
      }
      // A dead worker (failed module load, top-level throw, browser-terminated) or a
      // reply that fails structured-clone would otherwise leave pending writes
      // unsettled forever — a save that silently never completes. Reject ALL
      // pending writes and discard the worker so the next writeFile re-spawns a
      // fresh one; never leave a dead worker wired up.
      const onFatal = (detail: string): void => {
        this.failAllPending(new AppError('WRITE_FAILED', `OPFS write worker failed: ${detail}`))
        if (this.worker === worker) this.worker = null
        worker.terminate()
      }
      worker.onerror = (event: ErrorEvent): void => {
        onFatal(event.message || 'worker error')
      }
      worker.onmessageerror = (): void => {
        onFatal('worker message deserialization failed')
      }
      this.worker = worker
    }
    return this.worker
  }

  /** Reject every outstanding write with `err` and clear the pending map + timers. */
  private failAllPending(err: unknown): void {
    for (const entry of this.pending.values()) {
      clearTimeout(entry.timer)
      entry.reject(err)
    }
    this.pending.clear()
  }

  /** Translate a worker-reported `{ name, message }` into a typed port error. */
  private translateWorkerError(error: { name: string; message: string }, path: string): unknown {
    if (error.name === 'QuotaExceededError') {
      return new AppError('STORAGE_FULL', `storage quota exceeded writing '${path}'`)
    }
    if (error.name === 'NotFoundError') {
      return enoent(path)
    }
    return new Error(error.message || `write failed for '${path}'`)
  }

  async mkdir(path: string, _opts: { recursive: true }): Promise<void> {
    // Walk-and-create the whole chain; getDirectoryHandle({create:true}) is a
    // no-op on an existing dir, so this is idempotent (recursive semantics).
    await this.resolveDir(path, true)
  }

  async readFile(path: string): Promise<string> {
    const bytes = await this.readFileBytes(path)
    return new TextDecoder('utf-8').decode(bytes)
  }

  async readFileBytes(path: string): Promise<Uint8Array> {
    try {
      const { parent, name } = await this.resolveParent(path, false)
      const fileHandle = await parent.getFileHandle(name, { create: false })
      const file = await fileHandle.getFile()
      return new Uint8Array(await file.arrayBuffer())
    } catch (err) {
      if (isNotFoundError(err)) throw enoent(path)
      throw err
    }
  }

  async writeFile(path: string, data: string | Uint8Array): Promise<void> {
    const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data
    // Copy into a fresh, transferable ArrayBuffer sized exactly to the data (a
    // Uint8Array may be a view over a larger buffer; transferring its whole buffer
    // would be wrong and would neuter the caller's memory).
    const buffer = new ArrayBuffer(bytes.byteLength)
    new Uint8Array(buffer).set(bytes)

    const id = this.nextId++
    const worker = this.getWorker()
    return new Promise<void>((resolve, reject) => {
      // Defense-in-depth: if the reply never arrives (stuck/dead worker that did
      // not fire onerror), fail loudly rather than hang the save forever.
      const timer = setTimeout(() => {
        if (this.pending.delete(id)) {
          reject(new AppError('WRITE_FAILED', `OPFS write timed out for '${path}'`))
        }
      }, WRITE_TIMEOUT_MS)
      this.pending.set(id, { resolve, reject, path, timer })
      const req: WriteRequest = { id, op: 'write', path, buffer }
      worker.postMessage(req, [buffer])
    })
  }

  async readdir(path: string): Promise<string[]> {
    try {
      const dir = await this.resolveDir(path, false)
      const names: string[] = []
      for await (const name of dir.keys()) names.push(name)
      return names
    } catch (err) {
      if (isNotFoundError(err)) throw enoent(path)
      throw err
    }
  }

  async rename(from: string, to: string): Promise<void> {
    let fileHandle: FileSystemFileHandle
    try {
      const src = await this.resolveParent(from, false)
      fileHandle = await src.parent.getFileHandle(src.name, { create: false })
    } catch (err) {
      if (isNotFoundError(err)) throw enoent(from)
      throw err
    }

    // Ensure the destination parent chain exists before moving into it.
    const dst = await this.resolveParent(to, true)

    // Overwrite semantics: the contract renames over an existing target, and
    // atomicWriteFile depends on rename(tmp, target) being atomic — either the old
    // target survives whole or the new one does, never a gap where the target is
    // gone and the data lives only in the .tmp file. On Chrome (the target
    // platform) FileSystemFileHandle.move() ALREADY overwrites the destination
    // atomically, so we attempt it directly — no destructive pre-remove.
    try {
      await fileHandle.move(dst.parent, dst.name)
    } catch (err) {
      // Fallback only if an engine's move() refuses to overwrite an existing
      // destination (raised as TypeMismatchError / InvalidModificationError).
      // WARNING: this remove-then-move path is NON-ATOMIC — a crash between the
      // two steps loses the target while the new data still lives in the .tmp
      // file. It is strictly weaker than the Node rename path and exists only as a
      // compatibility fallback; Chrome never reaches it.
      const name = err instanceof DOMException ? err.name : ''
      if (name === 'TypeMismatchError' || name === 'InvalidModificationError') {
        await dst.parent.removeEntry(dst.name)
        await fileHandle.move(dst.parent, dst.name)
      } else {
        throw err
      }
    }
  }

  async rm(path: string, opts?: { force?: boolean; recursive?: boolean }): Promise<void> {
    let parent: FileSystemDirectoryHandle
    let name: string
    try {
      const resolved = await this.resolveParent(path, false)
      parent = resolved.parent
      name = resolved.name
    } catch (err) {
      // Missing ancestor: treat as a missing target.
      if (isNotFoundError(err) || (err as { code?: string })?.code === 'ENOENT') {
        if (opts?.force) return
        throw enoent(path)
      }
      throw err
    }

    try {
      await parent.removeEntry(name, { recursive: opts?.recursive ?? false })
    } catch (err) {
      if (isNotFoundError(err)) {
        if (opts?.force) return
        throw enoent(path)
      }
      throw err
    }
  }

  async stat(path: string): Promise<{ size: number; mtimeMs: number; isDirectory: boolean }> {
    const parts = segments(path)
    // Root is a directory.
    if (parts.length === 0) {
      await opfsRoot()
      return { size: 0, mtimeMs: Date.now(), isDirectory: true }
    }

    const name = parts[parts.length - 1]!
    let parent: FileSystemDirectoryHandle
    try {
      parent = await this.resolveDir(parts.slice(0, -1).join('/'), false)
    } catch (err) {
      if (isNotFoundError(err)) throw enoent(path)
      throw err
    }

    // Try file first, then directory. OPFS has no single "stat"; the entry is one
    // or the other. Whichever resolves wins; if neither does, it is missing.
    try {
      const fileHandle = await parent.getFileHandle(name, { create: false })
      const file = await fileHandle.getFile()
      return { size: file.size, mtimeMs: file.lastModified, isDirectory: false }
    } catch (err) {
      // NotFoundError: no such entry (yet — could still be a dir below).
      // TypeMismatchError: the entry IS a directory, not a file — fall through.
      if (!isNotFoundError(err) && !isTypeMismatchError(err)) throw err
    }

    try {
      await parent.getDirectoryHandle(name, { create: false })
      return { size: 0, mtimeMs: Date.now(), isDirectory: true }
    } catch (err) {
      if (isNotFoundError(err)) throw enoent(path)
      throw err
    }
  }
}
