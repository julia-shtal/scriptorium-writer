import type { ProseMirrorJSON } from './types'

/** Words in a plain string: trimmed, split on whitespace, empties dropped. */
export function countWordsInText(text: string): number {
  const trimmed = text.trim()
  if (!trimmed) return 0
  return trimmed.split(/\s+/).filter(Boolean).length
}

/**
 * Count words in a ProseMirror document. The canon is opaque to the data layer
 * (SPEC §4), so we walk the node tree generically and gather every `text` node's
 * content, wherever it sits (paragraphs, marks, future inline nodes like
 * footnotes). Shared so main (on save) and the renderer (live footer) agree
 * exactly on the count.
 */
export function countWords(doc: ProseMirrorJSON): number {
  let text = ''
  const walk = (node: unknown): void => {
    if (!node || typeof node !== 'object') return
    const record = node as Record<string, unknown>
    if (typeof record.text === 'string') text += ' ' + record.text
    if (Array.isArray(record.content)) {
      for (const child of record.content) walk(child)
    }
  }
  walk(doc)
  return countWordsInText(text)
}
