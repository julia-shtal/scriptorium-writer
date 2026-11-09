/**
 * Renderer side of M31 apply (spec §Editor safety): flush the editor through the same path
 * as quit-flush, close a story that is about to be replaced, apply, reopen it, re-scan.
 * The scan result is returned, not stored: the dialog hands it to RecoveryDialog only once
 * the writer has closed the import result, so the two never stack.
 */
import type { ChapterRecovery, ImportDecision, LibraryImportResult } from '@shared/types'
import { api } from '@renderer/platform'
import { useEditorStore } from '@renderer/store/editorStore'
import { useStoryStore } from '@renderer/store/storyStore'

export interface LibraryImportOutcome {
  result: LibraryImportResult
  /** Chapters the post-import scan flagged; [] when there are none or the scan failed. */
  recoveries: ChapterRecovery[]
}

/** Thrown before anything is written when the open chapter could not be saved. */
export class UnsavedChangesError extends Error {
  constructor() {
    super('unsaved changes could not be saved; import canceled')
    this.name = 'UnsavedChangesError'
  }
}

/**
 * The archive id whose Replace would trash the open story, or null. Case-insensitive
 * because preview matches ids that way (archive "A" replaces local "a" on Windows and
 * Android storage). If two local folders differ only in case (possible on OPFS), this
 * may close a story that is not actually replaced; closing and reopening is harmless,
 * while leaving a replaced story open in the editor is not.
 */
function replacedArchiveId(openId: string, decisions: Record<string, ImportDecision>): string | null {
  const folded = openId.toLowerCase()
  for (const [id, decision] of Object.entries(decisions)) {
    if (decision === 'replace' && id.toLowerCase() === folded) return id
  }
  return null
}

/**
 * Reopen the story that was closed for a Replace, on the chapter the writer had open
 * when it still exists. Best effort: a failure leaves the editor closed, never wrong.
 */
async function reopen(storyId: string, chapterId: string | null): Promise<void> {
  try {
    await useStoryStore.getState().openStory(storyId)
    const story = useStoryStore.getState().story
    if (chapterId && story?.chapterOrder.includes(chapterId) && useEditorStore.getState().chapterId !== chapterId) {
      await useEditorStore.getState().openChapter(storyId, chapterId)
    }
  } catch {
    // The library list and Settings stay usable; the writer can open the story by hand.
  }
}

export async function runLibraryImport(
  importId: string,
  decisions: Record<string, ImportDecision>
): Promise<LibraryImportOutcome> {
  await useEditorStore.getState().flush()
  // flush() swallows save errors and leaves `dirty` set; importing on top of prose that did
  // not reach disk is exactly what the reliability rules forbid.
  if (useEditorStore.getState().dirty) throw new UnsavedChangesError()

  // The two stores can disagree: the story store may show one story (or none) while the
  // editor still holds a chapter of another. Check both; if either sits on a story that is
  // about to be replaced, close both, so no view keeps pointing at a trashed copy.
  const editor = useEditorStore.getState()
  const editorStoryId = editor.storyId
  const editorChapterId = editor.chapterId
  const storeStoryId = useStoryStore.getState().story?.id ?? null
  const editorHit = editorStoryId === null ? null : replacedArchiveId(editorStoryId, decisions)
  const storeHit = storeStoryId === null ? null : replacedArchiveId(storeStoryId, decisions)
  // What to reopen afterwards. The editor's story wins when both match: it also carries the
  // chapter the writer was on. The chapter is kept only for the editor's own story.
  const target: { localId: string; archiveId: string; chapterId: string | null } | null =
    editorHit !== null && editorStoryId !== null
      ? { localId: editorStoryId, archiveId: editorHit, chapterId: editorChapterId }
      : storeHit !== null && storeStoryId !== null
        ? { localId: storeStoryId, archiveId: storeHit, chapterId: null }
        : null
  if (target !== null) {
    useEditorStore.getState().closeChapter()
    useStoryStore.getState().close()
  }

  let result: LibraryImportResult
  try {
    result = await api().applyLibraryImport(importId, decisions)
  } catch (err) {
    // Nothing (or not this story) was replaced: bring the local copy back, then report.
    if (target !== null) await reopen(target.localId, target.chapterId)
    throw err
  }

  if (target !== null) {
    // On success the imported copy, whose id may differ in case from the local one. On a
    // failed replace, the data layer restores the local copy under its own id.
    const replaced = result.imported.find((r) => r.id === target.archiveId && r.decision === 'replace')
    await reopen(replaced ? replaced.finalId : target.localId, target.chapterId)
  }
  let recoveries: ChapterRecovery[] = []
  try {
    recoveries = await api().scanLibrary()
  } catch {
    // A failed scan must not turn a completed import into an error.
  }
  return { result, recoveries }
}
