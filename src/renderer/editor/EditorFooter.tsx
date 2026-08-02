import { IconCloudCheck, IconAbc, IconDeviceFloppy } from '@tabler/icons-react'
import { useEditorStore, type SaveStatus } from '@renderer/store/editorStore'
import { useUiStore } from '@renderer/store/uiStore'
import { useSettingsStore } from '@renderer/store/settingsStore'
import { useT } from '@renderer/i18n/useT'
import { format, type Dictionary } from '@renderer/i18n/strings'
import { plural } from '@renderer/i18n/plural'

const LANG_LABELS: Record<string, string> = { ru: 'RU', 'en-US': 'EN', en: 'EN' }

/** Short uppercase labels for the footer spellcheck indicator, e.g. `RU · EN`. */
export function formatSpellLanguages(langs: readonly string[]): string {
  if (langs.length === 0) return '—'
  return langs.map((l) => LANG_LABELS[l] ?? l.split('-')[0].toUpperCase()).join(' · ')
}

function statusLabel(
  t: Dictionary,
  language: string,
  status: SaveStatus,
  lastSavedAt: string | null
): string {
  switch (status) {
    case 'saving':
      return t.editor.saving
    case 'error':
      return t.editor.saveError
    case 'saved':
    case 'idle':
      return lastSavedAt
        ? format(t.editor.savedAt, {
            time: new Date(lastSavedAt).toLocaleTimeString(language === 'en' ? 'en-US' : 'ru-RU', {
              hour: '2-digit',
              minute: '2-digit'
            })
          })
        : t.editor.unsaved
    default:
      return t.editor.editing
  }
}

/** Footer info line is shown unless the writer hid it — but a save error always forces it back. */
export function shouldShowFooterInfo(hideInfo: boolean, saveStatus: SaveStatus): boolean {
  return !hideInfo || saveStatus === 'error'
}

export function EditorFooter(): JSX.Element {
  const wordCount = useEditorStore((s) => s.wordCount)
  const selectionWordCount = useEditorStore((s) => s.selectionWordCount)
  const saveStatus = useEditorStore((s) => s.saveStatus)
  const lastSavedAt = useEditorStore((s) => s.lastSavedAt)
  const mdWarning = useEditorStore((s) => s.mdWarning)
  const save = useEditorStore((s) => s.save)
  const spellLanguages = useUiStore((s) => s.spellLanguages)
  const hideInfo = useSettingsStore((s) => s.settings?.hideEditorFooterInfo ?? false)
  const language = useSettingsStore((s) => s.settings?.language ?? 'ru')
  const t = useT()

  return (
    <div className="footer">
      {shouldShowFooterInfo(hideInfo, saveStatus) && (
        <span className="footer-left">
          <span>
            {wordCount} {plural(wordCount, t.plurals.words, language)}
            {selectionWordCount > 0
              ? format(t.editor.selected, {
                  phrase: `${selectionWordCount} ${plural(selectionWordCount, t.plurals.words, language)}`
                })
              : ''}
          </span>
          {/* Live autosave status (saving / saved HH:MM / failed + retry). */}
          <span className="footer-item">
            <IconCloudCheck size={16} color="#7a8a4e" />
            {statusLabel(t, language, saveStatus, lastSavedAt)}
            {saveStatus === 'error' && (
              <button className="retry-btn" onClick={() => void save()}>
                {t.editor.retry}
              </button>
            )}
            {mdWarning && (
              <span className="save-warning" title={mdWarning}>
                {t.editor.mdWarning}
              </span>
            )}
          </span>
          <span className="footer-item">
            <IconAbc size={16} />
            {formatSpellLanguages(spellLanguages)}
          </span>
        </span>
      )}
      <button className="save-btn" onClick={() => void save()}>
        <IconDeviceFloppy size={16} />
        {t.editor.save}
      </button>
    </div>
  )
}
