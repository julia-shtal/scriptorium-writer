import type { ProseMirrorJSON } from './types'

/**
 * Footnote → Markdown mapping (SPEC §8). Pure helpers, shared so the M7 main-process
 * serializer and the M3 renderer tests agree exactly. M3 does NOT write `.md`; these
 * exist so M7 can emit `[^n]` markers inline and `[^n]:` definitions in a block.
 */

/** Every footnote node's `text`, in document order. Index 0 → marker/definition n=1. */
export function collectFootnoteTexts(doc: ProseMirrorJSON): string[] {
  const texts: string[] = []
  const walk = (node: unknown): void => {
    if (!node || typeof node !== 'object') return
    const record = node as Record<string, unknown>
    if (record.type === 'footnote') {
      const attrs = (record.attrs as Record<string, unknown> | undefined) ?? {}
      texts.push(typeof attrs.text === 'string' ? attrs.text : '')
      return
    }
    if (Array.isArray(record.content)) {
      for (const child of record.content) walk(child)
    }
  }
  walk(doc)
  return texts
}

/** Inline reference marker for footnote number `n` (1-based): `[^n]`. */
export function footnoteMarker(n: number): string {
  return `[^${n}]`
}

/** Definition line for footnote number `n` (1-based): `[^n]: text`. */
export function footnoteDefinition(n: number, text: string): string {
  return `[^${n}]: ${text}`
}
