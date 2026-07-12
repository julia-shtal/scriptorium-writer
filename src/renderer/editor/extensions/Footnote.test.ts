import { describe, expect, test } from 'vitest'
import { getSchema } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { Footnote } from './Footnote'

describe('Footnote', () => {
  test('registers an inline atom node named footnote', () => {
    const schema = getSchema([StarterKit, Footnote])
    const node = schema.nodes.footnote
    expect(node).toBeDefined()
    expect(node.isInline).toBe(true)
    expect(node.isAtom).toBe(true)
  })

  test('serializes to JSON with its text attribute, losslessly', () => {
    const schema = getSchema([StarterKit, Footnote])
    const json = schema.nodes.footnote.create({ text: 'a note' }).toJSON()
    expect(json).toEqual({ type: 'footnote', attrs: { text: 'a note' } })
  })

  test('defaults text to empty string', () => {
    const schema = getSchema([StarterKit, Footnote])
    expect(schema.nodes.footnote.create().attrs.text).toBe('')
  })
})
