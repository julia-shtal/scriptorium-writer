import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { Settings } from '@shared/types'
import { useSettingsStore } from '@renderer/store/settingsStore'
import { resetPlatform } from '@renderer/platform'
import { setFakeApi } from '@renderer/test/fakePlatform'
import { runLibraryBackup } from './run-library-backup'
import { shouldShowBackupNudge } from './nudge'

const settings: Settings = {
  theme: 'book', autosaveIntervalMs: 1, autosaveDebounceMs: 1, spellLanguages: [],
  editorFontFamily: 'x', editorFontSizePx: 16, maxVersionsPerChapter: 5,
  libraryPath: '/lib', language: 'ru', schemaVersion: 1
}

// applySettingsEffects (reached on the persisting path) touches document; stub the one
// surface it uses so these node-env tests never need a DOM.
function fakeDocument(): Document {
  const style = { setProperty: () => {}, removeProperty: () => {}, getPropertyValue: () => '' }
  return { documentElement: { style } } as unknown as Document
}

beforeEach(() => {
  vi.stubGlobal('document', fakeDocument())
  useSettingsStore.setState({ settings: { ...settings } })
})
afterEach(() => { resetPlatform(); vi.unstubAllGlobals() })

describe('runLibraryBackup', () => {
  it('freshens lastLibraryBackupAt in memory even when persisting settings fails', async () => {
    // The archive was written, but writing the timestamp to disk fails.
    setFakeApi({
      exportLibrary: vi.fn(async () => ({ canceled: false, path: 'library.zip' })),
      saveSettings: vi.fn(async () => { throw new Error('OPFS write failed') }),
      applySpellLanguages: vi.fn(async () => {})
    })

    // Must not surface the persist failure as an export failure.
    const result = await runLibraryBackup()
    expect(result).toEqual({ canceled: false, path: 'library.zip' })

    // The in-memory stamp the web nudge reads is fresh, so the nudge hides.
    const stamp = useSettingsStore.getState().settings?.lastLibraryBackupAt
    expect(stamp).toBeTruthy()
    expect(
      shouldShowBackupNudge({ isWeb: true, storyCount: 1, lastLibraryBackupAt: stamp, now: Date.now() })
    ).toBe(false)
  })

  it('records and persists the timestamp on a successful export', async () => {
    const saveSettings = vi.fn(async () => {})
    setFakeApi({
      exportLibrary: vi.fn(async () => ({ canceled: false, path: 'library.zip' })),
      saveSettings,
      applySpellLanguages: vi.fn(async () => {})
    })

    await runLibraryBackup()

    expect(useSettingsStore.getState().settings?.lastLibraryBackupAt).toBeTruthy()
    expect(saveSettings).toHaveBeenCalledTimes(1)
  })

  it('leaves the timestamp untouched when the export is canceled', async () => {
    setFakeApi({
      exportLibrary: vi.fn(async () => ({ canceled: true })),
      saveSettings: vi.fn(async () => {}),
      applySpellLanguages: vi.fn(async () => {})
    })

    await runLibraryBackup()

    expect(useSettingsStore.getState().settings?.lastLibraryBackupAt).toBeUndefined()
  })
})
