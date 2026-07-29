import { describe, it, expect } from 'vitest'
import { getSchema } from '@tiptap/core'
import type { Node as PMNode } from '@tiptap/pm/model'
import { bookExtensions } from '@renderer/editor/extensions/bookExtensions'
import { computeMatches } from './computeMatches'

const schema = getSchema(bookExtensions)
const P = (content: unknown[]): unknown => schema.node('paragraph', null, content as never)
const DEF = { caseSensitive: false, wholeWord: false }

function docOf(...paragraphs: unknown[]): PMNode {
  return schema.node('doc', null, paragraphs as never)
}

describe('computeMatches', () => {
  it('finds a plain substring and returns absolute positions', () => {
    const doc = docOf(P([schema.text('a слово b')]))
    const m = computeMatches(doc, 'слово', DEF)
    expect(m).toHaveLength(1)
    expect(doc.textBetween(m[0].from, m[0].to)).toBe('слово')
  })

  it('matches across a mark split (сло<em>во</em>)', () => {
    const em = schema.marks.italic
    const doc = docOf(P([schema.text('сло'), schema.text('во', [em.create()])]))
    const m = computeMatches(doc, 'слово', DEF)
    expect(m).toHaveLength(1)
    expect(doc.textBetween(m[0].from, m[0].to)).toBe('слово')
  })

  it('is case-insensitive for Cyrillic by default', () => {
    const doc = docOf(P([schema.text('Ёлка и ёлка')]))
    expect(computeMatches(doc, 'ёлка', DEF)).toHaveLength(2)
  })

  it('honours caseSensitive', () => {
    const doc = docOf(P([schema.text('Ёлка и ёлка')]))
    expect(computeMatches(doc, 'ёлка', { caseSensitive: true, wholeWord: false })).toHaveLength(1)
  })

  it('whole-word rejects substrings but accepts standalone words', () => {
    const doc = docOf(P([schema.text('кот котик кот')]))
    const ww = { caseSensitive: false, wholeWord: true }
    expect(computeMatches(doc, 'кот', ww)).toHaveLength(2)
  })

  it('never spans a paragraph break', () => {
    const doc = docOf(P([schema.text('сло')]), P([schema.text('во')]))
    expect(computeMatches(doc, 'слово', DEF)).toHaveLength(0)
  })

  it('never spans a footnote inline node', () => {
    const fn = schema.nodes.footnote.create({ text: 'note' })
    const doc = docOf(P([schema.text('сло'), fn, schema.text('во')]))
    expect(computeMatches(doc, 'слово', DEF)).toHaveLength(0)
  })

  it('does not overlap: "аа" in "ааа" is one match', () => {
    const doc = docOf(P([schema.text('ааа')]))
    expect(computeMatches(doc, 'аа', DEF)).toHaveLength(1)
  })

  it('returns [] for an empty or whitespace query', () => {
    const doc = docOf(P([schema.text('текст')]))
    expect(computeMatches(doc, '', DEF)).toEqual([])
    expect(computeMatches(doc, '   ', DEF)).toEqual([])
  })
})
