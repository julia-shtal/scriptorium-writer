import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { LibraryImportResult } from '@shared/types'
import { resetPlatform } from '@renderer/platform'
import { setFakeApi } from '@renderer/test/fakePlatform'
import { useEditorStore } from '@renderer/store/editorStore'
import { useStoryStore } from '@renderer/store/storyStore'
import { useSettingsStore } from '@renderer/store/settingsStore'
import { useUiStore } from '@renderer/store/uiStore'
import { runLibraryImport, UnsavedChangesError } from './library-import-flow'

// Replaced via setState, not vi.spyOn(getState(), 'flush'): every zustand set() copies the
// state into a new object, so a spy on the old one would survive restoreAllMocks inside
// the new state and leak into other test files.
const originalFlush = useEditorStore.getState().flush

const storyA = { id: 'a', title: 'A', chapterOrder: ['c1', 'c2'] }
const doc = { type: 'doc', content: [] }
const replaced = (finalId = 'a'): LibraryImportResult => ({
  imported: [{ id: finalId, finalId, decision: 'replace' }],
  skipped: [],
  failed: []
})

/** The editor and story store as they are after opening chapter c2 of story `a`. */
function openA(chapterId = 'c2'): void {
  useStoryStore.setState({ story: storyA as never, chapters: [] })
  useEditorStore.setState({ storyId: 'a', chapterId, doc: doc as never, dirty: false })
}

beforeEach(() => {
  useSettingsStore.setState({ settings: null })
})

afterEach(() => {
  useEditorStore.setState({ flush: originalFlush })
  useEditorStore.getState().closeChapter()
  useStoryStore.getState().close()
  resetPlatform()
  vi.restoreAllMocks()
})

