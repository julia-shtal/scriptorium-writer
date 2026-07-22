import { useEffect, useState } from 'react'
import { IconGripVertical, IconPlus, IconTrash } from '@tabler/icons-react'
import { useStoryStore } from '@renderer/store/storyStore'
import { useEditorStore } from '@renderer/store/editorStore'
import { useUiStore } from '@renderer/store/uiStore'
import { runImport, type ImportMode } from '@renderer/editor/import/importChapters'

export function ChaptersView(): JSX.Element {
  const story = useStoryStore((s) => s.story)
  const chapters = useStoryStore((s) => s.chapters)
  const setActiveView = useUiStore((s) => s.setActiveView)
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [splitByHeadings, setSplitByHeadings] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  // Refresh chapter titles/word counts on entry so edits made in the editor since
  // the story was loaded are reflected here.
  useEffect(() => {
    void useStoryStore.getState().reload()
  }, [])

  if (!story) return <div style={{ padding: 34 }}>Нет открытой работы.</div>

  const openCh = async (id: string): Promise<void> => {
    await useEditorStore.getState().openChapter(story.id, id)
    setActiveView('editor')
  }
  const drop = async (to: number): Promise<void> => {
    if (dragIndex !== null && dragIndex !== to) {
      await useStoryStore.getState().moveChapter(dragIndex, to)
    }
    setDragIndex(null)
  }
  const addChapter = async (): Promise<void> => {
    await useStoryStore.getState().addChapter('Новая глава')
    setActiveView('editor')
  }
  const doImport = async (mode: ImportMode): Promise<void> => {
    if (!story) return
    setNotice(null)
    try {
      const result = await window.api.readImportFile()
      if (result.canceled) return
      const outcome = await runImport(story.id, result, mode)
      if (outcome.warnings.length > 0) {
        setNotice('Часть форматирования могла не сохраниться при импорте.')
      }
    } catch {
      // A split import isn't transactional: some chapters may already be created
      // before a later save fails. Acknowledge partial progress in the message and
      // always reload below so any created chapters still appear.
      setNotice(
        'Не удалось импортировать файл целиком. Возможно, он повреждён или в неподдерживаемом формате; часть глав могла быть создана.'
      )
    } finally {
      await useStoryStore.getState().reload()
    }
  }
  const exportChapter = async (chapterId: string): Promise<void> => {
    if (!story) return
    setNotice(null)
    try {
      await window.api.exportChapterDocx(story.id, chapterId)
    } catch {
      setNotice('Не удалось экспортировать главу в .docx.')
    }
  }

  return (
    <div className="chapters-view">
      <div className="chapters-head">
        <span className="chapters-title">Главы · {chapters.length}</span>
        <button className="linkish" onClick={() => void addChapter()}>
          <IconPlus size={15} /> глава
        </button>
        <button className="linkish" onClick={() => void doImport('single')}>
          Импортировать главу
        </button>
        <button className="linkish" onClick={() => void doImport(splitByHeadings ? 'split' : 'single')}>
          Импортировать историю
        </button>
        <label className="chapters-split-check">
          <input
            type="checkbox"
            checked={splitByHeadings}
            onChange={(e) => setSplitByHeadings(e.target.checked)}
          />
          Разбить по заголовкам на отдельные главы
        </label>
      </div>
      {notice && <div className="chapters-note">{notice}</div>}
      <ul className="chapters-list">
        {chapters.map((c, i) => (
          <li
            key={c.id}
            className="chapters-row"
            draggable
            onDragStart={() => setDragIndex(i)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => void drop(i)}
          >
            <IconGripVertical size={16} className="chapters-grip" />
            <input
              className="chapters-title-input"
              defaultValue={c.title}
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
              onBlur={(e) => void useStoryStore.getState().renameChapter(c.id, e.target.value)}
            />
            <span className="chapters-open linkish" onClick={() => void openCh(c.id)}>
              открыть
            </span>
            <span className="chapters-open linkish" onClick={() => void exportChapter(c.id)}>
              в .docx
            </span>
            <span className="chapters-words">{c.wordCount} сл</span>
            {confirmId === c.id ? (
              <span className="chapters-confirm">
                удалить?{' '}
                <button
                  className="linkish"
                  onClick={() => {
                    void useStoryStore.getState().removeChapter(c.id)
                    setConfirmId(null)
                  }}
                >
                  да
                </button>
                <button className="linkish" onClick={() => setConfirmId(null)}>
                  нет
                </button>
              </span>
            ) : (
              <button className="linkish" onClick={() => setConfirmId(c.id)}>
                <IconTrash size={15} />
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
