import type { Story } from '@shared/types'
import { extractPlainText } from '@shared/doc-text'
import { makeSnippet, type Snippet } from './snippet'

export type NoteSection = 'characters' | 'locations' | 'world' | 'timeline' | 'scratch'

export interface SearchMatch {
  kind: 'chapter' | 'note'
  /** Present when kind === 'chapter'; the chapter to open. */
  chapterId?: string
  /** Present when kind === 'note'; used only for the row label (no deep-link). */
  noteSection?: NoteSection
  noteEntryName?: string
  /** Row heading, e.g. the chapter title or "Персонажи · Иван". */
  label: string
  /** Total occurrences in this source. */
  count: number
  /** First occurrence, with surrounding context. */
  snippet: Snippet
}

export interface SearchOutcome {
  matches: SearchMatch[]
  /** Chapters whose canon could not be read; surfaced as a soft notice. */
  failedChapters: number
  /** True when the story's notes could not be read. */
  notesFailed: boolean
}

/**
 * Localized section-chrome labels, threaded in from the caller (where `useT` is
 * available). Author data — chapter titles and note entry names — is never
 * routed through here; only the fixed section headings and untitled fallback.
 */
export interface SearchLabels {
  characters: string
  locations: string
  world: string
  timeline: string
  scratch: string
  untitled: string
}

/**
 * All start offsets of `query` in `haystack`, case-insensitively. Both sides are
 * lower-cased with `toLocaleLowerCase('ru')` — a 1:1-length fold for this app's
 * RU/EN content, so offsets map back to the original text (same convention as
 * M15's computeMatches).
 */
export function findOffsets(haystack: string, query: string): number[] {
  const q = query.toLocaleLowerCase('ru')
  if (q.length === 0) return []
  const hay = haystack.toLocaleLowerCase('ru')
  const offsets: number[] = []
  let idx = hay.indexOf(q, 0)
  while (idx !== -1) {
    offsets.push(idx)
    idx = hay.indexOf(q, idx + q.length) // non-overlapping
  }
  return offsets
}

/**
 * Read-only full-text search across the open story: every chapter's canon plus
 * every Notes section. Never calls a write API — pure read, cannot corrupt the
 * library. Matching is plain case-insensitive substring.
 *
 * TODO(M16+): the single-`story` signature is the seam for cross-story search.
 */
export async function searchStory(
  story: Story,
  query: string,
  labels: SearchLabels
): Promise<SearchOutcome> {
  const q = query.trim()
  if (q.length === 0) return { matches: [], failedChapters: 0, notesFailed: false }

  const matches: SearchMatch[] = []
  let failedChapters = 0

  for (const chapterId of story.chapterOrder) {
    try {
      const chapter = await window.api.readChapter(story.id, chapterId)
      const text = extractPlainText(chapter.doc)
      const offsets = findOffsets(text, q)
      if (offsets.length > 0) {
        matches.push({
          kind: 'chapter',
          chapterId,
          label: chapter.title || labels.untitled,
          count: offsets.length,
          snippet: makeSnippet(text, offsets[0], q.length)
        })
      }
    } catch {
      failedChapters++
    }
  }

  let notesFailed = false
  try {
    const notes = await window.api.readNotes(story.id)
    const pushField = (section: NoteSection, entryName: string | undefined, text: string): void => {
      const offsets = findOffsets(text, q)
      if (offsets.length === 0) return
      const sectionLabel = labels[section]
      matches.push({
        kind: 'note',
        noteSection: section,
        noteEntryName: entryName,
        label: entryName ? `${sectionLabel} · ${entryName}` : sectionLabel,
        count: offsets.length,
        snippet: makeSnippet(text, offsets[0], q.length)
      })
    }
    for (const section of ['characters', 'locations', 'world', 'timeline'] as const) {
      for (const entry of notes[section]) {
        // Search name + body together so a hit in either surfaces the entry.
        pushField(section, entry.name || undefined, `${entry.name} ${entry.body}`)
      }
    }
    if (notes.scratch) pushField('scratch', undefined, notes.scratch)
  } catch {
    notesFailed = true
  }

  return { matches, failedChapters, notesFailed }
}
