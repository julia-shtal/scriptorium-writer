import { describe, expect, test } from 'vitest'
import { getSchema } from '@tiptap/core'
import type { Schema, Node as ProseMirrorNode } from '@tiptap/pm/model'
import { EditorState } from '@tiptap/pm/state'
import { bookExtensions } from '../extensions/bookExtensions'
import { computeSpans } from './computeSpans'
import { buildCleanupTransaction } from './applyCleanup'

const schema: Schema = getSchema(bookExtensions)

function docFrom(...inline: (string | ProseMirrorNode)[]): ProseMirrorNode {
  const content = inline.map((n) => (typeof n === 'string' ? schema.text(n) : n))
  const p = schema.nodes.paragraph.create(null, content)
  return schema.nodes.doc.create(null, p)
}

function firstParagraphText(doc: ProseMirrorNode): string {
  return doc.firstChild?.textContent ?? ''
}

describe('buildCleanupTransaction', () => {
  test('applies all fixes and is exactly one undo step', () => {
    const doc = docFrom('текст - текст, слово ,слово и что- нибудь')
    let state = EditorState.create({ schema, doc })
    const spans = computeSpans(doc, { from: 0, to: doc.content.size })
    expect(spans.length).toBeGreaterThan(1)

    const before = firstParagraphText(state.doc)
    const tr = buildCleanupTransaction(state, spans)
    state = state.apply(tr)

    expect(firstParagraphText(state.doc)).toBe('текст — текст, слово, слово и что-нибудь')

    // The transaction records exactly one history step: a single undo reverts it all.
    // (prosemirror-history is bundled in StarterKit's undo/redo.)
    const steps = tr.steps.length
    expect(steps).toBeGreaterThan(0)
    // All step edits carried by one dispatch → one addToHistory transaction.
    expect(tr.getMeta('wandCleanup')).toBe(true)

    // Reconstruct the original by inverting every step in reverse: proves the tr is a
    // complete, atomic delta (what Ctrl+Z would undo in one action).
    const undo = state.tr
    for (let i = tr.steps.length - 1; i >= 0; i--) {
      const inverted = tr.steps[i].invert(tr.docs[i])
      undo.step(inverted)
    }
    const reverted = state.apply(undo)
    expect(firstParagraphText(reverted.doc)).toBe(before)
  })

  test('preserves marks on replaced text', () => {
    const bold = schema.marks.bold.create()
    // A bold run containing a double space to collapse.
    const doc = docFrom(schema.text('жирный  текст', [bold]))
    let state = EditorState.create({ schema, doc })
    const spans = computeSpans(doc, { from: 0, to: doc.content.size })
    expect(spans.length).toBe(1)

    state = state.apply(buildCleanupTransaction(state, spans))

    // Every text node in the result still carries the bold mark.
    let allBold = true
    state.doc.descendants((node) => {
      if (node.isText) allBold = allBold && node.marks.some((m) => m.type.name === 'bold')
    })
    expect(allBold).toBe(true)
    expect(firstParagraphText(state.doc)).toBe('жирный текст')
  })

  test('empty newText span is a pure delete', () => {
    const doc = docFrom('слово   ') // trailing spaces trimmed to nothing
    let state = EditorState.create({ schema, doc })
    const spans = computeSpans(doc, { from: 0, to: doc.content.size })
    state = state.apply(buildCleanupTransaction(state, spans))
    expect(firstParagraphText(state.doc)).toBe('слово')
  })
})
