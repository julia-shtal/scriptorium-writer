import { describe, expect, test } from 'vitest'
import { getSchema } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { Node } from '@tiptap/pm/model'
import { Footnote } from './Footnote'
import { footnoteNumberAt } from './footnote-numbering'

const schema = getSchema([StarterKit, Footnote])

function buildDoc(): { doc: Node; positions: number[] } {
  const fn = (text: string): Node => schema.nodes.footnote.create({ text })
  const para = schema.nodes.paragraph.create(null, [
    schema.text('Hello'),
    fn('a'),
    schema.text(' world'),
    fn('b')
  ])
  const doc = schema.nodes.doc.create(null, [para])
  const positions: number[] = []
  doc.descendants((node, pos) => {
    if (node.type.name === 'footnote') positions.push(pos)
  })
  return { doc, positions }
}

describe('footnoteNumberAt', () => {
  test('numbers footnotes 1..n in document order', () => {
    const { doc, positions } = buildDoc()
    expect(footnoteNumberAt(doc, positions[0])).toBe(1)
    expect(footnoteNumberAt(doc, positions[1])).toBe(2)
  })

  test('returns 1 for the only footnote', () => {
    const only = schema.nodes.doc.create(null, [
      schema.nodes.paragraph.create(null, [schema.nodes.footnote.create({ text: 'x' })])
    ])
    let pos = 0
    only.descendants((node, p) => {
      if (node.type.name === 'footnote') pos = p
    })
    expect(footnoteNumberAt(only, pos)).toBe(1)
  })
})
