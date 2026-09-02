// src/renderer/editor/find/computeMatches.ts
//
// Pure, DOM-free chapter match finder for M15 Find & Replace. Walks the ProseMirror doc
// into flattened text RUNS (contiguous inline text within one block, marks flattened)
// with each run remembering its absolute start position, so a match is found even when
// marks split it across text nodes — and a match can never span a block boundary or an
// inline atom (footnote / hard_break), because those break the run.
//
// TODO(M15+): out of scope in v1 — regex matching, and cross-chapter / whole-story
// search (which would take a story's chapter docs here rather than a single doc). The
// single-doc signature below is the seam where a multi-doc walker would plug in.

import type { Node as PMNode } from '@tiptap/pm/model'

export interface FindMatch {
  from: number
  to: number
}

export interface FindOptions {
  caseSensitive: boolean
  wholeWord: boolean
}

/** Unicode letter/number test for whole-word boundaries (RU + EN + more). */
const WORD = /[\p{L}\p{N}]/u

interface Run {
  text: string
  from: number
}

function collectRuns(doc: PMNode): Run[] {
  const runs: Run[] = []
  let current: Run | null = null

  const flush = (): void => {
    if (current && current.text.length > 0) runs.push(current)
    current = null
  }

  doc.descendants((node, pos) => {
    if (node.isText) {
      const t = node.text ?? ''
      if (current && current.from + current.text.length === pos) {
        current.text += t
      } else {
        flush()
        current = { text: t, from: pos }
      }
      return false // text has no children
    }
    flush() // any non-text node (block or inline atom) breaks the run
    return true // descend to reach text inside block nodes
  })
  flush()
  return runs
}

function isWholeWord(text: string, from: number, to: number): boolean {
  const before = from > 0 ? text[from - 1] : ''
  const after = to < text.length ? text[to] : ''
  return !WORD.test(before) && !WORD.test(after)
}

/**
 * All non-overlapping matches of `query` in the chapter, ascending by `from`.
 *
 * Case-insensitive comparison lower-cases both sides with `toLocaleLowerCase('ru')`.
 * Safe for this app's RU/EN content, where lower-casing is 1:1 in length so an index
 * into the lower-cased haystack maps back to the original position. (Length-changing
 * folds like Turkish İ or ß are out of scope — see internal/m15.md.)
 */
export function computeMatches(doc: PMNode, query: string, opts: FindOptions): FindMatch[] {
  if (query.trim().length === 0) return []
  const needle = opts.caseSensitive ? query : query.toLocaleLowerCase('ru')
  const matches: FindMatch[] = []

  for (const run of collectRuns(doc)) {
    const hay = opts.caseSensitive ? run.text : run.text.toLocaleLowerCase('ru')
    let idx = hay.indexOf(needle, 0)
    while (idx !== -1) {
      const end = idx + needle.length
      if (!opts.wholeWord || isWholeWord(run.text, idx, end)) {
        matches.push({ from: run.from + idx, to: run.from + end })
      }
      idx = hay.indexOf(needle, end) // advance past match → non-overlapping
    }
  }
  return matches
}
