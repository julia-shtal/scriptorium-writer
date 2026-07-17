import { afterEach, describe, expect, test, vi } from 'vitest'
import { bootstrapLibrary } from './bootstrap'

describe('bootstrapLibrary', () => {
  afterEach(() => vi.unstubAllGlobals())

  test('opens the first existing story/chapter when the library is non-empty', async () => {
    const listStories = vi.fn(async () => [{ id: 's1' }])
    const readStory = vi.fn(async () => ({ id: 's1', chapterOrder: ['c1', 'c2'] }))
    const createStory = vi.fn()
    const createChapter = vi.fn()
    vi.stubGlobal('window', {
      api: { listStories, readStory, createStory, createChapter }
    })

    const result = await bootstrapLibrary()

    expect(result).toEqual({ storyId: 's1', chapterId: 'c1' })
    expect(createStory).not.toHaveBeenCalled()
  })

  test('seeds a demo story + one chapter when the library is empty', async () => {
    const listStories = vi.fn(async () => [])
    const createStory = vi.fn(async () => ({ id: 's1', chapterOrder: [] }))
    const createChapter = vi.fn().mockResolvedValueOnce({ id: 'c1', title: 'Глава 1' })
    const saveChapter = vi.fn(async () => ({ savedAt: '', wordCount: 0, versionId: 'v' }))
    const readSettings = vi.fn(async () => ({ demoSeeded: false }))
    const saveSettings = vi.fn(async () => {})
    vi.stubGlobal('window', {
      api: { listStories, createStory, createChapter, saveChapter, readSettings, saveSettings }
    })

    const result = await bootstrapLibrary()

    expect(createStory).toHaveBeenCalledWith({ title: 'Демо' })
    expect(createChapter).toHaveBeenCalledOnce()
    expect(saveChapter).toHaveBeenCalledOnce()
    expect(saveSettings).toHaveBeenCalledWith(expect.objectContaining({ demoSeeded: true }))
    expect(result).toEqual({ storyId: 's1', chapterId: 'c1' })
  })

  test('does not re-seed an already-seeded empty library', async () => {
    const listStories = vi.fn(async () => [])
    const createStory = vi.fn()
    const saveSettings = vi.fn()
    const readSettings = vi.fn(async () => ({ demoSeeded: true }))
    vi.stubGlobal('window', {
      api: { listStories, createStory, saveSettings, readSettings }
    })

    const result = await bootstrapLibrary()

    expect(createStory).not.toHaveBeenCalled()
    expect(result).toEqual({ storyId: null, chapterId: null })
  })
})
