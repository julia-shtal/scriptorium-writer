import { describe, it, expect } from 'vitest'
import { serializeChapterToMarkdown } from './markdown'
import type { ProseMirrorJSON } from '@shared/types'

const doc = (content: unknown[]): ProseMirrorJSON => ({ type: 'doc', content })
const para = (content: unknown[]): unknown => ({ type: 'paragraph', content })
const text = (t: string, marks?: string[]): unknown => ({
  type: 'text',
  text: t,
  ...(marks ? { marks: marks.map((type) => ({ type })) } : {})
})

describe('serializeChapterToMarkdown', () => {
  it('renders the title as an H1 above the body', () => {
    const md = serializeChapterToMarkdown('Глава первая', doc([para([text('Привет')])]))
    expect(md.startsWith('# Глава первая\n\n')).toBe(true)
    expect(md).toContain('Привет')
  })

  it('omits the H1 when the title is blank', () => {
    const md = serializeChapterToMarkdown('   ', doc([para([text('body')])]))
    expect(md.startsWith('#')).toBe(false)
    expect(md.trimEnd()).toBe('body')
  })

  it('maps bold, italic, and strike to standard Markdown', () => {
    const md = serializeChapterToMarkdown(
      '',
      doc([
        para([
          text('a', ['bold']),
          text('b', ['italic']),
          text('c', ['strike']),
          text('d', ['bold', 'italic'])
        ])
      ])
    )
    expect(md).toContain('**a**')
    expect(md).toContain('*b*')
    expect(md).toContain('~~c~~')
    expect(md).toContain('***d***')
  })

  it('serializes a scene divider as a thematic break', () => {
    const md = serializeChapterToMarkdown(
      '',
      doc([para([text('before')]), { type: 'sceneDivider' }, para([text('after')])])
    )
    expect(md).toBe('before\n\n---\n\nafter\n')
  })

  it('drops paragraph alignment (not representable in Markdown)', () => {
    const md = serializeChapterToMarkdown(
      '',
      doc([{ type: 'paragraph', attrs: { textAlign: 'center' }, content: [text('body')] }])
    )
    expect(md.trimEnd()).toBe('body')
    expect(md).not.toContain('center')
  })

  it('emits [^n] markers inline and a matching definitions block in document order', () => {
    const md = serializeChapterToMarkdown(
      '',
      doc([
        para([
          text('one'),
          { type: 'footnote', attrs: { text: 'first note' } },
          text(' two'),
          { type: 'footnote', attrs: { text: 'second note' } }
        ])
      ])
    )
    expect(md).toContain('one[^1] two[^2]')
    expect(md).toContain('[^1]: first note')
    expect(md).toContain('[^2]: second note')
    // Definitions come after the body.
    expect(md.indexOf('[^1]: first note')).toBeGreaterThan(md.indexOf('one[^1]'))
  })

  it('keeps a mark open across adjacent nodes that share it (no redundant delimiters)', () => {
    // TipTap frequently splits one continuously-bold phrase into several text nodes.
    // Naive per-node serialization would emit `**foo ****bar**` — a `****` run that
    // renders as literal asterisks. The mark must stay open across the split.
    const md = serializeChapterToMarkdown(
      '',
      doc([para([text('foo ', ['bold']), text('bar', ['bold'])])])
    )
    expect(md.trimEnd()).toBe('**foo bar**')
    expect(md).not.toMatch(/\*{3,}\s*\*/) // no stray delimiter runs
  })

  it('serializes overlapping bold/italic runs without unparseable delimiter runs', () => {
    // The real-world corruption case: bold spans nodes 1–2, italic spans nodes 2–3.
    // Per-node serialization produced `чувством***** с****тало` (literal asterisks).
    const md = serializeChapterToMarkdown(
      '',
      doc([
        para([
          text('A', ['bold']),
          text(' B', ['bold', 'italic']),
          text('C', ['italic'])
        ])
      ])
    )
    // No run of four or more asterisks anywhere — those never parse as emphasis.
    expect(md).not.toMatch(/\*{4,}/)
    // The unavoidable break lands on the whitespace; each span stays valid.
    expect(md.trimEnd()).toBe('**A** ***B**C*')
  })

  it('shifts emphasis delimiters out of surrounding whitespace', () => {
    // An emphasis opener may not be followed by whitespace, nor a closer preceded by it,
    // or CommonMark refuses to parse it. Leading/trailing spaces go outside the marks.
    const md = serializeChapterToMarkdown('', doc([para([text(' hi ', ['italic'])])]))
    expect(md).toBe(' *hi* \n')
    expect(md).not.toContain('* hi') // opener must not be followed by a space
  })

  it('maps a hard break to a Markdown hard line break', () => {
    const md = serializeChapterToMarkdown(
      '',
      doc([para([text('line one'), { type: 'hardBreak' }, text('line two')])])
    )
    expect(md).toContain('line one  \nline two')
  })

  it('always ends with a single trailing newline', () => {
    const md = serializeChapterToMarkdown('', doc([para([text('x')])]))
    expect(md.endsWith('\n')).toBe(true)
    expect(md.endsWith('\n\n')).toBe(false)
  })
})
