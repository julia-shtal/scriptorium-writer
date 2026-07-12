import { create } from 'zustand'
import type { Settings } from '@shared/types'
import { useEditorStore } from './editorStore'
import { useUiStore } from './uiStore'

/** Side-effect sinks, injected so the pure effect-applier is testable. */
export interface SettingsEffectDeps {
  configureAutosave: (cfg: { debounceMs: number; intervalMs: number }) => void
  setSpellLanguages: (langs: string[]) => void
  applySpellLanguages: (langs: string[]) => Promise<void> | void
}

/** Apply a settings object to the live app (fonts, autosave, spellcheck). */
export function applySettingsEffects(s: Settings, deps: SettingsEffectDeps): void {
  const root = document.documentElement.style
  root.setProperty('--editor-font-family', `"${s.editorFontFamily}"`)
  root.setProperty('--editor-font-size', `${s.editorFontSizePx}px`)
  deps.configureAutosave({ debounceMs: s.autosaveDebounceMs, intervalMs: s.autosaveIntervalMs })
  deps.setSpellLanguages(s.spellLanguages)
  void deps.applySpellLanguages(s.spellLanguages)
}

function liveDeps(): SettingsEffectDeps {
  return {
    configureAutosave: useEditorStore.getState().configureAutosave,
    setSpellLanguages: useUiStore.getState().setSpellLanguages,
    applySpellLanguages: (langs) => window.api.applySpellLanguages(langs)
  }
}

interface SettingsState {
  settings: Settings | null
  load: () => Promise<void>
  update: (patch: Partial<Settings>) => Promise<void>
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: null,
  load: async () => {
    const settings = await window.api.readSettings()
    set({ settings })
    applySettingsEffects(settings, liveDeps())
  },
  update: async (patch) => {
    const current = get().settings
    if (!current) return
    const next: Settings = { ...current, ...patch }
    await window.api.saveSettings(next)
    set({ settings: next })
    applySettingsEffects(next, liveDeps())
  }
}))
