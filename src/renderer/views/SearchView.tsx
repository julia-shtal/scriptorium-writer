import { useState } from 'react'
import { IconSearch } from '@tabler/icons-react'
import { useStoryStore } from '@renderer/store/storyStore'
import { useEditorStore } from '@renderer/store/editorStore'
import { useUiStore } from '@renderer/store/uiStore'
import { useT } from '@renderer/i18n/useT'
import { format } from '@renderer/i18n/strings'
import { searchStory, type SearchMatch, type SearchOutcome } from '@renderer/search/searchStory'
import { navigateToResult } from '@renderer/search/navigateToResult'

export function SearchView(): JSX.Element {
  const t = useT()
  const story = useStoryStore((s) => s.story)
  const [query, setQuery] = useState('')
  const [submitted, setSubmitted] = useState('')
  const [outcome, setOutcome] = useState<SearchOutcome | null>(null)
  const [searching, setSearching] = useState(false)

  if (!story) return <div style={{ padding: 34 }}>{t.search.noStory}</div>

  const run = async (): Promise<void> => {
    const q = query.trim()
    if (!q) {
      setOutcome(null)
      setSubmitted('')
      return
    }
    setSearching(true)
    setSubmitted(q)
    try {
      setOutcome(
        await searchStory(story, q, {
          characters: t.notes.characters,
          locations: t.notes.locations,
          world: t.notes.world,
          timeline: t.notes.timeline,
          scratch: t.notes.scratch,
          untitled: t.chapters.untitled
        })
      )
    } finally {
      setSearching(false)
    }
  }

  const onClickResult = (m: SearchMatch): void => {
    void navigateToResult(m, story.id, submitted, {
      openChapter: useEditorStore.getState().openChapter,
      setActiveView: useUiStore.getState().setActiveView,
      setFindQuery: useUiStore.getState().setFindQuery,
      setFindOpen: useUiStore.getState().setFindOpen
    })
  }

  return (
    <div className="search-view">
      <div className="search-head">
        <IconSearch size={17} />
        <input
          className="search-input"
          placeholder={t.search.placeholder}
          value={query}
          autoFocus
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void run()}
        />
        <button className="linkish" onClick={() => void run()}>{t.search.find}</button>
      </div>

      {searching && <div className="search-note">{t.search.searching}</div>}

      {outcome && !searching && (
        <>
          {(outcome.failedChapters > 0 || outcome.notesFailed) && (
            <div className="search-note">
              {t.search.partialRead}
              {outcome.failedChapters > 0
                ? format(t.search.partialReadChapters, { count: String(outcome.failedChapters) })
                : ''}
              .
            </div>
          )}
          {outcome.matches.length === 0 ? (
            <div className="search-note">{t.search.empty}</div>
          ) : (
            <ul className="search-results">
              {outcome.matches.map((m, i) => (
                <li key={i} className="search-result" onClick={() => onClickResult(m)}>
                  <div className="search-result-head">
                    <span className="search-result-label">{m.label}</span>
                    <span className="search-result-count">{m.count}</span>
                  </div>
                  <div className="search-snippet">
                    {m.snippet.truncatedStart && '… '}
                    {m.snippet.before}
                    <mark>{m.snippet.match}</mark>
                    {m.snippet.after}
                    {m.snippet.truncatedEnd && ' …'}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  )
}
