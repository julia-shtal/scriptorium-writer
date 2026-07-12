import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { applySettingsEffects } from './settingsStore'
import type { Settings } from '@shared/types'

const base: Settings = {
  theme: 'book', autosaveIntervalMs: 120000, autosaveDebounceMs: 2000,
  spellLanguages: ['ru', 'en-US'], editorFontFamily: 'PT Serif', editorFontSizePx: 19,
  maxVersionsPerChapter: 20, libraryPath: '/lib', schemaVersion: 1
}

// No jsdom in this repo (vitest.config.ts runs `environment: 'node'`); fake just the
// CSSStyleDeclaration surface applySettingsEffects touches, mirroring how other store
// tests stub `window.api` instead of pulling in a full DOM.
function fakeDocument(): Document {
  const props = new Map<string, string>()
  const style = {
    setProperty: (name: string, value: string) => props.set(name, value),
    removeProperty: (name: string) => props.delete(name),
    getPropertyValue: (name: string) => props.get(name) ?? ''
  }
  return { documentElement: { style } } as unknown as Document
}

describe('applySettingsEffects', () => {
  beforeEach(() => {
    vi.stubGlobal('document', fakeDocument())
  })

  afterEach(() => vi.unstubAllGlobals())

  it('sets editor font CSS variables', () => {
    applySettingsEffects(base, { configureAutosave: vi.fn(), setSpellLanguages: vi.fn(), applySpellLanguages: vi.fn() })
    expect(document.documentElement.style.getPropertyValue('--editor-font-family')).toContain('PT Serif')
    expect(document.documentElement.style.getPropertyValue('--editor-font-size')).toBe('19px')
  })

  it('reconfigures autosave and spellcheck languages', () => {
    const configureAutosave = vi.fn()
    const setSpellLanguages = vi.fn()
    const applySpellLanguages = vi.fn()
    applySettingsEffects(base, { configureAutosave, setSpellLanguages, applySpellLanguages })
    expect(configureAutosave).toHaveBeenCalledWith({ debounceMs: 2000, intervalMs: 120000 })
    expect(setSpellLanguages).toHaveBeenCalledWith(['ru', 'en-US'])
    expect(applySpellLanguages).toHaveBeenCalledWith(['ru', 'en-US'])
  })
})
