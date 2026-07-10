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

  test('seeds a demo story + two chapters when the library is empty', async () => {
    const listStories = vi.fn(async () => [])
    const createStory = vi.fn(async () => ({ id: 's1', chapterOrder: [] }))
    const createChapter = vi
      .fn()
      .mockResolvedValueOnce({ id: 'c1', title: 'Глава 1' })
      .mockResolvedValueOnce({ id: 'c2', title: 'Глава 2' })
    const saveChapter = vi.fn(async () => ({ savedAt: '', wordCount: 0, versionId: 'v' }))
    vi.stubGlobal('window', {
      api: { listStories, createStory, createChapter, saveChapter }
    })

    const result = await bootstrapLibrary()

    expect(createStory).toHaveBeenCalledWith({ title: 'Демо' })
    expect(createChapter).toHaveBeenCalledTimes(2)
    expect(saveChapter).toHaveBeenCalledOnce()
    expect(result).toEqual({ storyId: 's1', chapterId: 'c1' })
  })
})
