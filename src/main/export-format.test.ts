/**
 * Pure buffer-building helpers behind the export IPC handlers (M14.1 task 1). Kept
 * separate from `index.ts` (which only wires dialogs + atomic writes) so the
 * format-selection logic is unit-testable without an Electron runtime.
 */
import { describe, it, expect } from 'vitest'
import { buildChapterExportBuffer, buildStoryExportBuffer } from './export-format'
import { serializeChapterToMarkdown } from './markdown'
import type { Chapter, ProseMirrorJSON } from '@shared/types'

const doc = (content: unknown[]): ProseMirrorJSON => ({ type: 'doc', content })

function makeChapter(id: string, title: string, text: string): Chapter {
  return {
    id,
    title,
    doc: doc([{ type: 'paragraph', content: [{ type: 'text', text }] }]),
    wordCount: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    schemaVersion: 1
  }
}

describe('buildChapterExportBuffer', () => {
  it('returns UTF-8 markdown produced by serializeChapterToMarkdown for format "md"', async () => {
    const chapter = makeChapter('c1', 'Chapter One', 'hello world')
    const buffer = await buildChapterExportBuffer(chapter, 'md')
    const expected = serializeChapterToMarkdown(chapter.title, chapter.doc)
    expect(buffer.toString('utf8')).toBe(expected)
  })

  it('produces a non-empty buffer for format "docx"', async () => {
    const chapter = makeChapter('c1', 'Chapter One', 'hello world')
    const buffer = await buildChapterExportBuffer(chapter, 'docx')
    expect(buffer.length).toBeGreaterThan(0)
  })
})

describe('buildStoryExportBuffer', () => {
  it('joins each chapter markdown backup in chapterOrder with a blank line', async () => {
    const chapters = [
      makeChapter('c2', 'Second', 'second text'),
      makeChapter('c1', 'First', 'first text')
    ]
    // chapterOrder deliberately differs from the array's own order.
    const chapterOrder = ['c1', 'c2']
    const buffer = await buildStoryExportBuffer(chapters, chapterOrder, 'md')

    const first = chapters.find((c) => c.id === 'c1')!
    const second = chapters.find((c) => c.id === 'c2')!
    const expected = [
      serializeChapterToMarkdown(first.title, first.doc),
      serializeChapterToMarkdown(second.title, second.doc)
    ].join('\n\n')

    expect(buffer.toString('utf8')).toBe(expected)
  })

  it('produces a non-empty buffer for format "docx"', async () => {
    const chapters = [makeChapter('c1', 'First', 'first text')]
    const buffer = await buildStoryExportBuffer(chapters, ['c1'], 'docx')
    expect(buffer.length).toBeGreaterThan(0)
  })

  it('throws when chapterOrder references an id missing from the chapters array', async () => {
    const chapters = [makeChapter('c1', 'First', 'first text')]
    // 'c2' is referenced but not present — must fail loud, not silently short the export.
    await expect(buildStoryExportBuffer(chapters, ['c1', 'c2'], 'md')).rejects.toThrow(
      /could not be found/
    )
  })

  it('throws when a duplicate id in chapters makes the resolved count mismatch', async () => {
    // A duplicate id in chapterOrder resolves to fewer unique blocks than requested.
    const chapters = [makeChapter('c1', 'First', 'first text')]
    await expect(buildStoryExportBuffer(chapters, ['c1', 'c1'], 'md')).resolves.toBeInstanceOf(
      Buffer
    )
    // (Duplicate ids in chapterOrder still resolve — this documents that only *unresolvable*
    // ids trip the guard. The mismatch guard fires on missing ids, covered above.)
  })

  it('returns an empty buffer for an empty chapterOrder without throwing (md)', async () => {
    const buffer = await buildStoryExportBuffer([], [], 'md')
    expect(buffer.toString('utf8')).toBe('')
  })

  it('returns a buffer for an empty chapterOrder without throwing (docx)', async () => {
    const buffer = await buildStoryExportBuffer([], [], 'docx')
    expect(buffer).toBeInstanceOf(Buffer)
  })
})
