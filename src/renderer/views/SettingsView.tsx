import { useEffect, useState } from 'react'
import { useSettingsStore } from '@renderer/store/settingsStore'
import { useT } from '@renderer/i18n/useT'
import { format } from '@renderer/i18n/strings'
import { isAppError } from '@shared/errors'
import { api, getPlatform } from '@renderer/platform'
import { runLibraryBackup } from '@renderer/backup/run-library-backup'
import { formatBytes } from '@renderer/backup/format-bytes'

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
  const isWeb = getPlatform().capabilities?.evictableStorage === true
  const exportsToDeviceFolder = getPlatform().capabilities?.exportsToDeviceFolder === true
  // MC3: how the library location is presented is a per-platform answer, not something to
  // sniff — see the `libraryLocation` doc comment in platform.ts for what each value means.
  // `capabilities` is optional (so the bare `{ api }` test platform keeps compiling), and the
  // fallback here is deliberately 'path-revealable': that is the behaviour this field renders
  // today, so a platform that never declared keeps exactly what it had rather than silently
  // losing its reveal control or being told its books live in Documents when they do not.
  const libraryLocation = getPlatform().capabilities?.libraryLocation ?? 'path-revealable'
  const storagePersisted = getPlatform().storagePersisted
  const [usage, setUsage] = useState<{ used: number; total: number } | null>(null)
  useEffect(() => {
    if (!isWeb) return
    // Guarded: navigator.storage?.estimate may be undefined; never throw into render.
    void navigator.storage?.estimate?.().then((e) => {
      if (typeof e.usage === 'number' && typeof e.quota === 'number') {
        setUsage({ used: e.usage, total: e.quota })
      }
    }).catch(() => { /* estimate unavailable — leave usage null */ })
  }, [isWeb])
  if (!settings) return <div style={{ padding: 34 }}>{t.settings.loading}</div>

  const exportLibrary = async (): Promise<void> => {
    setExportState({ kind: 'busy' })
    try {
      const result = await runLibraryBackup()
      setExportState(result.canceled ? { kind: 'idle' } : { kind: 'done', path: result.path })
    } catch (err) {
      // UNSUPPORTED means the platform has no export implementation at all (e.g. MC1's
      // Android guard) — "check disk space and permissions" is simply wrong advice
      // there, so that code gets its own message rather than falling into the generic
      // AppError bucket.
      const msg =
        isAppError(err) && err.code === 'UNSUPPORTED'
          ? t.errors.exportLibraryUnsupported
          : isAppError(err)
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

      {isWeb && (
        <div className="settings-field">{t.settings.storageHeading}
          {storagePersisted === true && (
            <div className="settings-note">{t.settings.storagePersisted}</div>
          )}
          {storagePersisted === false && (
            <div className="settings-note settings-note--error">{t.settings.storageNotPersisted}</div>
          )}
          {usage && (
            <div className="settings-note">
              {format(t.settings.storageUsage, {
                used: formatBytes(usage.used),
                total: formatBytes(usage.total)
              })}
            </div>
          )}
        </div>
      )}

      <div className="settings-field">{t.settings.libraryFolder}
        <div className="settings-path">
          {/* On Android the stored path is an internal /storage/emulated/0/... string; showing
              it would send the user hunting for a folder she cannot name. Everywhere else the
              path IS the useful answer (a desktop path she can paste, or web's /library inside
              OPFS, which at least says "not on your disk"). */}
          {libraryLocation === 'androidDocuments'
            ? <span className="settings-location">{t.settings.libraryInDocuments}</span>
            : <code>{settings.libraryPath}</code>}
          {/* Reveal only where an OS file explorer can actually be opened. This DROPS the
              button on web (behaviour change, intentional): `revealInFolder` in
              src/platform/web/index.ts rejects with UNSUPPORTED, so clicking it there only ever
              produced an unhandled rejection — the control was dead from the day web shipped.
              Android has no reliable universal file-manager intent, so it gets none either. */}
          {libraryLocation === 'path-revealable' && (
            <button className="linkish" onClick={() => void api().revealInFolder(settings.libraryPath)}>
              {t.settings.reveal}
            </button>
          )}
          {/* Export stays on every platform: it is unrelated to reveal, and on Android it is
              the ONLY route to a backup the user can copy off the device. */}
          <button
            className="linkish"
            disabled={exportState.kind === 'busy'}
            onClick={() => void exportLibrary()}
          >
            {exportState.kind === 'busy' ? t.settings.exporting : t.settings.exportLibrary}
          </button>
        </div>
        {exportState.kind === 'done' && (
          <div className="settings-note">
            {t.settings.librarySaved} <code>{exportState.path}</code>
            {/* Android only (MC2): exports pile up in one fixed folder nothing prunes, so
                name it plainly — the absolute path above is not something a tablet user can
                act on. Never shown where the user chose the destination herself. */}
            {exportsToDeviceFolder && <div>{t.exportLocation.savedTo}</div>}
          </div>
        )}
        {exportState.kind === 'error' && (
          <div className="settings-note settings-note--error">{exportState.msg}</div>
        )}
      </div>
    </div>
  )
}
