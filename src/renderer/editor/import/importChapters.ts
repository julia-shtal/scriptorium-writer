/**
 * M14 import orchestration. `planImportChapters` is pure: it maps a normalized import
 * payload + granularity to the chapters to create. `runImport` performs the side effects
 * — creating and saving each chapter through the SAME `window.api.createChapter` /
 * `saveChapter` path as any other chapter (atomic writes + snapshots preserved) — and
 * surfaces the one-time "some formatting may not have been kept" notice for docx.
 */
import type { ImportFileResult, ProseMirrorJSON } from '@shared/types'
import { markdownToDoc, splitMarkdownByHeading } from './markdownToDoc'
import { htmlToDoc, splitHtmlByHeading } from './htmlToDoc'

export type ImportMode = 'single' | 'split'
export interface PlannedChapter {
  title: string
  doc: ProseMirrorJSON
}

/** Map a normalized import payload to the chapters to append. Pure. */
export function planImportChapters(result: ImportFileResult, mode: ImportMode): PlannedChapter[] {
  if (result.canceled) return []
  if (result.kind === 'md') {
    if (mode === 'split') {
      return splitMarkdownByHeading(result.text).map((s) => ({
        title: s.title,
        doc: markdownToDoc(s.text)
      }))
    }
    return [{ title: '', doc: markdownToDoc(result.text) }]
  }
  // docx
  if (mode === 'split') {
    return splitHtmlByHeading(result.html).map((s) => ({
      title: s.title,
      doc: htmlToDoc(s.html)
    }))
  }
  return [{ title: '', doc: htmlToDoc(result.html) }]
}

export interface ImportOutcome {
  createdCount: number
  warnings: string[]
}

/**
 * Create + save each planned chapter for `storyId`. Returns how many were created and any
 * conversion warnings (non-empty → caller shows the lossy notice). Reads `window.api`.
 */
export async function runImport(
  storyId: string,
  result: ImportFileResult,
  mode: ImportMode
): Promise<ImportOutcome> {
  const planned = planImportChapters(result, mode)
  // NOTE: a split import is not transactional — if a later chapter's save throws,
  // earlier chapters remain created. Acceptable for M14: imported chapters are normal,
  // deletable chapters, so the user can remove any partial result manually.
  for (const ch of planned) {
    const created = await window.api.createChapter(storyId, ch.title)
    await window.api.saveChapter(storyId, { id: created.id, title: ch.title, doc: ch.doc })
  }
  const warnings = !result.canceled && result.kind === 'docx' ? result.warnings : []
  return { createdCount: planned.length, warnings }
}
