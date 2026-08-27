import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { bootApp } from './boot-app'
import { useSettingsStore } from './settingsStore'
import { useStoryStore } from './storyStore'
import { useEditorStore } from './editorStore'
import { useUiStore } from './uiStore'
import { resetPlatform } from '@renderer/platform'
import { setFakeApi } from '@renderer/test/fakePlatform'
import type { Chapter, ChapterRecovery, Settings, Story } from '@shared/types'

const settings: Settings = {
  theme: 'book', autosaveIntervalMs: 120000, autosaveDebounceMs: 2000, spellLanguages: [],
  editorFontFamily: 'PT Serif', editorFontSizePx: 17, maxVersionsPerChapter: 20,
  libraryPath: '/lib', language: 'ru', schemaVersion: 1
}

const story: Story = {
  id: 's1', title: 'S', description: '', tags: [], status: 'draft',
  createdAt: 'x', updatedAt: 'x', chapterOrder: ['c1', 'c2'], schemaVersion: 1
}

const chapter = (id: string): Chapter => ({
  id, title: id.toUpperCase(), doc: { type: 'doc', content: [] }, wordCount: 0,
  createdAt: 'x', updatedAt: 'x', schemaVersion: 1
})

const missingC2: ChapterRecovery = {
  storyId: 's1', chapterId: 'c2', reason: 'missing', newestVersionId: 'v1'
}

// No jsdom in this repo — applySettingsEffects only touches documentElement.style.
function fakeDocument(): Document {
  const props = new Map<string, string>()
  const style = {
    setProperty: (name: string, value: string) => props.set(name, value),
    removeProperty: (name: string) => props.delete(name),
    getPropertyValue: (name: string) => props.get(name) ?? ''
  }
  return { documentElement: { style } } as unknown as Document
}

/** A library where `broken` cannot be read, and `lastOpened` is where boot lands. */
function fakeLibrary(opts: { broken: string; scan: ChapterRecovery[]; lastOpened: string }): void {
  setFakeApi({
    readSettings: vi.fn(async () => ({
      ...settings, lastOpenedStoryId: 's1', lastOpenedChapterId: opts.lastOpened
    })),
    saveSettings: vi.fn(async () => {}),
    applySpellLanguages: vi.fn(async () => {}),
    scanLibrary: vi.fn(async () => opts.scan),
    listStories: vi.fn(async () => [{ id: 's1' }]),
    readStory: vi.fn(async () => story),
    readChapter: vi.fn(async (_s: string, id: string) => {
      if (id === opts.broken) throw new Error(`chapter "${id}" not found`)
      return chapter(id)
    }),
    createChapter: vi.fn()
  })
}

describe('bootApp when a chapter canon is missing', () => {
  beforeEach(() => {
    vi.stubGlobal('document', fakeDocument())
    useSettingsStore.setState({ settings: null })
    useStoryStore.setState({ story: null, chapters: [] })
  })

  afterEach(() => {
    useEditorStore.getState().stopAutosave()
    vi.unstubAllGlobals()
    resetPlatform()
  })

  it('loads settings even though the library has a broken chapter', async () => {
    fakeLibrary({ broken: 'c2', scan: [missingC2], lastOpened: 'c1' })
    await bootApp()
    // Settings null here is what left the Settings view stuck on "Загрузка…".
    expect(useSettingsStore.getState().settings).not.toBeNull()
  })

  it('opens the story, with the broken chapter flagged rather than fatal', async () => {
    fakeLibrary({ broken: 'c2', scan: [missingC2], lastOpened: 'c1' })
    const recoveries = await bootApp()
    expect(recoveries).toEqual([missingC2])
    expect(useStoryStore.getState().story?.id).toBe('s1')
    expect(useStoryStore.getState().chapters).toEqual([
      { id: 'c1', title: 'C1', wordCount: 0 },
      { id: 'c2', title: '', wordCount: 0, missing: true }
    ])
  })

  it('survives the broken chapter also being the last-opened one', async () => {
    fakeLibrary({ broken: 'c2', scan: [missingC2], lastOpened: 'c2' })
    await expect(bootApp()).resolves.toEqual([missingC2])
    expect(useSettingsStore.getState().settings).not.toBeNull()
    expect(useStoryStore.getState().story?.id).toBe('s1')
  })

  it('still fails loudly when a chapter breaks that the scan did not flag', async () => {
    fakeLibrary({ broken: 'c1', scan: [], lastOpened: 'c1' })
    await expect(bootApp()).rejects.toThrow(/c1/)
  })

  it('lands on the library view when there is nothing to open', async () => {
    useUiStore.getState().setActiveView('editor')
    setFakeApi({
      readSettings: vi.fn(async () => ({ ...settings, demoSeeded: true })),
      applySpellLanguages: vi.fn(async () => {}),
      scanLibrary: vi.fn(async () => []),
      listStories: vi.fn(async () => [])
    })
    await bootApp()
    expect(useUiStore.getState().activeView).toBe('library')
    expect(useSettingsStore.getState().settings).not.toBeNull()
  })
})
