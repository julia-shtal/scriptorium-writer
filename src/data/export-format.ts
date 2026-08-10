/**
 * Pure export-byte builders behind the chapter/story export handlers (M14.1; moved to
 * src/data in MP6 so both the Electron and web platforms share them). Format-selection
 * (docx vs md) lives here, decoupled from any dialog/download transport. Returns
 * `Uint8Array` (not Node `Buffer`) so it runs in the browser: Markdown is UTF-8 encoded
 * with `TextEncoder`; docx bytes come from `blocksToDocxBytes`.
 */
import type { Chapter, ExportFormat } from '@shared/types'
import { chapterToDocxBlocks, blocksToDocxBytes, type DocxBlock } from './docx-export'
import { serializeChapterToMarkdown } from './markdown'

const utf8 = (s: string): Uint8Array => new TextEncoder().encode(s)

/** Build the export bytes for a single chapter; per-chapter export has no heading. */
export async function buildChapterExportBytes(
  chapter: Chapter,
  format: ExportFormat
): Promise<Uint8Array> {
  if (format === 'docx') {
    const blocks = chapterToDocxBlocks(chapter.title, chapter.doc, { withHeading: false })
    return blocksToDocxBytes([blocks])
  }
  return utf8(serializeChapterToMarkdown(chapter.title, chapter.doc))
}

/**
 * Build the export bytes for a whole story: `chapters` need not be in `chapterOrder`
 * order — this looks each id up and emits them in `chapterOrder` order. For `.docx`
 * each chapter gets a Heading-1; for `.md` each chapter's backup is joined with a
 * blank line.
 */
export async function buildStoryExportBytes(
  chapters: Chapter[],
  chapterOrder: string[],
  format: ExportFormat
): Promise<Uint8Array> {
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
    return blocksToDocxBytes(blockLists)
  }

  const joined = ordered
    .map((chapter) => serializeChapterToMarkdown(chapter.title, chapter.doc))
    .join('\n\n')
  return utf8(joined)
}
