import { useEffect, useState } from 'react'
import { IconGripVertical, IconPlus, IconTrash } from '@tabler/icons-react'
import { useStoryStore } from '@renderer/store/storyStore'
import { useEditorStore } from '@renderer/store/editorStore'
import { useUiStore } from '@renderer/store/uiStore'

export function ChaptersView(): JSX.Element {
  const story = useStoryStore((s) => s.story)
  const chapters = useStoryStore((s) => s.chapters)
  const setActiveView = useUiStore((s) => s.setActiveView)
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [confirmId, setConfirmId] = useState<string | null>(null)

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

  return (
    <div className="chapters-view">
      <div className="chapters-head">
        <span className="chapters-title">Главы · {chapters.length}</span>
        <button className="linkish" onClick={() => void addChapter()}>
          <IconPlus size={15} /> глава
        </button>
      </div>
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
