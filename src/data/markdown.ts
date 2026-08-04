/**
 * Markdown backup serializer (SPEC §8, M7). Turns a chapter's ProseMirror JSON canon
 * into the human-readable `.md` backup written alongside the `.json`. Pure and free of
 * Node/Electron imports so it unit-tests directly.
 *
 * The `.md` is a LOSSY backup: paragraph alignment is not representable in Markdown and
 * is dropped by design — the `.json` canon stays the lossless source of truth, and v1
 * never re-imports from `.md`. Text is emitted verbatim (no Markdown escaping) since the
 * `.md` is for human reading, not machine round-trip.
 */
import type { ProseMirrorJSON } from '@shared/types'
import {
  collectFootnoteTexts,
  footnoteDefinition,
  footnoteMarker
} from '@shared/footnote-markdown'

type PMMark = { type?: string }
type PMNode = {
  type?: string
  text?: string
  content?: PMNode[]
  attrs?: Record<string, unknown>
  marks?: PMMark[]
}

/** Emphasis marks the `.md` can represent, with their delimiters. */
const MARK_DELIM: Record<string, string> = { bold: '**', italic: '*', strike: '~~' }
/** Deterministic tie-break when two marks have equal remaining lifetime (see below). */
const MARK_PRIORITY: Record<string, number> = { bold: 0, italic: 1, strike: 2 }

/**
 * An inline node reduced to what the serializer needs. `footnote`/`break` carry no marks
 * and act as barriers: emphasis never spans them, so they force any open marks closed.
 */
type InlineToken =
  | { kind: 'text'; text: string; marks: string[] }
  | { kind: 'footnote' }
  | { kind: 'break' }

/** Flatten inline children into tokens, keeping only marks the `.md` can represent. */
function tokenize(nodes: PMNode[] | undefined): InlineToken[] {
  const tokens: InlineToken[] = []
  for (const node of nodes ?? []) {
    if (node.type === 'text') {
      const marks = (node.marks ?? [])
        .map((m) => m.type)
        .filter((t): t is string => !!t && t in MARK_DELIM)
      tokens.push({ kind: 'text', text: node.text ?? '', marks })
    } else if (node.type === 'footnote') {
      tokens.push({ kind: 'footnote' })
    } else if (node.type === 'hardBreak') {
      tokens.push({ kind: 'break' })
    }
  }
  return tokens
}

const hasSameMarks = (a: string[], b: string[]): boolean =>
  a.length === b.length && a.every((m) => b.includes(m))

/** Merge neighbouring text tokens with identical mark sets so a mark isn't re-delimited. */
function mergeRuns(tokens: InlineToken[]): InlineToken[] {
  const out: InlineToken[] = []
  for (const tok of tokens) {
    const prev = out[out.length - 1]
    if (
      tok.kind === 'text' &&
      prev &&
      prev.kind === 'text' &&
      hasSameMarks(prev.marks, tok.marks)
    ) {
      prev.text += tok.text
    } else {
      out.push(tok.kind === 'text' ? { ...tok, marks: [...tok.marks] } : tok)
    }
  }
  return out
}

/** How many consecutive text tokens from `i` still carry `mark` (barriers stop the run). */
function markLifetime(tokens: InlineToken[], i: number, mark: string): number {
  let n = 0
  for (let j = i; j < tokens.length; j++) {
    const t = tokens[j]
    if (t.kind !== 'text' || !t.marks.includes(mark)) break
    n += 1
  }
  return n
}

/**
 * Order a run's marks outermost-first. Markdown emphasis must nest strictly, but a doc's
 * marks can overlap partially (bold ends mid-italic). Placing the longer-surviving mark
 * outside lets the unavoidable close/reopen "break" land on the shorter mark's edge —
 * ideally a word/space boundary — instead of shredding a word with `****`.
 */
