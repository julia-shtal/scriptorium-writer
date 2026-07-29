// src/renderer/editor/find/findHighlightPlugin.ts
//
// TipTap extension holding the Find & Replace match highlight as a ProseMirror
// DecorationSet, swapped via transaction meta (mirrors wandPreviewPlugin.ts). No text is
// mutated by highlighting. Unlike the wand preview the editor stays editable, so on a
// meta-less transaction we map the current set through tr.mapping.

import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import type { Node as PMNode } from '@tiptap/pm/model'
import type { FindMatch } from './computeMatches'

/** Meta payload: matches + which one is active, or null to clear. */
export type FindHighlightMeta = { matches: FindMatch[]; activeIndex: number } | null

export const findHighlightKey = new PluginKey<DecorationSet>('findHighlight')

/**
 * Cap on how many matches we render as decorations. A degenerate query (a single space
 * in a long chapter) could otherwise produce tens of thousands of widgets and stall the
 * view. This is a RENDERING guard only — it never changes the match count reported to
 * the user. The active match is always decorated even if it falls past the cap, so
 * navigation still shows where you are.
 */
const MAX_DECORATED = 2000

function buildDecorations(doc: PMNode, matches: FindMatch[], activeIndex: number): DecorationSet {
  const decos: Decoration[] = []
  const limit = Math.min(matches.length, MAX_DECORATED)
  for (let i = 0; i < limit; i++) {
    const m = matches[i]
    const cls = i === activeIndex ? 'find-match find-match-active' : 'find-match'
    decos.push(Decoration.inline(m.from, m.to, { class: cls }))
  }
  // Active match beyond the cap: decorate it too so navigation stays visible.
  if (activeIndex >= limit && activeIndex < matches.length) {
    const m = matches[activeIndex]
    decos.push(Decoration.inline(m.from, m.to, { class: 'find-match find-match-active' }))
  }
  return DecorationSet.create(doc, decos)
}

export const FindHighlight = Extension.create({
  name: 'findHighlight',

  addProseMirrorPlugins() {
    return [
      new Plugin<DecorationSet>({
        key: findHighlightKey,
        state: {
          init: () => DecorationSet.empty,
          apply(tr, current) {
            const meta = tr.getMeta(findHighlightKey) as FindHighlightMeta | undefined
            if (meta === null) return DecorationSet.empty
            if (meta) return buildDecorations(tr.doc, meta.matches, meta.activeIndex)
            // No meta: editor stays editable while find is open, so the doc can change.
            // Map the existing decorations through the transaction to keep them aligned.
            return current.map(tr.mapping, tr.doc)
          }
        },
        props: {
          decorations(state) {
            return this.getState(state)
          }
        }
      })
    ]
  }
})
