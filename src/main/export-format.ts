/**
 * Pure buffer-building helpers behind the chapter/story export IPC handlers (M14.1
 * task 1). Kept out of `index.ts` so the format-selection logic (docx vs md) is
 * unit-testable without spinning up Electron; `index.ts` only wires the save dialog
 * and the atomic write.
 */
import type { Chapter, ExportFormat } from '@shared/types'
import { chapterToDocxBlocks, blocksToDocxBuffer, type DocxBlock } from './docx-export'
import { serializeChapterToMarkdown } from './markdown'

/** Build the export bytes for a single chapter, per-chapter export has no heading. */
export async function buildChapterExportBuffer(
  chapter: Chapter,
  format: ExportFormat
): Promise<Buffer> {
  if (format === 'docx') {
    const blocks = chapterToDocxBlocks(chapter.title, chapter.doc, { withHeading: false })
    return blocksToDocxBuffer([blocks])
  }
  return Buffer.from(serializeChapterToMarkdown(chapter.title, chapter.doc), 'utf8')
}

/**
 * Build the export bytes for a whole story: `chapters` need not be in `chapterOrder`
 * order — this looks each id up and emits them in `chapterOrder` order. For `.docx`
 * each chapter gets a Heading-1; for `.md` each chapter's backup is joined with a
 * blank line.
 */
export async function buildStoryExportBuffer(
  chapters: Chapter[],
  chapterOrder: string[],
  format: ExportFormat
): Promise<Buffer> {
  const byId = new Map(chapters.map((c) => [c.id, c]))
  const ordered = chapterOrder.map((id) => byId.get(id)).filter((c): c is Chapter => !!c)

  // Reliability (CLAUDE.md #1, "never a silent blanking"): a chapterOrder id that does
  // not resolve to a chapter would otherwise be dropped, yielding a silently-short
  // export. Fail loud instead — the thrown error rides the IPC error normalization.
  if (ordered.length !== chapterOrder.length) {
    throw new Error(
      'Export aborted: a chapter referenced by chapterOrder could not be found. ' +
        'Refusing to write an incomplete export.'
    )
  }

  if (format === 'docx') {
    const blockLists: DocxBlock[][] = ordered.map((chapter) =>
      chapterToDocxBlocks(chapter.title, chapter.doc, { withHeading: true })
    )
    return blocksToDocxBuffer(blockLists)
  }

  const joined = ordered
    .map((chapter) => serializeChapterToMarkdown(chapter.title, chapter.doc))
    .join('\n\n')
  return Buffer.from(joined, 'utf8')
}
