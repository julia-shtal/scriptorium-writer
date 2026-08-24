import { describe, it, expect, vi } from 'vitest'
import type { Api, Chapter, ImportFileResult } from '@shared/types'
import { withNativeExportGuards } from './index'

/**
 * Node-only coverage for {@link withNativeExportGuards}: the pure `Api → Api` wrapping
 * that guards the three export methods, exercised against a hand-built fake `Api` so
 * this suite never needs a browser or OPFS. `createCapacitorPlatform` itself (which
 * boots `createWebPlatform`, requiring `navigator.storage`) is not covered here — same
 * split as `makeApiFromService` / `createWebPlatform` in `src/platform/web/index.test.ts`.
 */
function fakeChapter(): Chapter {
  return {
    id: 'ch1',
    title: 'Chapter One',
    doc: { type: 'doc', content: [] },
    wordCount: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    schemaVersion: 1
  }
}

function makeFakeApi(): Api {
  const importResult: ImportFileResult = { canceled: true }
  return {
    ping: vi.fn(async (): Promise<'pong'> => 'pong'),
    listStories: vi.fn(async () => []),
    createStory: vi.fn(async () => {
      throw new Error('not used in this test')
    }),
    deleteStory: vi.fn(async () => {}),
    readStory: vi.fn(async () => {
      throw new Error('not used in this test')
    }),
    updateStoryMeta: vi.fn(async () => {
      throw new Error('not used in this test')
    }),
    reorderChapters: vi.fn(async () => {}),
    createChapter: vi.fn(async () => fakeChapter()),
    readChapter: vi.fn(async () => fakeChapter()),
    saveChapter: vi.fn(async () => ({
      savedAt: '2026-01-01T00:00:00.000Z',
      wordCount: 0,
      versionId: 'v1'
    })),
    deleteChapter: vi.fn(async () => {}),
    listVersions: vi.fn(async () => []),
    readVersion: vi.fn(async () => fakeChapter()),
    restoreVersion: vi.fn(async () => fakeChapter()),
    readNotes: vi.fn(async () => {
      throw new Error('not used in this test')
    }),
    saveNotes: vi.fn(async () => {}),
    readSettings: vi.fn(async () => {
      throw new Error('not used in this test')
    }),
    saveSettings: vi.fn(async () => {}),
    applySpellLanguages: vi.fn(async () => {}),
    scanLibrary: vi.fn(async () => []),
    revealInFolder: vi.fn(async () => {}),
    exportLibrary: vi.fn(async () => ({ canceled: false, path: 'library.zip' })),
    readImportFile: vi.fn(async () => importResult),
    exportChapter: vi.fn(async () => ({ canceled: false, path: 'chapter.md' })),
    exportStory: vi.fn(async () => ({ canceled: false, path: 'story.md' }))
  }
}

describe('withNativeExportGuards', () => {
  it('rejects exportLibrary/exportChapter/exportStory with an UNSUPPORTED AppError, without calling through', async () => {
    const underlying = makeFakeApi()
    const guarded = withNativeExportGuards(underlying)

    await expect(guarded.exportLibrary()).rejects.toMatchObject({ code: 'UNSUPPORTED' })
    await expect(guarded.exportChapter('s1', 'c1', 'md')).rejects.toMatchObject({
      code: 'UNSUPPORTED'
    })
    await expect(guarded.exportStory('s1', 'md')).rejects.toMatchObject({ code: 'UNSUPPORTED' })

    expect(underlying.exportLibrary).not.toHaveBeenCalled()
    expect(underlying.exportChapter).not.toHaveBeenCalled()
    expect(underlying.exportStory).not.toHaveBeenCalled()
  })

  it('leaves every other method delegating to the underlying api untouched', async () => {
    const underlying = makeFakeApi()
    const guarded = withNativeExportGuards(underlying)

    await expect(guarded.readImportFile()).resolves.toEqual({ canceled: true })
    expect(underlying.readImportFile).toHaveBeenCalledTimes(1)

    const chapter = await guarded.readChapter('s1', 'c1')
    expect(chapter).toEqual(fakeChapter())
    expect(underlying.readChapter).toHaveBeenCalledWith('s1', 'c1')
  })
})
