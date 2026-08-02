import type { ProseMirrorJSON } from './types'
import { extractPlainText } from './doc-text'

/** Words in a plain string: trimmed, split on whitespace, empties dropped. */
export function countWordsInText(text: string): number {
  const trimmed = text.trim()
  if (!trimmed) return 0
  return trimmed.split(/\s+/).filter(Boolean).length
}

/**
 * Count words in a ProseMirror document. Reuses `extractPlainText` so word
 * counting and full-text search (M16) walk the canon exactly the same way —
 * one walker, not two. Shared so main (on save) and the renderer (live footer)
 * agree on the count.
 */
export function countWords(doc: ProseMirrorJSON): number {
  return countWordsInText(extractPlainText(doc))
}
