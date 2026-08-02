import { useEffect, useState } from 'react'
import { useStoryStore } from '@renderer/store/storyStore'
import { parseTags, formatTags } from './story-tags'
import { useT } from '@renderer/i18n/useT'
import type { Story, StoryStatus } from '@shared/types'

export function StoryInfoView(): JSX.Element {
  const story = useStoryStore((s) => s.story)
  const t = useT()
  if (!story) return <div style={{ padding: 34 }}>{t.storyInfo.noStory}</div>
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
  const t = useT()
  const [title, setTitle] = useState(story.title)
  const [description, setDescription] = useState(story.description)
  const [tags, setTags] = useState(formatTags(story.tags))

  useEffect(() => setTitle(story.title), [story.title])
  useEffect(() => setDescription(story.description), [story.description])
  useEffect(() => setTags(formatTags(story.tags)), [story.tags])

  return (
    <div className="storyinfo-view">
      <h2 className="storyinfo-h">{t.storyInfo.heading}</h2>
      <label className="storyinfo-field">
        {t.storyInfo.titleLabel}
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => void updateMeta({ title })}
        />
      </label>
      <label className="storyinfo-field">
        {t.storyInfo.descriptionLabel}
        <textarea
          value={description}
          rows={5}
          onChange={(e) => setDescription(e.target.value)}
          onBlur={() => void updateMeta({ description })}
        />
      </label>
      <label className="storyinfo-field">
        {t.storyInfo.tagsLabel}
        <input
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          onBlur={() => void updateMeta({ tags: parseTags(tags) })}
        />
      </label>
      <label className="storyinfo-field">
        {t.storyInfo.statusLabel}
        <select
          value={story.status}
          onChange={(e) => void updateMeta({ status: e.target.value as StoryStatus })}
        >
          {(Object.keys(t.status) as StoryStatus[]).map((s) => (
            <option key={s} value={s}>
              {t.status[s]}
            </option>
          ))}
        </select>
      </label>
    </div>
  )
}
