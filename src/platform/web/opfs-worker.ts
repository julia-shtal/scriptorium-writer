/**
 * OPFS write worker (MP4).
 *
 * The reliable OPFS write path — `FileSystemFileHandle.createSyncAccessHandle()` —
 * is only available inside a Worker. This module worker hosts every `writeFile`:
 * the main-thread {@link OpfsFsPort} posts the target path + bytes, the worker
 * opens a sync access handle, writes, `flush()`es (durability lives here — see the
 * port header), and `close()`s.
 *
 * Protocol (see {@link WriteRequest} / {@link WriteResponse}):
 *  - main → worker: `{ id, op: 'write', path, buffer }` (buffer is TRANSFERRED)
 *  - worker → main: `{ id, type: 'ok' }` on success, or
 *                   `{ id, type: 'error', error: { name, message } }` on failure.
 *    The port matches replies by `id` and translates `error.name`
 *    (`QuotaExceededError` → STORAGE_FULL, `NotFoundError` → ENOENT).
 *
 * Per-path serialization: two concurrent `createSyncAccessHandle()` calls on the
 * SAME file throw `NoModificationAllowedError` (an autosave debounce overlapping a
 * manual Save makes this real, not theoretical). We keep a `Map<path, Promise>`
 * tail per path and chain each write onto its predecessor, so same-path writes run
 * strictly in order while different-path writes still proceed in parallel.
 *
 * Browser-only: NO `node:` imports here.
 */

/** Main → worker write request. `buffer` is transferred (zero-copy). */
export interface WriteRequest {
  id: number
  op: 'write'
  path: string
  buffer: ArrayBuffer
}

/** Worker → main reply, matched to a request by `id`. Discriminated on `type`. */
export type WriteResponse =
  | { id: number; type: 'ok' }
  | { id: number; type: 'error'; error: { name: string; message: string } }

/** Split a `/`-path into non-empty segments (leading/trailing slashes dropped). */
function segments(path: string): string[] {
  return path.split('/').filter((s) => s !== '')
}

/**
 * Resolve (creating along the way) the parent directory chain of `path` and return
 * the parent handle plus the final basename. Every intermediate directory is
 * created because a write must be able to materialise its whole target chain.
 */
async function resolveParentForWrite(
  path: string
): Promise<{ parent: FileSystemDirectoryHandle; name: string }> {
  const parts = segments(path)
  if (parts.length === 0) {
    throw Object.assign(new Error(`cannot write to a directory path: '${path}'`), {
      name: 'InvalidPath'
    })
  }
  const name = parts[parts.length - 1]!
  let dir = await navigator.storage.getDirectory()
  for (let i = 0; i < parts.length - 1; i++) {
    dir = await dir.getDirectoryHandle(parts[i]!, { create: true })
  }
  return { parent: dir, name }
}

/** Perform one write: create the file, then sync-write + flush + close it. */
async function writeOne(path: string, buffer: ArrayBuffer): Promise<void> {
  const { parent, name } = await resolveParentForWrite(path)
  const fileHandle = await parent.getFileHandle(name, { create: true })
  const handle = await fileHandle.createSyncAccessHandle()
  try {
    handle.truncate(0)
    handle.write(new Uint8Array(buffer), { at: 0 })
    // Durability barrier per write — OPFS has no separate `sync` op, so each
    // writeFile is made durable here. This is what keeps atomicWriteFile's
    // tmp + rename atomic on OPFS.
    handle.flush()
  } finally {
    // Always close, even on throw: a leaked sync access handle blocks ALL future
    // writes to this file.
    handle.close()
  }
}

/**
 * Per-path serialization tails. Each entry is the promise for the last-enqueued
 * write to that path; the next write chains onto it. Cleared once the tail drains
 * so the map does not grow unbounded.
 */
const chains = new Map<string, Promise<void>>()

function enqueue(path: string, buffer: ArrayBuffer): Promise<void> {
  const prev = chains.get(path) ?? Promise.resolve()
  // Chain regardless of whether the predecessor rejected (`.catch` swallows its
  // result here; the individual op's own rejection is still surfaced via `next`).
  const next = prev.then(
    () => writeOne(path, buffer),
    () => writeOne(path, buffer)
  )
  chains.set(path, next)
  // When this write is the tail, drop the map entry to avoid unbounded growth.
  const cleanup = (): void => {
    if (chains.get(path) === next) chains.delete(path)
  }
  next.then(cleanup, cleanup)
  return next
}

self.onmessage = (event: MessageEvent<WriteRequest>): void => {
  const req = event.data
  if (!req || req.op !== 'write') return
  enqueue(req.path, req.buffer).then(
    () => {
      const res: WriteResponse = { id: req.id, type: 'ok' }
      ;(self as DedicatedWorkerGlobalScope).postMessage(res)
    },
    (err: unknown) => {
      const e = err as { name?: unknown; message?: unknown }
      const res: WriteResponse = {
        id: req.id,
        type: 'error',
        error: {
          name: typeof e?.name === 'string' ? e.name : 'Error',
          message: typeof e?.message === 'string' ? e.message : String(err)
        }
      }
      ;(self as DedicatedWorkerGlobalScope).postMessage(res)
    }
  )
}