describe('runLibraryImport', () => {
  it('flushes, closes a story being replaced before apply, then reopens it and scans', async () => {
    const order: string[] = []
    setFakeApi({
      applyLibraryImport: vi.fn(async () => {
        const open = useStoryStore.getState().story?.id ?? useEditorStore.getState().storyId ?? 'none'
        order.push(`apply(open=${open})`)
        return replaced()
      }),
      readStory: vi.fn(async () => storyA),
      readChapter: vi.fn(async (_s: string, id: string) => ({ id, title: id, wordCount: 0, doc })),
      scanLibrary: vi.fn(async () => [{ storyId: 'a', chapterId: 'c1', reason: 'missing', newestVersionId: null }])
    })
    openA()
    useEditorStore.setState({ flush: async () => { order.push('flush') } })

    const { recoveries } = await runLibraryImport('imp', { a: 'replace' })

    expect(order).toEqual(['flush', 'apply(open=none)'])
    expect(useStoryStore.getState().story?.id).toBe('a')
    // Back on the chapter the writer had open, not the story's first one.
    expect(useEditorStore.getState().chapterId).toBe('c2')
    expect(recoveries).toHaveLength(1)
    // Returned, not raised: RecoveryDialog must not open on top of the import result.
    expect(useUiStore.getState().recoveries).toEqual([])
  })

  it('refuses to import while the editor still holds unsaved prose', async () => {
    const apply = vi.fn()
    setFakeApi({ applyLibraryImport: apply })
    openA()
    useEditorStore.setState({ dirty: true, flush: async () => {} })

    await expect(runLibraryImport('imp', { a: 'replace' })).rejects.toBeInstanceOf(UnsavedChangesError)
    expect(apply).not.toHaveBeenCalled()
    // Nothing was closed: the unsaved prose is still in the editor.
    expect(useEditorStore.getState().chapterId).toBe('c2')
    expect(useStoryStore.getState().story?.id).toBe('a')
  })

  it('leaves an open story alone when it is not being replaced', async () => {
    const readStory = vi.fn()
    let openDuringApply: string | null = null
    setFakeApi({
      applyLibraryImport: vi.fn(async () => {
        openDuringApply = useEditorStore.getState().chapterId
        return { imported: [{ id: 'a', finalId: 'a-2', decision: 'keepBoth' }], skipped: [], failed: [] }
      }),
      readStory,
      scanLibrary: vi.fn(async () => [])
    })
    openA()
    useEditorStore.setState({ flush: async () => {} })

    await runLibraryImport('imp', { a: 'keepBoth', b: 'replace' })

    expect(openDuringApply).toBe('c2')
    expect(readStory).not.toHaveBeenCalled()
    expect(useEditorStore.getState().chapterId).toBe('c2')
  })

  it('matches the open story case-insensitively and reopens it under the imported id', async () => {
    const readStory = vi.fn(async (id: string) => ({ ...storyA, id }))
    let openDuringApply: string | null = 'unset'
    setFakeApi({
      applyLibraryImport: vi.fn(async () => {
        openDuringApply = useEditorStore.getState().storyId
        return replaced('A')
      }),
      readStory,
      readChapter: vi.fn(async (_s: string, id: string) => ({ id, title: id, wordCount: 0, doc })),
      scanLibrary: vi.fn(async () => [])
    })
    openA()
    useEditorStore.setState({ flush: async () => {} })

    await runLibraryImport('imp', { A: 'replace' })

    expect(openDuringApply).toBeNull()
    expect(readStory).toHaveBeenCalledWith('A')
    expect(useStoryStore.getState().story?.id).toBe('A')
  })

  it('reopens the local copy when its replace failed', async () => {
    const readStory = vi.fn(async () => storyA)
    setFakeApi({
      applyLibraryImport: vi.fn(async () => ({ imported: [], skipped: [], failed: [{ id: 'a', reason: 'disk' }] })),
      readStory,
      readChapter: vi.fn(async (_s: string, id: string) => ({ id, title: id, wordCount: 0, doc })),
      scanLibrary: vi.fn(async () => [])
    })
    openA()
    useEditorStore.setState({ flush: async () => {} })

    const { result } = await runLibraryImport('imp', { a: 'replace' })

    expect(result.failed).toHaveLength(1)
    expect(readStory).toHaveBeenCalledWith('a')
    expect(useStoryStore.getState().story?.id).toBe('a')
  })

  it('reopens the local copy and rethrows when apply itself throws', async () => {
    const readStory = vi.fn(async () => storyA)
    setFakeApi({
      applyLibraryImport: vi.fn(async () => { throw new Error('NOT_FOUND') }),
      readStory,
      readChapter: vi.fn(async (_s: string, id: string) => ({ id, title: id, wordCount: 0, doc })),
      scanLibrary: vi.fn(async () => [])
    })
    openA()
    useEditorStore.setState({ flush: async () => {} })

    await expect(runLibraryImport('imp', { a: 'replace' })).rejects.toThrow('NOT_FOUND')
    expect(useStoryStore.getState().story?.id).toBe('a')
  })

  it('a failed reopen leaves the editor closed and a failed scan does not fail the import', async () => {
    setFakeApi({
      applyLibraryImport: vi.fn(async () => replaced()),
      readStory: vi.fn(async () => { throw new Error('gone') }),
      scanLibrary: vi.fn(async () => { throw new Error('scan') })
    })
    openA()
    useEditorStore.setState({ flush: async () => {} })

    const { result, recoveries } = await runLibraryImport('imp', { a: 'replace' })

    expect(result.imported).toHaveLength(1)
    expect(recoveries).toEqual([])
    expect(useStoryStore.getState().story).toBeNull()
    expect(useEditorStore.getState().storyId).toBeNull()
  })

  describe('when the story store and the editor disagree', () => {
    const storyOf = (id: string): typeof storyA => ({ ...storyA, id })
    const setup = (): { seenDuringApply: () => [string | null, string | null] } => {
      let seen: [string | null, string | null] = ['unset', 'unset']
      setFakeApi({
        applyLibraryImport: vi.fn(async () => {
          seen = [useStoryStore.getState().story?.id ?? null, useEditorStore.getState().storyId]
          return replaced()
        }),
        readStory: vi.fn(async (id: string) => storyOf(id)),
        readChapter: vi.fn(async (_s: string, id: string) => ({ id, title: id, wordCount: 0, doc })),
        scanLibrary: vi.fn(async () => [])
      })
      useEditorStore.setState({ flush: async () => {} })
      return { seenDuringApply: () => seen }
    }

    it('closes both and reopens on the chapter when the editor is on the replaced story', async () => {
      const { seenDuringApply } = setup()
      useStoryStore.setState({ story: storyOf('b') as never, chapters: [] })
      useEditorStore.setState({ storyId: 'a', chapterId: 'c2', doc: doc as never, dirty: false })

      await runLibraryImport('imp', { a: 'replace' })

      expect(seenDuringApply()).toEqual([null, null])
      expect(useStoryStore.getState().story?.id).toBe('a')
      expect(useEditorStore.getState()).toMatchObject({ storyId: 'a', chapterId: 'c2' })
    })

    it('closes both and reopens on the first chapter when only the story store is on it', async () => {
      const { seenDuringApply } = setup()
      useStoryStore.setState({ story: storyOf('a') as never, chapters: [] })
      // c2 belongs to story b here; it must not be carried over into a.
      useEditorStore.setState({ storyId: 'b', chapterId: 'c2', doc: doc as never, dirty: false })

      await runLibraryImport('imp', { A: 'replace' })

      expect(seenDuringApply()).toEqual([null, null])
      expect(useStoryStore.getState().story?.id).toBe('a')
      expect(useEditorStore.getState()).toMatchObject({ storyId: 'a', chapterId: 'c1' })
    })

    it('touches neither when neither is on a replaced story', async () => {
      const { seenDuringApply } = setup()
      useStoryStore.setState({ story: storyOf('b') as never, chapters: [] })
      useEditorStore.setState({ storyId: 'c', chapterId: 'c2', doc: doc as never, dirty: false })

      await runLibraryImport('imp', { a: 'replace' })

      expect(seenDuringApply()).toEqual(['b', 'c'])
    })
  })
})
