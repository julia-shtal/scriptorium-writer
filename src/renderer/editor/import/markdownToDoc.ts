/**
 * Markdown → ProseMirror JSON: the inverse of the M7 serializer in
 * `src/main/markdown.ts`, for M14 import. Pure (no DOM/Node), so it unit-tests directly
 * and can run in the renderer. The `[^n]` footnote convention is shared with the
 * serializer via `@shared/footnote-markdown` (do not re-derive it here).
 *
 * This is a deliberately small, lossy Markdown reader: it understands only what the app
 * itself emits — bold/italic/strike, `---` scene dividers, `[^n]` footnotes, blank-line
 * paragraphs and two-space hardBreaks. Anything else is kept as literal text so import
 * never silently drops the writer's words.
 */
import type { ProseMirrorJSON } from '@shared/types'

type PMNode = { type: string; text?: string; content?: PMNode[]; marks?: { type: string }[]; attrs?: Record<string, unknown> }

const HEADING = /^#{1,6}\s+(.*)$/
const FOOTNOTE_DEF = /^\[\^(\d+)\]:\s?(.*)$/
const SCENE = /^-{3,}$/

/** Pull `[^n]: text` definition lines out of the source, returning the map + cleaned text. */
function extractFootnoteDefs(md: string): { defs: Map<string, string>; body: string } {
  const defs = new Map<string, string>()
  const kept: string[] = []
  for (const line of md.split('\n')) {
    const m = FOOTNOTE_DEF.exec(line)
    if (m) defs.set(m[1], m[2])
    else kept.push(line)
  }
  return { defs, body: kept.join('\n') }
}

/** Parse a single block's inline markdown into PM inline nodes. `defs` resolves footnotes. */
function parseInline(text: string, defs: Map<string, string>): PMNode[] {
  const out: PMNode[] = []
  const pushText = (t: string, marks: string[]): void => {
    if (!t) return
    const node: PMNode = { type: 'text', text: t }
    if (marks.length) node.marks = marks.map((type) => ({ type }))
    out.push(node)
  }

  // Delimiters checked longest-first so `**` wins over `*`, `~~` is atomic.
  const DELIMS: { open: string; mark: string }[] = [
    { open: '**', mark: 'bold' },
    { open: '~~', mark: 'strike' },
    { open: '*', mark: 'italic' }
  ]

  let i = 0
  const marks: string[] = []
  let buf = ''
  const flush = (): void => {
    pushText(buf, [...marks])
    buf = ''
  }

  while (i < text.length) {
    // hardBreak: two spaces before a newline.
    if (text.startsWith('  \n', i)) {
      flush()
      out.push({ type: 'hardBreak' })
      i += 3
      continue
    }
    if (text[i] === '\n') {
      buf += ' '
      i += 1
      continue
    }
    // footnote marker [^n]
    const fn = /^\[\^(\d+)\]/.exec(text.slice(i))
    if (fn) {
      flush()
      out.push({ type: 'footnote', attrs: { text: defs.get(fn[1]) ?? '' } })
      i += fn[0].length
      continue
    }
    // emphasis delimiters (toggle)
    const d = DELIMS.find((x) => text.startsWith(x.open, i))
    if (d) {
      flush()
      const at = marks.indexOf(d.mark)
      if (at >= 0) marks.splice(at, 1)
      else marks.push(d.mark)
      i += d.open.length
      continue
    }
    buf += text[i]
    i += 1
  }
  flush()
  return out
}

/** Parse the already-footnote-stripped body into block nodes. */
function parseBlocks(body: string, defs: Map<string, string>): PMNode[] {
  const blocks: PMNode[] = []
  for (const raw of body.split(/\n{2,}/)) {
    const chunk = raw.replace(/\s+$/, '')
    if (chunk.trim() === '') continue
    if (SCENE.test(chunk.trim())) {
      blocks.push({ type: 'sceneDivider' })
      continue
    }
    const heading = HEADING.exec(chunk)
    const text = heading ? heading[1] : chunk
    blocks.push({ type: 'paragraph', content: parseInline(text, defs) })
  }
  return blocks
}

/** Parse a whole Markdown document (one chapter's worth) to a ProseMirror doc. */
export function markdownToDoc(md: string): ProseMirrorJSON {
  const { defs, body } = extractFootnoteDefs(md)
  const blocks = parseBlocks(body, defs)
  return { type: 'doc', content: blocks.length ? blocks : [{ type: 'paragraph' }] }
}

/** Split a story-level Markdown file at `#`-level headings into titled sections. */
export function splitMarkdownByHeading(md: string): { title: string; text: string }[] {
  const lines = md.split('\n')
  const sections: { title: string; lines: string[] }[] = [{ title: '', lines: [] }]
  for (const line of lines) {
    const m = /^#\s+(.*)$/.exec(line)
    if (m) sections.push({ title: m[1].trim(), lines: [] })
    else sections[sections.length - 1].lines.push(line)
  }
  return sections
    .map((s) => ({ title: s.title, text: s.lines.join('\n').trim() }))
    .filter((s, idx) => idx > 0 || s.title !== '' || s.text !== '')
}
