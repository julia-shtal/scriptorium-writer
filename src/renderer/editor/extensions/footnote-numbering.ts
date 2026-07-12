import type { Node } from '@tiptap/pm/model'

/**
 * 1-based number of the footnote at `pos`, by counting footnote nodes that start
 * before it in document order. Numbering is derived (never stored), so it stays
 * correct after any insert/delete/reorder — the NodeView recomputes on each render.
 */
export function footnoteNumberAt(doc: Node, pos: number): number {
  let count = 0
  doc.descendants((node, nodePos) => {
    if (node.type.name === 'footnote' && nodePos < pos) count += 1
  })
  return count + 1
}
