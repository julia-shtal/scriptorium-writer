// src/renderer/editor/cleanup/wandPreviewPlugin.ts
//
// TipTap extension holding the wand's inline diff preview as a ProseMirror
// DecorationSet. No text is changed while previewing — decorations only. The set is
// toggled by a transaction meta so entering/leaving preview is a normal PM update.

import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import type { CleanupSpan } from './computeSpans'

/** Meta payload: an array of spans to preview, or null to clear the preview. */
export type WandPreviewMeta = { spans: CleanupSpan[] } | null

export const wandPreviewKey = new PluginKey<DecorationSet>('wandPreview')

/** Build the strike-old + widget-new decorations for a set of spans. */
function buildDecorations(doc: import('@tiptap/pm/model').Node, spans: CleanupSpan[]): DecorationSet {
  const decos: Decoration[] = []
  for (const span of spans) {
    // Old text struck through (skip zero-length old ranges, e.g. pure insertions).
    if (span.to > span.from) {
      decos.push(Decoration.inline(span.from, span.to, { class: 'wand-old' }))
    }
    // New text shown inline, immediately after the old text.
    if (span.newText.length > 0) {
      decos.push(
        Decoration.widget(span.to, () => newTextWidget(span.newText), {
          side: 1,
          // Group widgets so PM keeps them stable across the (read-only) preview.
          key: `wand-new-${span.from}-${span.to}`
        })
      )
    }
  }
  return DecorationSet.create(doc, decos)
}

function newTextWidget(text: string): HTMLElement {
  const el = document.createElement('span')
  el.className = 'wand-new'
  el.textContent = text
  return el
}

/**
 * The extension. Plugin state is the active DecorationSet (empty when not previewing).
 * A transaction carrying `setMeta(wandPreviewKey, { spans } | null)` swaps it.
 */
export const WandPreview = Extension.create({
  name: 'wandPreview',

  addProseMirrorPlugins() {
    return [
      new Plugin<DecorationSet>({
        key: wandPreviewKey,
        state: {
          init: () => DecorationSet.empty,
          apply(tr, current) {
            const meta = tr.getMeta(wandPreviewKey) as WandPreviewMeta | undefined
            if (meta === null) return DecorationSet.empty
            if (meta) return buildDecorations(tr.doc, meta.spans)
            // No meta: map existing decorations through the transaction (no-op while
            // the editor is read-only, but correct if the doc ever changes).
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
