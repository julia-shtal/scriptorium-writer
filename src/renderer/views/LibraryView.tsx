import { useEffect, useState } from 'react'
import { IconBooks, IconTrash, IconPlus } from '@tabler/icons-react'
import { useStoryStore } from '@renderer/store/storyStore'
import { useUiStore } from '@renderer/store/uiStore'
import type { StorySummary } from '@shared/types'
import { STATUS_RU, formatDate } from './format'

export function LibraryView(): JSX.Element {
  const [rows, setRows] = useState<StorySummary[]>([])
  const [title, setTitle] = useState('')
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const setActiveView = useUiStore((s) => s.setActiveView)

  const refresh = async (): Promise<void> => setRows(await window.api.listStories())
  useEffect(() => {
    void refresh()
  }, [])

  const open = async (id: string): Promise<void> => {
    await useStoryStore.getState().openStory(id)
    setActiveView('editor')
  }
  const create = async (): Promise<void> => {
    if (!title.trim()) return
    await window.api.createStory({ title: title.trim() })
    setTitle('')
    await refresh()
  }
  const remove = async (id: string): Promise<void> => {
    await window.api.deleteStory(id)
    setConfirmId(null)
    await refresh()
  }

  return (
    <div className="library-view">
      <div className="library-head">
        <span className="library-title">
          <IconBooks size={18} /> Библиотека · {rows.length}
        </span>
        <div className="library-create">
          <input
            value={title}
            placeholder="Название новой работы"
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void create()}
          />
          <button className="linkish" disabled={!title.trim()} onClick={() => void create()}>
            <IconPlus size={15} /> создать
          </button>
        </div>
      </div>
      <ul className="library-list">
        {rows.map((r) => (
          <li key={r.id} className="library-card" onClick={() => void open(r.id)}>
            <span className="library-card-title">{r.title}</span>
            <span className={`chip chip-${r.status}`}>{STATUS_RU[r.status]}</span>
            <span className="library-meta">
              {r.chapterCount} гл · {r.wordCount} сл
            </span>
            <span className="library-meta">{formatDate(r.updatedAt)}</span>
            {confirmId === r.id ? (
              <span className="library-confirm" onClick={(e) => e.stopPropagation()}>
                Удалить?{' '}
                <button className="linkish" onClick={() => void remove(r.id)}>
                  да
                </button>
                <button className="linkish" onClick={() => setConfirmId(null)}>
                  нет
                </button>
              </span>
            ) : (
              <button
                className="linkish"
                onClick={(e) => {
                  e.stopPropagation()
                  setConfirmId(r.id)
                }}
              >
                <IconTrash size={15} />
              </button>
            )}
          </li>
        ))}
        {rows.length === 0 && <li className="library-empty">Пока нет работ. Создайте первую.</li>}
      </ul>
    </div>
  )
}
