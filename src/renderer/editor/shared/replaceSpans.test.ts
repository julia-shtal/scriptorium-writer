import { describe, it, expect } from 'vitest'
import { EditorState } from '@tiptap/pm/state'
import { getSchema } from '@tiptap/core'
import { bookExtensions } from '@renderer/editor/extensions/bookExtensions'
import { buildSpanReplaceTransaction } from './replaceSpans'

const schema = getSchema(bookExtensions)

function stateFromText(text: string): EditorState {
  const doc = schema.node('doc', null, [schema.node('paragraph', null, text ? [schema.text(text)] : [])])
  return EditorState.create({ schema, doc })
}

describe('buildSpanReplaceTransaction', () => {
  it('applies multiple spans rightmost-first so positions stay valid', () => {
    const state = stateFromText('one two three')
    const tr = buildSpanReplaceTransaction(
      state,
      [
        { from: 1, to: 4, newText: '1' },
        { from: 9, to: 14, newText: '3' }
      ],
      'findReplace'
    )
    expect(tr.doc.textContent).toBe('1 two 3')
  })

  it('deletes when newText is empty', () => {
    const state = stateFromText('abXYcd')
    const tr = buildSpanReplaceTransaction(state, [{ from: 3, to: 5, newText: '' }], 'findReplace')
    expect(tr.doc.textContent).toBe('abcd')
  })

  it('preserves marks present at the span start', () => {
    // Whole doc is one bold run, so `resolve(from).marks()` unambiguously picks up the
    // bold mark (no unmarked neighbour to create ambiguity at the boundary).
    const bold = schema.marks.bold
    const doc = schema.node('doc', null, [
      schema.node('paragraph', null, [schema.text('bold text', [bold.create()])])
    ])
    const state = EditorState.create({ schema, doc })
    const tr = buildSpanReplaceTransaction(state, [{ from: 1, to: 5, newText: 'X' }], 'findReplace')
    expect(tr.doc.textContent).toBe('X text')
    let allBold = true
    tr.doc.descendants((node) => {
      if (node.isText) allBold = allBold && node.marks.some((m) => m.type === bold)
    })
    expect(allBold).toBe(true)
  })

  it('tags the transaction with the given meta key', () => {
    const state = stateFromText('hello')
    const tr = buildSpanReplaceTransaction(state, [{ from: 1, to: 6, newText: 'bye' }], 'findReplace')
    expect(tr.getMeta('findReplace')).toBe(true)
  })
})
