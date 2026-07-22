/**
 * HTML → ProseMirror JSON for M14 docx import. mammoth (in main) produces clean, flat
 * HTML (`<h1>`, `<p>`, `<strong>`, `<em>`, `<s>`); the renderer turns it into the canon
 * doc via TipTap's `generateJSON` against `bookExtensions`.
 *
 * The editor schema has NO heading node (`heading: false`), so `flattenHeadings` rewrites
 * any leftover heading tags to paragraphs before parsing — otherwise their text would be
 * dropped. `splitHtmlByHeading` uses top-level `<h1>` as chapter boundaries.
 *
 * The split/flatten helpers are pure string transforms (node-testable). `htmlToDoc`
 * itself calls `generateJSON`, which needs a DOM and therefore only runs in the renderer.
 */
import { generateJSON } from '@tiptap/core'
import type { ProseMirrorJSON } from '@shared/types'
import { bookExtensions } from '../extensions/bookExtensions'

const HEADING_OPEN = /<h[1-6](\s[^>]*)?>/gi
const HEADING_CLOSE = /<\/h[1-6]>/gi

/** Rewrite `<hN>…</hN>` to `<p>…</p>` so heading text survives the heading-less schema. */
export function flattenHeadings(html: string): string {
  return html.replace(HEADING_OPEN, '<p>').replace(HEADING_CLOSE, '</p>')
}

const stripTags = (s: string): string => s.replace(/<[^>]+>/g, '').trim()

/** Split flat HTML at top-level `<h1>` into titled sections (title = heading text). */
export function splitHtmlByHeading(html: string): { title: string; html: string }[] {
  const parts: { title: string; html: string }[] = []
  const re = /<h1(?:\s[^>]*)?>([\s\S]*?)<\/h1>/gi
  let lastIndex = 0
  let leading = ''
  let current: { title: string; html: string } | null = null
  let m: RegExpExecArray | null

  const pushBody = (upto: number): void => {
    const body = html.slice(lastIndex, upto)
    if (current) current.html += body
    else leading += body
  }

  while ((m = re.exec(html)) !== null) {
    pushBody(m.index)
    if (current) parts.push(current)
    else if (leading.trim() !== '') parts.unshift({ title: '', html: leading })
    current = { title: stripTags(m[1]), html: '' }
    lastIndex = re.lastIndex
  }
  pushBody(html.length)
  if (current) parts.push(current)
  else if (leading.trim() !== '') parts.push({ title: '', html: leading })

  return parts
}

/** Parse one section's HTML into the canon doc (renderer only — needs a DOM). */
export function htmlToDoc(html: string): ProseMirrorJSON {
  return generateJSON(flattenHeadings(html), bookExtensions) as ProseMirrorJSON
}
