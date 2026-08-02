import { useEffect, useRef, useState } from 'react'
import { IconPlus, IconTrash } from '@tabler/icons-react'
import { useStoryStore } from '@renderer/store/storyStore'
import { useT } from '@renderer/i18n/useT'
import type { Notes, NoteEntry } from '@shared/types'

// Fixed Notes categories from the data model. `key` is the persisted category
// key and the stable `t.notes[key]` dictionary key — never the display string.
type ListKey = 'characters' | 'locations' | 'world' | 'timeline'
const SECTION_KEYS: ListKey[] = ['characters', 'locations', 'world', 'timeline']

export function NotesView(): JSX.Element {
  const storyId = useStoryStore((s) => s.story?.id)
  const t = useT()
  const [notes, setNotes] = useState<Notes | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Latest unsaved payload, kept in a ref so the flush-on-unmount/story-switch path
  // can persist it even after the debounce owner has been torn down.
  const pending = useRef<{ storyId: string; notes: Notes } | null>(null)

  const flushPending = (): void => {
    if (timer.current) {
      clearTimeout(timer.current)
      timer.current = null
    }
    if (pending.current) {
      void window.api.saveNotes(pending.current.storyId, pending.current.notes)
      pending.current = null
    }
  }

  useEffect(() => {
    if (!storyId) return
    void window.api.readNotes(storyId).then(setNotes)
    // Flush the departing story's pending edits before this view unmounts or the
    // story changes — otherwise a debounced save inside the 500ms window is lost
    // (reliability #1: never silently drop user edits).
    return () => flushPending()
  }, [storyId])

  const commit = (next: Notes): void => {
    setNotes(next)
    if (!storyId) return
    pending.current = { storyId, notes: next }
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      timer.current = null
      flushPending()
    }, 500)
  }
  const setList = (key: ListKey, list: NoteEntry[]): void => {
    if (notes) commit({ ...notes, [key]: list })
  }

  if (!storyId) return <div style={{ padding: 34 }}>{t.notes.noStory}</div>
  if (!notes) return <div style={{ padding: 34 }}>{t.notes.loading}</div>

  return (
    <div className="notes-view">
      {SECTION_KEYS.map((key) => (
        <section key={key} className="notes-section">
          <div className="notes-section-head">
            <h3>{t.notes[key]}</h3>
            <button className="linkish" onClick={() => setList(key, [...notes[key], { id: crypto.randomUUID(), name: '', body: '' }])}>
              <IconPlus size={15} /> {t.notes.add}
            </button>
          </div>
          {notes[key].map((entry, i) => (
            <div key={entry.id} className="notes-entry">
              <input placeholder={t.notes.namePlaceholder} defaultValue={entry.name}
                     onBlur={(e) => setList(key, notes[key].map((x, j) => j === i ? { ...x, name: e.target.value } : x))} />
              <textarea placeholder={t.notes.bodyPlaceholder} rows={2} defaultValue={entry.body}
                     onBlur={(e) => setList(key, notes[key].map((x, j) => j === i ? { ...x, body: e.target.value } : x))} />
              <button className="linkish" onClick={() => setList(key, notes[key].filter((_, j) => j !== i))}>
                <IconTrash size={15} />
              </button>
            </div>
          ))}
        </section>
      ))}
      <section className="notes-section">
        <h3>{t.notes.scratch}</h3>
        <textarea className="notes-scratch" rows={8} defaultValue={notes.scratch}
                  onBlur={(e) => commit({ ...notes, scratch: e.target.value })} />
      </section>
    </div>
  )
}
