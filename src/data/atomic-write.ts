/**
 * Atomic file writes — the reliability bedrock (SPEC §5.2, §6).
 *
 * Never write a data file in place. We write to a temp file in the *same* directory,
 * `fsync` it to durable storage, then `rename` over the target. `rename` is atomic on
 * a single volume, so a crash at any point can never corrupt the existing good file:
 * either the old file survives whole, or the new one does. All data writes in the
 * FileService go through this helper.
 */

import type { FsPort } from './fs-port'
import { dirnamePath, joinPath, randomHex } from './path-utils'

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

/**
 * Write `data` to `target` atomically (tmp write + fsync + rename), retrying a
 * transiently-locked rename before giving up (see {@link TRANSIENT_RENAME_CODES}).
 *
 * The filesystem is injected as an {@link FsPort} so this helper stays
 * platform-neutral. `fs.writeFile` is the non-atomic primitive; atomicity comes
 * from writing a same-directory temp then renaming over the target. The fsync
 * step uses the port's optional `sync`: on platforms that omit it (OPFS/Capacitor)
 * the write is still atomic (tmp + rename) but not fsync-durable across power
 * loss — an accepted reduction, not an oversight.
 */
export async function atomicWriteFile(
  fs: FsPort,
  target: string,
  data: string | Uint8Array,
  deps: AtomicWriteDeps = {}
): Promise<void> {
  const rename = deps.rename ?? fs.rename.bind(fs)
  const sleep = deps.sleep ?? defaultSleep
  const dir = dirnamePath(target)
  await fs.mkdir(dir, { recursive: true })

  const tmp = joinPath(dir, `.${randomHex(8)}.tmp`)
  // Strings are UTF-8 text (JSON/Markdown canon); binary bytes (e.g. a generated
  // .docx) are written verbatim — the port handles the string/bytes distinction.
  await fs.writeFile(tmp, data)
  await fs.sync?.(tmp) // fsync (when the platform supports it): flush before rename

  try {
    await renameWithRetry(rename, sleep, tmp, target)
  } catch (err) {
    // Interrupted at/before the swap: the original target is untouched. Remove the
    // orphaned temp so a failed write never litters the library folder.
    await fs.rm(tmp, { force: true })
    throw err
  }
}

async function renameWithRetry(
  rename: (oldPath: string, newPath: string) => Promise<void>,
  sleep: (ms: number) => Promise<void>,
  tmp: string,
  target: string,
  transientCodes: ReadonlySet<string> = TRANSIENT_RENAME_CODES
): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    try {
      await rename(tmp, target)
      return
    } catch (err) {
      const code = (err as NodeJS.ErrnoException | null)?.code
      const transient = code !== undefined && transientCodes.has(code)
      if (!transient || attempt >= MAX_RENAME_ATTEMPTS) throw err
      // Back off a little before retrying: 10ms, 20ms, 40ms … capped at 100ms.
      await sleep(Math.min(10 * 2 ** (attempt - 1), 100))
    }
  }
}

/**
 * For a DIRECTORY target, EEXIST is final, not transient: it means the target folder is
 * occupied (the FsPort contract refuses to rename onto an existing directory), and no
 * amount of waiting frees it.
 */
const TRANSIENT_DIR_RENAME_CODES: ReadonlySet<string> = new Set(
  [...TRANSIENT_RENAME_CODES].filter((c) => c !== 'EEXIST')
)

/**
 * Move a directory with the same transient-lock retry as {@link atomicWriteFile}
 * (M31 import publish and its rollback). Windows Defender, the Search indexer or a
 * sync client often still hold a handle on files written milliseconds ago, so a
 * directory rename right after staging can fail with EPERM/EACCES/EBUSY once and
 * succeed a moment later.
 */
export async function renameDirWithRetry(
  fs: FsPort,
  from: string,
  to: string,
  deps: AtomicWriteDeps = {}
): Promise<void> {
  const rename = deps.rename ?? fs.rename.bind(fs)
  await renameWithRetry(rename, deps.sleep ?? defaultSleep, from, to, TRANSIENT_DIR_RENAME_CODES)
}
