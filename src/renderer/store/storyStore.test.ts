import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { useStoryStore } from './storyStore'
import { useEditorStore } from './editorStore'
import type { Story, Chapter } from '@shared/types'

const story: Story = {
  id: 's1', title: 'S', description: '', tags: [], status: 'draft',
  createdAt: 'x', updatedAt: 'x', chapterOrder: ['c1', 'c2'], schemaVersion: 1
}
const chapter = (id: string, title: string): Chapter => ({
  id, title, doc: { type: 'doc', content: [] }, wordCount: id === 'c1' ? 10 : 20,
  createdAt: 'x', updatedAt: 'x', schemaVersion: 1
})

beforeEach(() => {
  useStoryStore.setState({ story: null, chapters: [] })
  vi.stubGlobal('window', {
    api: {
      readStory: vi.fn(async () => story),
      readChapter: vi.fn(async (_s: string, id: string) => chapter(id, id === 'c1' ? 'One' : 'Two')),
      reorderChapters: vi.fn(async () => {}),
      createChapter: vi.fn(async () => chapter('c3', 'Three')),
      deleteChapter: vi.fn(async () => {}),
      updateStoryMeta: vi.fn(async () => ({ ...story, title: 'Renamed' })),
      saveChapter: vi.fn(async () => ({ savedAt: 'x', wordCount: 0, versionId: 'v' }))
    }
  })
})

afterEach(() => vi.unstubAllGlobals())

describe('storyStore.load', () => {
  it('loads the story and its chapter summaries in order', async () => {
    await useStoryStore.getState().load('s1')
    const s = useStoryStore.getState()
    expect(s.story?.id).toBe('s1')
    expect(s.chapters).toEqual([
      { id: 'c1', title: 'One', wordCount: 10 },
      { id: 'c2', title: 'Two', wordCount: 20 }
    ])
  })
})

describe('storyStore.reorder', () => {
  it('persists the new order and reflects it locally', async () => {
    await useStoryStore.getState().load('s1')
    await useStoryStore.getState().reorder(['c2', 'c1'])
    expect(window.api.reorderChapters).toHaveBeenCalledWith('s1', ['c2', 'c1'])
    expect(useStoryStore.getState().chapters.map((c) => c.id)).toEqual(['c2', 'c1'])
  })
})

describe('storyStore.updateMeta', () => {
  it('persists a meta patch and stores the returned story', async () => {
    await useStoryStore.getState().load('s1')
    await useStoryStore.getState().updateMeta({ title: 'Renamed' })
    expect(window.api.updateStoryMeta).toHaveBeenCalledWith('s1', { title: 'Renamed' })
    expect(useStoryStore.getState().story?.title).toBe('Renamed')
  })
})

describe('storyStore.openStory', () => {
  it('loads the story then opens its first chapter in the editor', async () => {
    const openChapter = vi.fn(async () => {})
    useEditorStore.setState({ openChapter } as never)
    await useStoryStore.getState().openStory('s1')
    expect(openChapter).toHaveBeenCalledWith('s1', 'c1')
  })
})

describe('storyStore.renameChapter', () => {
  it('routes the OPEN chapter through the editor write path (no stale-doc round-trip)', async () => {
    // Reliability #1: renaming the open chapter must not read+resave its on-disk
    // doc, which would clobber unsaved editor edits. It must go through the editor.
    const setTitle = vi.fn()
    const flush = vi.fn(async () => {})
    useEditorStore.setState({ chapterId: 'c1', setTitle, flush } as never)
    await useStoryStore.getState().load('s1')
    await useStoryStore.getState().renameChapter('c1', 'New Title')
    expect(setTitle).toHaveBeenCalledWith('New Title')
    expect(flush).toHaveBeenCalled()
    expect(window.api.saveChapter).not.toHaveBeenCalled()
  })

  it('resaves a NON-open chapter directly (no live editor doc to preserve)', async () => {
    useEditorStore.setState({ chapterId: 'c1', setTitle: vi.fn(), flush: vi.fn(async () => {}) } as never)
    await useStoryStore.getState().load('s1')
    await useStoryStore.getState().renameChapter('c2', 'Two Renamed')
    expect(window.api.saveChapter).toHaveBeenCalledWith('s1', {
      id: 'c2', title: 'Two Renamed', doc: { type: 'doc', content: [] }
    })
  })
})