function orderRunMarks(tokens: InlineToken[], i: number, marks: string[]): string[] {
  return [...marks].sort((a, b) => {
    const life = markLifetime(tokens, i, b) - markLifetime(tokens, i, a)
    return life !== 0 ? life : MARK_PRIORITY[a] - MARK_PRIORITY[b]
  })
}

const commonPrefixLen = (a: string[], b: string[]): number => {
  let n = 0
  while (n < a.length && n < b.length && a[n] === b[n]) n += 1
  return n
}

const LEADING_WS = /^\s+/
const TRAILING_WS = /\s+$/

/**
 * Serialize inline content to Markdown. `counter.n` carries the running footnote number
 * so `[^n]` markers match `collectFootnoteTexts` order (document order, 1-based).
 *
 * Marks are opened and closed at true run boundaries (not per node), and their
 * delimiters are shifted out of any surrounding whitespace — an opener may not be
 * followed by a space, nor a closer preceded by one, or CommonMark won't parse it. So a
 * run's trailing whitespace is deferred (`pending`) until after its marks close.
 */
function serializeInline(nodes: PMNode[] | undefined, counter: { n: number }): string {
  const tokens = mergeRuns(tokenize(nodes))
  let out = ''
  let open: string[] = []
  let pending = '' // trailing whitespace held back so closing delimiters hug the text

  const close = (marks: string[]): void => {
    for (const m of marks) out += MARK_DELIM[m]
  }

  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i]

    if (tok.kind !== 'text') {
      close([...open].reverse()) // hug the preceding text, before any deferred space
      open = []
      out += pending
      pending = ''
      out += tok.kind === 'footnote' ? footnoteMarker((counter.n += 1)) : '  \n'
      continue
    }

    const lead = LEADING_WS.exec(tok.text)?.[0] ?? ''
    const rest = tok.text.slice(lead.length)
    const trail = TRAILING_WS.exec(rest)?.[0] ?? ''
    const core = rest.slice(0, rest.length - trail.length)

    // Whitespace-only run: never wrap it in emphasis; just defer it to the next run.
    if (core === '') {
      pending += tok.text
      continue
    }

    const target = orderRunMarks(tokens, i, tok.marks)
    const shared = commonPrefixLen(open, target)
    close(open.slice(shared).reverse()) // close what this run no longer needs, hugging text
    open = open.slice(0, shared)

    out += pending + lead // whitespace lives between the marked spans, outside delimiters
    pending = ''

    for (const m of target.slice(shared)) {
      out += MARK_DELIM[m]
      open.push(m)
    }
    out += core
    pending = trail
  }

  close([...open].reverse())
  out += pending
  return out
}

/** Serialize one top-level block node to its Markdown line(s). */
function serializeBlock(node: PMNode, counter: { n: number }): string {
  switch (node.type) {
    case 'sceneDivider':
      return '---'
    case 'paragraph':
    default:
      // Alignment (node.attrs.textAlign) is intentionally dropped — see file header.
      // Unknown/disabled blocks fall through to a best-effort inline serialize so text
      // is never silently lost.
      return serializeInline(node.content, counter)
  }
}

/**
 * Serialize a chapter to its Markdown backup: an H1 title (when non-empty), the body
 * blocks separated by blank lines, then a trailing footnote-definitions block when the
 * doc has any footnotes. Always ends with a single trailing newline.
 */
export function serializeChapterToMarkdown(title: string, doc: ProseMirrorJSON): string {
  const root = doc as PMNode
  const counter = { n: 0 }
  const blocks: string[] = []

  const heading = title.trim()
  if (heading) blocks.push(`# ${heading}`)

  for (const child of root.content ?? []) {
    blocks.push(serializeBlock(child, counter))
  }

  const footnotes = collectFootnoteTexts(doc)
  if (footnotes.length > 0) {
    blocks.push(footnotes.map((t, i) => footnoteDefinition(i + 1, t)).join('\n'))
  }

  return blocks.join('\n\n') + '\n'
}
