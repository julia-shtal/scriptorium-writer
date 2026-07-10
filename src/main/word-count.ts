import type { ProseMirrorJSON } from '@shared/types'

/**
 * Count words in a ProseMirror document. The canon is opaque to the data layer
 * (SPEC §4), so we walk the node tree generically and gather every `text` node's
 * content, wherever it sits (paragraphs, marks, future inline nodes like
 * footnotes). Word count is computed in main as the single source of truth on save.
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
  return text.trim().split(/\s+/).filter(Boolean).length
}
