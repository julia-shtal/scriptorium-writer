import type { ProseMirrorJSON } from './types'

/**
 * Gather every `text` node's content from a ProseMirror document into one plain
 * string, joined by single spaces. The canon is opaque to the data layer
 * (SPEC §4), so we walk the node tree generically. Shared so word counting
 * (main + footer) and full-text search (M16) agree on exactly what "the text"
 * of a chapter is.
 *
 * Known limitation carried by the join-by-space approach: adjacent inline text
 * split by a formatting mark gets a space between the pieces, so a word broken
 * across marks won't be found by a substring search. Acceptable for v1 (matches
 * the word-count walker); TODO(M16+): merge adjacent inline runs like M15's
 * computeMatches does.
 */
export function extractPlainText(doc: ProseMirrorJSON): string {
  const parts: string[] = []
  const walk = (node: unknown): void => {
    if (!node || typeof node !== 'object') return
    const record = node as Record<string, unknown>
    if (typeof record.text === 'string') parts.push(record.text)
    if (Array.isArray(record.content)) {
      for (const child of record.content) walk(child)
    }
  }
  walk(doc)
  return parts.join(' ')
}
