import { useState } from 'react'
import { useSettingsStore } from '@renderer/store/settingsStore'
import { isAppError } from '@shared/errors'

const FONTS = ['PT Serif', 'Lora', 'Georgia']
const LANGS: { code: string; label: string }[] = [
  { code: 'ru', label: 'Русский' }, { code: 'en-US', label: 'English' }
]

export function SettingsView(): JSX.Element {
  const settings = useSettingsStore((s) => s.settings)
  const update = useSettingsStore((s) => s.update)
  const [exportState, setExportState] = useState<
    { kind: 'idle' } | { kind: 'busy' } | { kind: 'done'; path: string } | { kind: 'error'; msg: string }
  >({ kind: 'idle' })
  if (!settings) return <div style={{ padding: 34 }}>Загрузка настроек…</div>

  const exportLibrary = async (): Promise<void> => {
    setExportState({ kind: 'busy' })
    try {
      const result = await window.api.exportLibrary()
      setExportState(result.canceled ? { kind: 'idle' } : { kind: 'done', path: result.path })
    } catch (err) {
      const msg = isAppError(err)
        ? 'Не удалось сохранить архив библиотеки. Проверьте место на диске и права доступа.'
        : 'Не удалось экспортировать библиотеку.'
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
      <h2 className="settings-h">Настройки</h2>

      <label className="settings-field">Автосохранение, сек
        <input type="number" min={5} value={Math.round(settings.autosaveIntervalMs / 1000)}
               onChange={(e) => void update({ autosaveIntervalMs: Number(e.target.value) * 1000 })} />
      </label>

      <fieldset className="settings-field">
        <legend>Языки проверки</legend>
        {LANGS.map((l) => (
          <label key={l.code} className="settings-check">
            <input type="checkbox" checked={settings.spellLanguages.includes(l.code)}
                   onChange={() => toggleLang(l.code)} /> {l.label}
          </label>
        ))}
      </fieldset>

      <label className="settings-field">Шрифт
        <select value={settings.editorFontFamily} onChange={(e) => void update({ editorFontFamily: e.target.value })}>
          {FONTS.map((f) => <option key={f} value={f}>{f}</option>)}
        </select>
      </label>

      <label className="settings-field">Размер шрифта, px
        <input type="number" min={12} max={32} value={settings.editorFontSizePx}
               onChange={(e) => void update({ editorFontSizePx: Number(e.target.value) })} />
      </label>

      <label className="settings-field">Версий на главу
        <input type="number" min={1} value={settings.maxVersionsPerChapter}
               onChange={(e) => void update({ maxVersionsPerChapter: Number(e.target.value) })} />
      </label>

      <div className="settings-field">Папка библиотеки
        <div className="settings-path">
          <code>{settings.libraryPath}</code>
          <button className="linkish" onClick={() => void window.api.revealInFolder(settings.libraryPath)}>
            показать
          </button>
          <button
            className="linkish"
            disabled={exportState.kind === 'busy'}
            onClick={() => void exportLibrary()}
          >
            {exportState.kind === 'busy' ? 'Экспорт…' : 'Экспортировать библиотеку'}
          </button>
        </div>
        {exportState.kind === 'done' && (
          <div className="settings-note">Библиотека сохранена: <code>{exportState.path}</code></div>
        )}
        {exportState.kind === 'error' && (
          <div className="settings-note settings-note--error">{exportState.msg}</div>
        )}
      </div>
    </div>
  )
}
