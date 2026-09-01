import { afterEach, describe, expect, test, vi } from 'vitest'
import { bootstrapLibrary } from './bootstrap'
import { resetPlatform } from '@renderer/platform'
import { setFakeApi } from '@renderer/test/fakePlatform'

describe('bootstrapLibrary', () => {
  afterEach(() => resetPlatform())

  test('opens the first existing story/chapter when the library is non-empty', async () => {
    const listStories = vi.fn(async () => [{ id: 's1' }])
    const readStory = vi.fn(async () => ({ id: 's1', chapterOrder: ['c1', 'c2'] }))
    const createStory = vi.fn()
    const createChapter = vi.fn()
    const readSettings = vi.fn(async () => ({}))
    setFakeApi({ listStories, readStory, createStory, createChapter, readSettings })

    const result = await bootstrapLibrary()

    expect(result).toEqual({ storyId: 's1', chapterId: 'c1' })
    expect(createStory).not.toHaveBeenCalled()
  })

  test('prefers lastOpenedStoryId/lastOpenedChapterId when both are still valid', async () => {
    const listStories = vi.fn(async () => [{ id: 's1' }, { id: 's2' }])
    const readStory = vi.fn(async (id: string) => {
      if (id === 's1') return { id: 's1', chapterOrder: ['c1', 'c2'] }
      if (id === 's2') return { id: 's2', chapterOrder: ['c3', 'c4'] }
      throw new Error(`unexpected story id: ${id}`)
    })
    const createStory = vi.fn()
    const createChapter = vi.fn()
    const readSettings = vi.fn(async () => ({
      lastOpenedStoryId: 's2',
      lastOpenedChapterId: 'c4'
    }))
    setFakeApi({ listStories, readStory, createStory, createChapter, readSettings })

    const result = await bootstrapLibrary()

    expect(result).toEqual({ storyId: 's2', chapterId: 'c4' })
    expect(createStory).not.toHaveBeenCalled()
    expect(createChapter).not.toHaveBeenCalled()
  })

  test('falls back to the first story when lastOpenedStoryId no longer exists', async () => {
    const listStories = vi.fn(async () => [{ id: 's1' }, { id: 's2' }])
    const readStory = vi.fn(async (id: string) => {
      if (id === 's1') return { id: 's1', chapterOrder: ['c1', 'c2'] }
      if (id === 's2') return { id: 's2', chapterOrder: ['c3', 'c4'] }
      throw new Error(`unexpected story id: ${id}`)
    })
    const createStory = vi.fn()
    const createChapter = vi.fn()
    const readSettings = vi.fn(async () => ({
      lastOpenedStoryId: 'deleted-story',
      lastOpenedChapterId: 'c99'
    }))
    setFakeApi({ listStories, readStory, createStory, createChapter, readSettings })

    const result = await bootstrapLibrary()

    expect(result).toEqual({ storyId: 's1', chapterId: 'c1' })
    expect(createStory).not.toHaveBeenCalled()
    expect(createChapter).not.toHaveBeenCalled()
  })

  test('falls back to chapterOrder[0] when lastOpenedChapterId is stale', async () => {
    const listStories = vi.fn(async () => [{ id: 's1' }])
    const readStory = vi.fn(async (id: string) => {
      if (id === 's1') return { id: 's1', chapterOrder: ['c1', 'c2'] }
      throw new Error(`unexpected story id: ${id}`)
    })
    const createStory = vi.fn()
    const createChapter = vi.fn()
    const readSettings = vi.fn(async () => ({
      lastOpenedStoryId: 's1',
      lastOpenedChapterId: 'deleted-chapter'
    }))
    setFakeApi({ listStories, readStory, createStory, createChapter, readSettings })

    const result = await bootstrapLibrary()

    expect(result).toEqual({ storyId: 's1', chapterId: 'c1' })
    expect(createStory).not.toHaveBeenCalled()
    expect(createChapter).not.toHaveBeenCalled()
  })

  test('seeds a demo story + one chapter when the library is empty', async () => {
    const listStories = vi.fn(async () => [])
    const createStory = vi.fn(async () => ({ id: 's1', chapterOrder: [] }))
    const createChapter = vi.fn().mockResolvedValueOnce({ id: 'c1', title: 'Глава 1' })
    const saveChapter = vi.fn(async () => ({ savedAt: '', wordCount: 0, versionId: 'v' }))
    const readSettings = vi.fn(async () => ({ demoSeeded: false }))
    const saveSettings = vi.fn(async () => {})
    setFakeApi({ listStories, createStory, createChapter, saveChapter, readSettings, saveSettings })

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
    setFakeApi({ listStories, createStory, saveSettings, readSettings })

    const result = await bootstrapLibrary()

    expect(createStory).not.toHaveBeenCalled()
    expect(result).toEqual({ storyId: null, chapterId: null })
  })

  // MC3. The fixture reproduces the MC2 measurement rather than an error case: with
  // all-files access withheld the library files are still on disk, but listStories() comes
  // back EMPTY instead of throwing, and demoSeeded is genuinely false because this really is
  // a fresh install (over an old library). Every signal says "first run"; only the platform's
  // storageAccess.granted says the app cannot see anything. That is what must win.
  test('seeds nothing when the platform reports storage access withheld', async () => {
    const listStories = vi.fn(async () => [])
    const readSettings = vi.fn(async () => ({ demoSeeded: false }))
    const createStory = vi.fn()
    const createChapter = vi.fn()
    const saveChapter = vi.fn()
    const saveSettings = vi.fn()
    setFakeApi(
      { listStories, readSettings, createStory, createChapter, saveChapter, saveSettings },
      {
        storageAccess: {
          granted: false,
          request: vi.fn(async () => {}),
          recheck: vi.fn(async () => false)
        }
      }
    )

    const result = await bootstrapLibrary()

    expect(result).toEqual({ storyId: null, chapterId: null })
    expect(createStory).not.toHaveBeenCalled()
    expect(createChapter).not.toHaveBeenCalled()
    expect(saveChapter).not.toHaveBeenCalled()
    // The load-bearing one: demoSeeded stays untouched, so the real first run is still ahead
    // of us once the permission is granted. Writing it here would burn it on a library the
    // app never managed to read.
    expect(saveSettings).not.toHaveBeenCalled()
    // It does not even ask — the refusal is above the reads, so nothing acts on their answers.
    expect(listStories).not.toHaveBeenCalled()
  })

  test('seeds normally when storage access is present and granted', async () => {
    const listStories = vi.fn(async () => [])
    const createStory = vi.fn(async () => ({ id: 's1', chapterOrder: [] }))
    const createChapter = vi.fn().mockResolvedValueOnce({ id: 'c1', title: 'Глава 1' })
    const saveChapter = vi.fn(async () => ({ savedAt: '', wordCount: 0, versionId: 'v' }))
    const readSettings = vi.fn(async () => ({ demoSeeded: false }))
    const saveSettings = vi.fn(async () => {})
    setFakeApi(
      { listStories, createStory, createChapter, saveChapter, readSettings, saveSettings },
      {
        storageAccess: {
          granted: true,
          request: vi.fn(async () => {}),
          recheck: vi.fn(async () => true)
        }
      }
    )

    const result = await bootstrapLibrary()

    expect(result).toEqual({ storyId: 's1', chapterId: 'c1' })
    expect(saveSettings).toHaveBeenCalledWith(expect.objectContaining({ demoSeeded: true }))
  })
})
