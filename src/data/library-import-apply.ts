/**
 * Library import, write side (M31 spec §Publish protocol). Per story:
 *   1. stage every file under <root>/.import-tmp/<runId>/<finalId>/ with atomicWriteFile;
 *   2. verify the staged copy (sizes + story.json id) before anything visible changes;
 *   3. Replace only: move the local story to .trash/;
 *   4. publish by renaming the staged folder to stories/<finalId>/.
 * A failing story is reported and its staging removed; it never rolls back the others.
 * If step 4 fails after step 3, the trashed local copy is renamed back.
 *
 * Classification and decision validation happen in FileService before this runs, so
 * every PlannedStory here already carries a decision its status allows.
 */
import type { FsPort } from './fs-port'
import type { ImportDecision, ImportStoryStatus, LibraryImportResult, Story } from '@shared/types'
import { AppError, toAppError } from '@shared/errors'
import { atomicWriteFile, renameDirWithRetry } from './atomic-write'
import { joinPath as join, randomHex } from './path-utils'
import { isoSafeTimestamp, layout, makeUniqueStoryId } from './paths'
import type { ParsedStory } from './library-import'

export interface PlannedStory {
  parsed: ParsedStory
  status: ImportStoryStatus
  decision: ImportDecision
  /**
   * The local story this one matched at preview time (identical/conflict). Usually equal
   * to `parsed.id`; differs only in letter case when the ids clash case-insensitively.
   */
  localId?: string
}

export interface ApplyDeps {
  fs: FsPort
  root: string
  /** Story ids present in the library at apply time (not preview time). */
  localIds: string[]
  /** Soft-delete a local story, returning its .trash path. */
  trashStory(id: string): Promise<string>
  language: 'ru' | 'en'
  now: Date
}

const pad = (n: number): string => String(n).padStart(2, '0')

/** « (импорт 09.11.2026)» / « (imported 2026-11-09)» — local date. */
export function importedTitle(title: string, language: 'ru' | 'en', now: Date): string {
  const y = now.getFullYear()
  const m = pad(now.getMonth() + 1)
  const d = pad(now.getDate())
  return language === 'ru' ? `${title} (импорт ${d}.${m}.${y})` : `${title} (imported ${y}-${m}-${d})`
}

const exists = async (fs: FsPort, path: string): Promise<boolean> => {
  try {
    await fs.stat(path)
    return true
  } catch {
    return false
  }
}

async function removeIfEmpty(fs: FsPort, dir: string): Promise<void> {
  if ((await fs.readdir(dir)).length === 0) await fs.rm(dir, { recursive: true, force: true })
}

/** Keep both: the same files with story.json carrying the new id and suffixed title. */
function rewriteStory(files: Map<string, Uint8Array>, id: string, title: string): Map<string, Uint8Array> {
  const meta = files.get('story.json')
  // The parser marks a story without story.json invalid, and invalid stories only allow
  // Skip — so this is unreachable unless that invariant breaks. Fail the story, loudly.
  if (!meta) throw new AppError('INVALID_INPUT', 'story.json missing from a story planned for import')
  const story = JSON.parse(new TextDecoder().decode(meta)) as Story
  const next = new Map(files)
  next.set('story.json', new TextEncoder().encode(JSON.stringify({ ...story, id, title }, null, 2)))
  return next
}

async function stage(fs: FsPort, dir: string, files: Map<string, Uint8Array>): Promise<void> {
  // The folders createStory materialises, so an imported story looks like a native one.
  for (const sub of ['chapters', 'versions', 'notes']) await fs.mkdir(join(dir, sub), { recursive: true })
  for (const [rel, data] of files) await atomicWriteFile(fs, join(dir, rel), data)
}

/** Same rule as native-export: nothing counts as written until it has been read back. */
async function verify(fs: FsPort, dir: string, files: Map<string, Uint8Array>, finalId: string): Promise<void> {
  for (const [rel, data] of files) {
    const { size } = await fs.stat(join(dir, rel))
    if (size !== data.byteLength) {
      throw new AppError('WRITE_FAILED', `staged ${rel} is ${size} of ${data.byteLength} bytes`)
    }
  }
  const story = JSON.parse(await fs.readFile(join(dir, 'story.json'))) as Story
  if (story.id !== finalId) throw new AppError('WRITE_FAILED', `staged story.json has id "${story.id}"`)
}

