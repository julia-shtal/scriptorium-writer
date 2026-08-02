import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { Settings } from '@shared/types'

/**
 * The repo's Vitest project runs in a `node` environment — no jsdom, no
 * @testing-library/react (see vitest.config.ts). `useT` is a thin selector hook
 * over the settings store: it reads `settings?.language ?? 'ru'` through
 * `useSettingsStore(selector)` and returns the matching dictionary.
 *
 * Rather than stand up a DOM to render a hook, we drive `useT` the same way React
 * would: mock `useSettingsStore` so calling it *applies the hook's own selector*
 * to a controllable state. This exercises the real `useT` logic (the `?? 'ru'`
 * default and the en/ru branch) with no new dependencies.
 */
let mockState: { settings: Settings | null } = { settings: null }

vi.mock('@renderer/store/settingsStore', () => ({
  useSettingsStore: <T,>(selector: (s: { settings: Settings | null }) => T): T =>
    selector(mockState)
}))

import { useT } from './useT'

function seed(language: 'ru' | 'en'): void {
  const settings: Settings = {
    theme: 'book',
    autosaveIntervalMs: 120000,
    autosaveDebounceMs: 2000,
    spellLanguages: ['ru', 'en-US'],
    editorFontFamily: 'PT Serif',
    editorFontSizePx: 19,
    maxVersionsPerChapter: 20,
    libraryPath: '/lib',
    language,
    schemaVersion: 1
  }
  mockState = { settings }
}

describe('useT', () => {
  beforeEach(() => {
    mockState = { settings: null }
  })

  it('returns ru dictionary when language is ru', () => {
    seed('ru')
    expect(useT().nav.settings).toBe('Настройки')
  })

  it('returns en dictionary when language is en', () => {
    seed('en')
    expect(useT().nav.settings).toBe('Settings')
  })

  it('defaults to ru when settings is null', () => {
    expect(useT().nav.settings).toBe('Настройки')
  })
})
