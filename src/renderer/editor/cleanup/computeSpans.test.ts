import { describe, expect, test } from 'vitest'
import { getSchema } from '@tiptap/core'
import type { Schema, Node as ProseMirrorNode } from '@tiptap/pm/model'
import { bookExtensions } from '../extensions/bookExtensions'
import { computeSpans, type CleanupSpan } from './computeSpans'

const schema: Schema = getSchema(bookExtensions)

/** Build a single-paragraph doc from an array of inline nodes/strings. */
function paragraph(...inline: (string | ProseMirrorNode)[]): ProseMirrorNode {
  const content = inline.map((n) => (typeof n === 'string' ? schema.text(n) : n))
  const p = schema.nodes.paragraph.create(null, content.length ? content : undefined)
  return schema.nodes.doc.create(null, p)
}

function spansOfWholeDoc(doc: ProseMirrorNode): CleanupSpan[] {
  return computeSpans(doc, { from: 0, to: doc.content.size })
}

/** Apply spans (rightmost-first) to a plain string to verify they reconstruct text. */
function applyToString(text: string, base: number, spans: CleanupSpan[]): string {
  let out = text
  for (const s of [...spans].sort((a, b) => b.from - a.from)) {
    out = out.slice(0, s.from - base) + s.newText + out.slice(s.to - base)
  }
  return out
}

describe('computeSpans — edge cases', () => {
  test('1. multi-hunk single node → two separate tight spans', () => {
    // Double-space near the start, hyphen→dash near the end, unchanged middle.
    const doc = paragraph('a  b unchanged middle c - d')
    const spans = spansOfWholeDoc(doc)
    expect(spans.length).toBe(2)
    // No span covers the unchanged middle.
    expect(spans.every((s) => s.oldText.length <= 3)).toBe(true)
    // Reconstructs correctly (text node starts at pos 1 in a single-paragraph doc).
    expect(applyToString('a  b unchanged middle c - d', 1, spans)).toBe(
      'a b unchanged middle c — d'
    )
  })

  test('2. full-node replacement collapsing toward empty', () => {
    // A node that is only whitespace → trailing-trim collapses it to empty.
    const doc = paragraph('word', schema.text('   '))
    // First text node "word" (pos 1-5) is clean; the "   " node (pos 5-8) → "".
    const spans = spansOfWholeDoc(doc)
    expect(spans.length).toBe(1)
    const s = spans[0]
    expect(s.oldText).toBe('   ')
    expect(s.newText).toBe('')
    expect(s.from).toBe(5)
    expect(s.to).toBe(8)
  })

  test('3. no-op node → zero spans (no zero-length span)', () => {
    const doc = paragraph('Уже чистый текст — без ошибок.')
    expect(spansOfWholeDoc(doc)).toEqual([])
  })

  test('4. hard_break is a line boundary for trailing-trim', () => {
    // "line1   " <hard_break> "line2" — trailing spaces on the first text node only.
    const br = schema.nodes.hardBreak.create()
    const doc = paragraph('line1   ', br, 'line2')
    const spans = spansOfWholeDoc(doc)
    expect(spans.length).toBe(1)
    expect(spans[0].oldText).toBe('   ')
    expect(spans[0].newText).toBe('')
    // The span sits on the first text node (pos 1..9), not across the hard_break.
    expect(spans[0].from).toBe(6)
    expect(spans[0].to).toBe(9)
  })

  test('5. partial selection mid-node rounds up to the full node', () => {
    const doc = paragraph('текст - текст')
    // Select just "кст - те" in the middle (positions inside the single node).
    const spans = computeSpans(doc, { from: 4, to: 11 })
    // The dash edit is emitted even though it is only partially inside the selection.
    expect(spans.length).toBe(1)
    expect(spans[0].oldText).toBe('-')
    expect(spans[0].newText).toBe('—')
  })
})

describe('computeSpans — structure preservation', () => {
  test('marks preserved: a bold run is diffed independently, no merge across marks', () => {
    const bold = schema.marks.bold.create()
    const doc = paragraph(schema.text('a  b', [bold]), schema.text(' c  d'))
    const spans = spansOfWholeDoc(doc)
    // One span per node (each has a double space collapse).
    expect(spans.length).toBe(2)
    // Spans never cross the node boundary.
    expect(spans.every((s) => s.oldText.includes(' '))).toBe(true)
  })

  test('footnote atom interrupts a run: nodes on each side diffed separately', () => {
    const fn = schema.nodes.footnote.create({ text: 'note' })
    const doc = paragraph('a  b', fn, 'c  d')
    const spans = spansOfWholeDoc(doc)
    // One collapse span per text node, never merged across the footnote atom.
    expect(spans.length).toBe(2)
    // "a  b" (pos 1-5) collapses at index 2 → pos 3; deletes the extra space.
    expect(spans[0].from).toBe(3)
    expect(spans[0].to).toBe(4)
    expect(spans[0].newText).toBe('')
    // Second span lives past the atom, on the "c  d" node.
    expect(spans[1].from).toBe(8)
    expect(spans[1].newText).toBe('')
  })

  test('adjacent same-mark strings merge into one node, still one span', () => {
    // PM merges consecutive text of identical marks; the collapse is a single span.
    const doc = paragraph('clean text.', schema.text(' dirty  text'))
    const spans = spansOfWholeDoc(doc)
    expect(spans.length).toBe(1)
    // Tight diff deletes the one redundant space rather than replacing the pair.
    expect(spans[0].oldText).toBe(' ')
    expect(spans[0].newText).toBe('')
    // Reconstructs to a single space between the words.
    expect(applyToString('clean text. dirty  text', 1, spans)).toBe('clean text. dirty text')
  })
})
