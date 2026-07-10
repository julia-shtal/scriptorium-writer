import { IconCloudCheck, IconAbc, IconDeviceFloppy } from '@tabler/icons-react'
import { useEditorStore, type SaveStatus } from '@renderer/store/editorStore'

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

  return (
    <div className="footer">
      <span className="footer-left">
        <span>
          слов: {wordCount}
          {selectionWordCount > 0 ? ` · выделено: ${selectionWordCount}` : ''}
        </span>
        {/* TODO(M5): live autosave status (saving / saved HH:MM / failed + retry). */}
        <span className="footer-item">
          <IconCloudCheck size={16} color="#7a8a4e" />
          {statusLabel(saveStatus, lastSavedAt)}
        </span>
        {/* TODO(M4): real spellcheck languages from settings. */}
        <span className="footer-item">
          <IconAbc size={16} />
          RU · EN
        </span>
      </span>
      <button className="save-btn" onClick={() => void save()} disabled={saveStatus === 'saving'}>
        <IconDeviceFloppy size={16} />
        Сохранить
      </button>
    </div>
  )
}
