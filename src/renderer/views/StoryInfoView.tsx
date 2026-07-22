import { useEffect, useState } from 'react'
import { useStoryStore } from '@renderer/store/storyStore'
import { parseTags, formatTags } from './story-tags'
import { STATUS_RU } from './format'
import type { Story, StoryStatus } from '@shared/types'

export function StoryInfoView(): JSX.Element {
  const story = useStoryStore((s) => s.story)
  if (!story) return <div style={{ padding: 34 }}>Нет открытой работы.</div>
  return <StoryInfoForm story={story} />
}

/**
 * Controlled fields backed by local state that commit on blur. Each field re-syncs
 * from the persisted value when *that* value changes (e.g. tags after `parseTags`
 * normalizes `a, a, B` → `a, B`), so the input never diverges from what was saved.
 * Syncing per-field (not on the whole story / its `updatedAt`) means committing one
 * field never disturbs another the user is mid-edit in — no focus hazard.
 */
function StoryInfoForm({ story }: { story: Story }): JSX.Element {
  const updateMeta = useStoryStore((s) => s.updateMeta)
  const [title, setTitle] = useState(story.title)
  const [description, setDescription] = useState(story.description)
  const [tags, setTags] = useState(formatTags(story.tags))
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)
  const exportStory = async (): Promise<void> => {
    setExporting(true)
    setExportError(null)
    try {
      await window.api.exportStoryDocx(story.id)
    } catch {
      setExportError('Не удалось экспортировать историю в .docx.')
    } finally {
      setExporting(false)
    }
  }

  useEffect(() => setTitle(story.title), [story.title])
  useEffect(() => setDescription(story.description), [story.description])
  useEffect(() => setTags(formatTags(story.tags)), [story.tags])

  return (
    <div className="storyinfo-view">
      <h2 className="storyinfo-h">О работе</h2>
      <label className="storyinfo-field">
        Название
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => void updateMeta({ title })}
        />
      </label>
      <label className="storyinfo-field">
        Описание
        <textarea
          value={description}
          rows={5}
          onChange={(e) => setDescription(e.target.value)}
          onBlur={() => void updateMeta({ description })}
        />
      </label>
      <label className="storyinfo-field">
        Теги
        <input
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          onBlur={() => void updateMeta({ tags: parseTags(tags) })}
        />
      </label>
      <label className="storyinfo-field">
        Статус
        <select
          value={story.status}
          onChange={(e) => void updateMeta({ status: e.target.value as StoryStatus })}
        >
          {(Object.keys(STATUS_RU) as StoryStatus[]).map((s) => (
            <option key={s} value={s}>
              {STATUS_RU[s]}
            </option>
          ))}
        </select>
      </label>
      <button className="linkish" disabled={exporting} onClick={() => void exportStory()}>
        {exporting ? 'Экспорт…' : 'Экспортировать историю в .docx'}
      </button>
      {exportError && <div className="storyinfo-note storyinfo-note--error">{exportError}</div>}
    </div>
  )
}
