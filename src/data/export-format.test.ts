import { describe, it, expect } from 'vitest'
import { buildChapterExportBytes, buildStoryExportBytes } from './export-format'
import { serializeChapterToMarkdown } from './markdown'
import type { Chapter, ProseMirrorJSON } from '@shared/types'

const dec = (b: Uint8Array): string => new TextDecoder().decode(b)
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

describe('buildChapterExportBytes', () => {
  it('returns UTF-8 markdown produced by serializeChapterToMarkdown for format "md"', async () => {
    const chapter = makeChapter('c1', 'Chapter One', 'hello world')
    const bytes = await buildChapterExportBytes(chapter, 'md')
    expect(dec(bytes)).toBe(serializeChapterToMarkdown(chapter.title, chapter.doc))
  })

  it('produces non-empty bytes for format "docx"', async () => {
    const chapter = makeChapter('c1', 'Chapter One', 'hello world')
    const bytes = await buildChapterExportBytes(chapter, 'docx')
    expect(bytes).toBeInstanceOf(Uint8Array)
    expect(bytes.length).toBeGreaterThan(0)
  })
})

describe('buildStoryExportBytes', () => {
  it('joins each chapter markdown backup in chapterOrder with a blank line', async () => {
    const chapters = [makeChapter('c2', 'Second', 'second text'), makeChapter('c1', 'First', 'first text')]
    const bytes = await buildStoryExportBytes(chapters, ['c1', 'c2'], 'md')
    const first = chapters.find((c) => c.id === 'c1')!
    const second = chapters.find((c) => c.id === 'c2')!
    const expected = [
      serializeChapterToMarkdown(first.title, first.doc),
      serializeChapterToMarkdown(second.title, second.doc)
    ].join('\n\n')
    expect(dec(bytes)).toBe(expected)
  })

  it('produces non-empty bytes for format "docx"', async () => {
    const bytes = await buildStoryExportBytes([makeChapter('c1', 'First', 'first text')], ['c1'], 'docx')
    expect(bytes.length).toBeGreaterThan(0)
  })

  it('throws when chapterOrder references an id missing from the chapters array', async () => {
    const chapters = [makeChapter('c1', 'First', 'first text')]
    await expect(buildStoryExportBytes(chapters, ['c1', 'c2'], 'md')).rejects.toThrow(/could not be found/)
  })

  it('returns empty bytes for an empty chapterOrder without throwing (md)', async () => {
    const bytes = await buildStoryExportBytes([], [], 'md')
    expect(dec(bytes)).toBe('')
  })

  it('returns a Uint8Array for an empty chapterOrder without throwing (docx)', async () => {
    const bytes = await buildStoryExportBytes([], [], 'docx')
    expect(bytes).toBeInstanceOf(Uint8Array)
  })
})
