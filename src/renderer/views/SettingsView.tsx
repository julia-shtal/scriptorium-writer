import { useState } from 'react'
import { useSettingsStore } from '@renderer/store/settingsStore'
import { useT } from '@renderer/i18n/useT'
import { isAppError } from '@shared/errors'
import { api, getPlatform } from '@renderer/platform'

const FONTS = ['PT Serif', 'Lora', 'Georgia']
const LANGS: { code: string; label: string }[] = [
  { code: 'ru', label: 'Русский' }, { code: 'en-US', label: 'English' }
]

export function SettingsView(): JSX.Element {
  const t = useT()
  const settings = useSettingsStore((s) => s.settings)
  const update = useSettingsStore((s) => s.update)
  const [exportState, setExportState] = useState<
    { kind: 'idle' } | { kind: 'busy' } | { kind: 'done'; path: string } | { kind: 'error'; msg: string }
  >({ kind: 'idle' })
  if (!settings) return <div style={{ padding: 34 }}>{t.settings.loading}</div>

  const exportLibrary = async (): Promise<void> => {
    setExportState({ kind: 'busy' })
    try {
      const result = await api().exportLibrary()
      setExportState(result.canceled ? { kind: 'idle' } : { kind: 'done', path: result.path })
    } catch (err) {
      const msg = isAppError(err)
        ? t.errors.exportLibraryFailedDisk
        : t.errors.exportLibraryFailed
      setExportState({ kind: 'error', msg })
    }
  }

  const toggleLang = (code: string): void => {
    const has = settings.spellLanguages.includes(code)
    const next = has ? settings.spellLanguages.filter((l) => l !== code) : [...settings.spellLanguages, code]
    void update({ spellLanguages: next })
  }

  return (
    <div className="settings-view">
      <h2 className="settings-h">{t.settings.title}</h2>

      <label className="settings-field">{t.settings.language}
        <select value={settings.language} onChange={(e) => void update({ language: e.target.value as 'ru' | 'en' })}>
          <option value="ru">{t.settings.languageRu}</option>
          <option value="en">{t.settings.languageEn}</option>
        </select>
      </label>

      <label className="settings-field">{t.settings.autosaveSec}
        <input type="number" min={5} value={Math.round(settings.autosaveIntervalMs / 1000)}
               onChange={(e) => void update({ autosaveIntervalMs: Number(e.target.value) * 1000 })} />
      </label>

      <fieldset className="settings-field">
        <legend>{t.settings.spellLanguages}</legend>
        {LANGS.map((l) => (
          <label key={l.code} className="settings-check">
            <input type="checkbox" checked={settings.spellLanguages.includes(l.code)}
                   onChange={() => toggleLang(l.code)} /> {l.label}
          </label>
        ))}
        {getPlatform().capabilities?.managedSpellcheck === false && (
          <p className="settings-note">{t.settings.webSpellcheckNote}</p>
        )}
      </fieldset>

      <label className="settings-field">{t.settings.font}
        <select value={settings.editorFontFamily} onChange={(e) => void update({ editorFontFamily: e.target.value })}>
          {FONTS.map((f) => <option key={f} value={f}>{f}</option>)}
        </select>
      </label>

      <label className="settings-field">{t.settings.fontSizePx}
        <input type="number" min={12} max={32} value={settings.editorFontSizePx}
               onChange={(e) => void update({ editorFontSizePx: Number(e.target.value) })} />
      </label>

      <label className="settings-check">
        <input
          type="checkbox"
          checked={settings.hideEditorFooterInfo ?? false}
          onChange={() => void update({ hideEditorFooterInfo: !(settings.hideEditorFooterInfo ?? false) })}
        /> {t.settings.minimalFooter}
      </label>

      <label className="settings-field">{t.settings.versionsPerChapter}
        <input type="number" min={1} value={settings.maxVersionsPerChapter}
               onChange={(e) => void update({ maxVersionsPerChapter: Number(e.target.value) })} />
      </label>

      <div className="settings-field">{t.settings.libraryFolder}
        <div className="settings-path">
          <code>{settings.libraryPath}</code>
          <button className="linkish" onClick={() => void api().revealInFolder(settings.libraryPath)}>
            {t.settings.reveal}
          </button>
          <button
            className="linkish"
            disabled={exportState.kind === 'busy'}
            onClick={() => void exportLibrary()}
          >
            {exportState.kind === 'busy' ? t.settings.exporting : t.settings.exportLibrary}
          </button>
        </div>
        {exportState.kind === 'done' && (
          <div className="settings-note">{t.settings.librarySaved} <code>{exportState.path}</code></div>
        )}
        {exportState.kind === 'error' && (
          <div className="settings-note settings-note--error">{exportState.msg}</div>
        )}
      </div>
    </div>
  )
}
