/* eslint-disable @typescript-eslint/no-explicit-any -- `ProseMirrorJSON` is
 * `Record<string, unknown>`, so navigating `.content[n]` in assertions needs `any`;
 * only structural access is cast, the expected values stay exact. */
import { describe, it, expect } from 'vitest'
import { markdownToDoc, splitMarkdownByHeading } from './markdownToDoc'

describe('markdownToDoc', () => {
  it('parses a plain paragraph', () => {
    expect(markdownToDoc('Hello world')).toEqual({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello world' }] }]
    })
  })

  it('splits blocks on blank lines', () => {
    const doc = markdownToDoc('One\n\nTwo') as any
    expect(doc.content).toHaveLength(2)
    expect(doc.content[1]).toEqual({
      type: 'paragraph',
      content: [{ type: 'text', text: 'Two' }]
    })
  })

  it('parses bold, italic, strike', () => {
    const p = (markdownToDoc('a **b** *c* ~~d~~') as any).content[0]
    expect(p.content).toEqual([
      { type: 'text', text: 'a ' },
      { type: 'text', text: 'b', marks: [{ type: 'bold' }] },
      { type: 'text', text: ' ' },
      { type: 'text', text: 'c', marks: [{ type: 'italic' }] },
      { type: 'text', text: ' ' },
      { type: 'text', text: 'd', marks: [{ type: 'strike' }] }
    ])
  })

  it('maps --- to a scene divider', () => {
    const doc = markdownToDoc('Before\n\n---\n\nAfter') as any
    expect(doc.content.map((n: any) => n.type)).toEqual(['paragraph', 'sceneDivider', 'paragraph'])
  })

  it('maps a two-space line end to a hardBreak', () => {
    const p = (markdownToDoc('line one  \nline two') as any).content[0]
    expect(p.content).toEqual([
      { type: 'text', text: 'line one' },
      { type: 'hardBreak' },
      { type: 'text', text: 'line two' }
    ])
  })

  it('resolves [^n] markers to footnote nodes using the trailing definitions', () => {
    const p = (markdownToDoc('See this[^1] fact.\n\n[^1]: the note text') as any).content[0]
    expect(p.content).toEqual([
      { type: 'text', text: 'See this' },
      { type: 'footnote', attrs: { text: 'the note text' } },
      { type: 'text', text: ' fact.' }
    ])
  })

  it('an unresolved [^n] marker still becomes an empty footnote (never dropped)', () => {
    const p = (markdownToDoc('x[^9]') as any).content[0]
    expect(p.content).toEqual([
      { type: 'text', text: 'x' },
      { type: 'footnote', attrs: { text: '' } }
    ])
  })

  it('returns an empty paragraph for empty input', () => {
    expect(markdownToDoc('')).toEqual({ type: 'doc', content: [{ type: 'paragraph' }] })
  })

  it('flattens a heading line to a paragraph in single-doc parse', () => {
    const doc = markdownToDoc('# Title\n\nBody') as any
    expect(doc.content[0]).toEqual({ type: 'paragraph', content: [{ type: 'text', text: 'Title' }] })
  })
})

describe('splitMarkdownByHeading', () => {
  it('splits at # headings, heading text becomes the title', () => {
    const parts = splitMarkdownByHeading('# One\n\nbody1\n\n# Two\n\nbody2')
    expect(parts).toEqual([
      { title: 'One', text: 'body1' },
      { title: 'Two', text: 'body2' }
    ])
  })

  it('content before the first heading becomes an empty-title leading section', () => {
    const parts = splitMarkdownByHeading('intro\n\n# One\n\nbody1')
    expect(parts).toEqual([
      { title: '', text: 'intro' },
      { title: 'One', text: 'body1' }
    ])
  })

  it('drops an empty leading section', () => {
    const parts = splitMarkdownByHeading('# One\n\nbody1')
    expect(parts).toEqual([{ title: 'One', text: 'body1' }])
  })
})
