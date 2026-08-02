import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { searchStory, findOffsets, type SearchLabels } from './searchStory'
import type { Story, Chapter, Notes } from '@shared/types'

// Russian labels fixture: keeps the existing section-chrome assertions valid
// (author titles/entry names still flow through untouched).
const LABELS: SearchLabels = {
  characters: 'Персонажи',
  locations: 'Локации',
  world: 'Мир',
  timeline: 'Хронология',
  scratch: 'Черновик',
  untitled: 'Без названия'
}

const story: Story = {
  id: 's1', title: 'S', description: '', tags: [], status: 'draft',
  createdAt: 'x', updatedAt: 'x', chapterOrder: ['c1', 'c2'], schemaVersion: 1
}

const chapterDoc = (text: string): Record<string, unknown> => ({
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text }] }]
})

const chapter = (id: string, title: string, text: string): Chapter => ({
  id, title, doc: chapterDoc(text), wordCount: 0,
  createdAt: 'x', updatedAt: 'x', schemaVersion: 1
})

const notes: Notes = {
  characters: [{ id: 'n1', name: 'Иван', body: 'высокий' }],
  locations: [], world: [], timeline: [],
  scratch: 'случайная мысль про Ивана',
  schemaVersion: 1
}

const saveChapter = vi.fn()
const saveNotes = vi.fn()

beforeEach(() => {
  saveChapter.mockClear()
  saveNotes.mockClear()
  vi.stubGlobal('window', {
    api: {
      readChapter: vi.fn(async (_s: string, id: string) =>
        id === 'c1' ? chapter('c1', 'Глава 1', 'Ветер нёс Ивана домой')
                     : chapter('c2', 'Глава 2', 'Здесь ничего')),
      readNotes: vi.fn(async () => notes),
      saveChapter,
      saveNotes
    }
  })
})

afterEach(() => vi.unstubAllGlobals())

describe('findOffsets', () => {
  it('finds all non-overlapping matches case-insensitively', () => {
    expect(findOffsets('aAaA', 'aa')).toEqual([0, 2])
    expect(findOffsets('ЛесЛесЛес', 'лес')).toEqual([0, 3, 6])
  })
})

describe('searchStory', () => {
  it('returns matches from chapters and every notes section', async () => {
    const out = await searchStory(story, 'иван', LABELS)
    const labels = out.matches.map((m) => m.label)
    expect(labels).toContain('Глава 1')            // chapter hit
    expect(labels).toContain('Персонажи · Иван')   // notes entry hit
    expect(labels).toContain('Черновик')           // scratch hit
    expect(out.matches.find((m) => m.label === 'Глава 1')?.kind).toBe('chapter')
  })

  it('is a pure read — never calls a write API', async () => {
    await searchStory(story, 'иван', LABELS)
    expect(saveChapter).not.toHaveBeenCalled()
    expect(saveNotes).not.toHaveBeenCalled()
  })

  it('skips and counts a chapter that fails to read', async () => {
    const readChapter = window.api.readChapter as ReturnType<typeof vi.fn>
    readChapter.mockImplementationOnce(async () => {
      throw new Error('corrupt canon')
    })
    const out = await searchStory(story, 'ничего', LABELS)
    expect(out.failedChapters).toBe(1)
  })

  it('returns empty for a blank query without touching the api', async () => {
    const out = await searchStory(story, '   ', LABELS)
    expect(out.matches).toEqual([])
    expect(window.api.readChapter).not.toHaveBeenCalled()
  })
})