export async function applyImport(deps: ApplyDeps, plan: PlannedStory[]): Promise<LibraryImportResult> {
  const { fs, root } = deps
  const result: LibraryImportResult = { imported: [], skipped: [], failed: [] }
  const runDir = join(layout.importTmpDir(root), `${isoSafeTimestamp(deps.now)}-${randomHex(3)}`)
  // Keep-both ids must not take a local id, any id arriving in this archive, nor one
  // already assigned in this run. Lower-cased because Windows and Android storage are
  // case-insensitive: "A" in the archive and a generated "a" would be the same folder.
  // (makeUniqueStoryId's slugs are lower-case already, so folding the set is enough.)
  const taken = new Set([...deps.localIds, ...plan.map((p) => p.parsed.id)].map((id) => id.toLowerCase()))

  try {
    await fs.mkdir(layout.storiesDir(root), { recursive: true })
    for (const planned of plan) {
      const { parsed, decision } = planned
      if (decision === 'skip') {
        result.skipped.push(parsed.id)
        continue
      }
      const finalId = decision === 'keepBoth' ? makeUniqueStoryId(parsed.incoming.title, [...taken]) : parsed.id
      taken.add(finalId.toLowerCase())
      const stageDir = join(runDir, finalId)
      const target = layout.storyDir(root, finalId)
      try {
        const files =
          decision === 'keepBoth'
            ? rewriteStory(parsed.files, finalId, importedTitle(parsed.incoming.title, deps.language, deps.now))
            : parsed.files
        await stage(fs, stageDir, files)
        await verify(fs, stageDir, files, finalId)
        // Replace trashes the LOCAL folder, which preview may have matched case-
        // insensitively (archive "A" vs local "a"), so it can differ from parsed.id.
        const localId = planned.localId ?? parsed.id
        const trashedAt = decision === 'replace' ? await deps.trashStory(localId) : null
        // Publish. On Node and on OPFS with native directory move() this rename is atomic.
        // KNOWN CAVEAT (Task 1): an OPFS engine without directory move() falls back to
        // copy-then-rm, so a crash or failure mid-copy can leave a PARTIAL story in
        // stories/<finalId>/. Not engineered around here: the post-import scanLibrary
        // surfaces its missing chapters for recovery, the staged source is dropped at the
        // next boot, and the archive is still on disk to import again.
        try {
          if (await exists(fs, target)) {
            // Never publish over a story. For Import / Keep both this is a folder that
            // appeared after the preview (or a case-only clash the preview could not see);
            // for Replace, one still there after the local copy went to .trash. The ports
            // also refuse a directory rename onto an existing target (EEXIST), but Node on
            // POSIX would silently replace an EMPTY directory, so the check stays here.
            throw new AppError(
              'ALREADY_EXISTS',
              `stories/${finalId} already exists in the library — an import never publishes over a story`
            )
          }
          await renameDirWithRetry(fs, stageDir, target)
        } catch (publishErr) {
          if (trashedAt) {
            try {
              await renameDirWithRetry(fs, trashedAt, layout.storyDir(root, localId))
            } catch {
              // A partial publish (OPFS fallback above) can occupy the target. The local
              // copy is still whole in .trash; say exactly where, never hide it.
              throw new AppError(
                'WRITE_FAILED',
                `${toAppError(publishErr).message}; the local copy could not be put back and is in ${trashedAt}`,
                { cause: publishErr }
              )
            }
          }
          throw publishErr
        }
        result.imported.push({ id: parsed.id, finalId, decision })
      } catch (err) {
        result.failed.push({ id: parsed.id, reason: toAppError(err).message })
        await fs.rm(stageDir, { recursive: true, force: true }).catch(() => {})
      }
    }
  } finally {
    // Best effort: whatever survives is wiped by ensureLibrary at the next boot.
    await fs.rm(runDir, { recursive: true, force: true }).catch(() => {})
    // Drop .import-tmp itself only when empty, so this run does not remove another run's
    // staging (a second PWA tab). Best effort, not a guarantee: a run can start between
    // the readdir and the rm, and the other tab's boot-time ensureLibrary wipes it anyway.
    await removeIfEmpty(fs, layout.importTmpDir(root)).catch(() => {})
  }
  return result
}
