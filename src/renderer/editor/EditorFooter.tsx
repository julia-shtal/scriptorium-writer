import { IconCloudCheck, IconAbc, IconDeviceFloppy } from '@tabler/icons-react'
import { useEditorStore, type SaveStatus } from '@renderer/store/editorStore'
import { useUiStore } from '@renderer/store/uiStore'

const LANG_LABELS: Record<string, string> = { ru: 'RU', 'en-US': 'EN', en: 'EN' }

/** Short uppercase labels for the footer spellcheck indicator, e.g. `RU · EN`. */
export function formatSpellLanguages(langs: readonly string[]): string {
  if (langs.length === 0) return '—'
  return langs.map((l) => LANG_LABELS[l] ?? l.split('-')[0].toUpperCase()).join(' · ')
}

function statusLabel(status: SaveStatus, lastSavedAt: string | null): string {
  switch (status) {
    case 'saving':
      return 'сохранение…'
    case 'error':
      return 'ошибка сохранения'
    case 'saved':
    case 'idle':
      return lastSavedAt
        ? `сохранено ${new Date(lastSavedAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`
        : 'не сохранено'
    default:
      return 'редактирование…'
  }
}

export function EditorFooter(): JSX.Element {
  const wordCount = useEditorStore((s) => s.wordCount)
  const selectionWordCount = useEditorStore((s) => s.selectionWordCount)
  const saveStatus = useEditorStore((s) => s.saveStatus)
  const lastSavedAt = useEditorStore((s) => s.lastSavedAt)
  const save = useEditorStore((s) => s.save)
  const spellLanguages = useUiStore((s) => s.spellLanguages)

  return (
    <div className="footer">
      <span className="footer-left">
        <span>
          слов: {wordCount}
          {selectionWordCount > 0 ? ` · выделено: ${selectionWordCount}` : ''}
        </span>
        {/* Live autosave status (saving / saved HH:MM / failed + retry). */}
        <span className="footer-item">
          <IconCloudCheck size={16} color="#7a8a4e" />
          {statusLabel(saveStatus, lastSavedAt)}
          {saveStatus === 'error' && (
            <button className="retry-btn" onClick={() => void save()}>
              повторить
            </button>
          )}
        </span>
        <span className="footer-item">
          <IconAbc size={16} />
          {formatSpellLanguages(spellLanguages)}
        </span>
      </span>
      <button className="save-btn" onClick={() => void save()} disabled={saveStatus === 'saving'}>
        <IconDeviceFloppy size={16} />
        Сохранить
      </button>
    </div>
  )
}
