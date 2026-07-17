/**
 * Atomic file writes — the reliability bedrock (SPEC §5.2, §6).
 *
 * Never write a data file in place. We write to a temp file in the *same* directory,
 * `fsync` it to durable storage, then `rename` over the target. `rename` is atomic on
 * a single volume, so a crash at any point can never corrupt the existing good file:
 * either the old file survives whole, or the new one does. All data writes in the
 * FileService go through this helper.
 */

import * as fsp from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { randomBytes } from 'node:crypto'

/** Injectable seams so the rename path (crash + Windows-lock retries) is testable. */
export interface AtomicWriteDeps {
  rename?: (oldPath: string, newPath: string) => Promise<void>
  /** Delay between rename retries; injected as a no-op in tests. */
  sleep?: (ms: number) => Promise<void>
}

/**
 * Rename failures that are typically *transient* on Windows: antivirus real-time
 * scanning, the Search indexer, or a cloud-sync client (OneDrive) briefly holds a
 * handle on the just-written temp/target file, so `rename` fails with one of these
 * even though a retry a few milliseconds later succeeds. A missing directory
 * (ENOENT), a full disk (ENOSPC), or a read-only volume (EROFS) are NOT transient
 * and must fail fast.
 */
const TRANSIENT_RENAME_CODES = new Set(['EPERM', 'EACCES', 'EBUSY', 'EEXIST'])
const MAX_RENAME_ATTEMPTS = 10

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms))

/** Write `data` to `target` atomically (tmp write + fsync + rename), retrying a
 * transiently-locked rename before giving up (see {@link TRANSIENT_RENAME_CODES}). */
export async function atomicWriteFile(
  target: string,
  data: string,
  deps: AtomicWriteDeps = {}
): Promise<void> {
  const rename = deps.rename ?? fsp.rename
  const sleep = deps.sleep ?? defaultSleep
  const dir = dirname(target)
  await fsp.mkdir(dir, { recursive: true })

  const tmp = join(dir, `.${randomBytes(8).toString('hex')}.tmp`)
  let handle: fsp.FileHandle | undefined
  try {
    handle = await fsp.open(tmp, 'w')
    await handle.writeFile(data, 'utf8')
    await handle.sync() // fsync: flush to disk before the rename
  } finally {
    await handle?.close()
  }

  try {
    await renameWithRetry(rename, sleep, tmp, target)
  } catch (err) {
    // Interrupted at/before the swap: the original target is untouched. Remove the
    // orphaned temp so a failed write never litters the library folder.
    await fsp.rm(tmp, { force: true })
    throw err
  }
}

async function renameWithRetry(
  rename: (oldPath: string, newPath: string) => Promise<void>,
  sleep: (ms: number) => Promise<void>,
  tmp: string,
  target: string
): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    try {
      await rename(tmp, target)
      return
    } catch (err) {
      const code = (err as NodeJS.ErrnoException | null)?.code
      const transient = code !== undefined && TRANSIENT_RENAME_CODES.has(code)
      if (!transient || attempt >= MAX_RENAME_ATTEMPTS) throw err
      // Back off a little before retrying: 10ms, 20ms, 40ms … capped at 100ms.
      await sleep(Math.min(10 * 2 ** (attempt - 1), 100))
    }
  }
}
