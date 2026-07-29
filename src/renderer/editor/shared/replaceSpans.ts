// src/renderer/editor/shared/replaceSpans.ts
//
// Build ONE transaction that replaces a set of text spans, applied rightmost-first so
// earlier positions stay valid as we edit. Each span becomes a text node carrying the
// marks present at its start position (bold/italic runs preserved), or a plain delete
// when `newText` is empty. Tagged with `metaKey` so history + snapshotting treat the
// whole thing as one atomic edit / one undo step. Shared by the wand (M8) and find (M15).
//
// INVARIANT: `spans` must be non-overlapping. Callers are responsible (the wand's
// computeSpans and find's computeMatches both emit disjoint spans by construction);
// overlapping spans would produce a mangled transaction, not an error.

import type { EditorState, Transaction } from '@tiptap/pm/state'

export interface ReplaceSpan {
  from: number
  to: number
  newText: string
}

export function buildSpanReplaceTransaction(
  state: EditorState,
  spans: ReplaceSpan[],
  metaKey: string
): Transaction {
  const tr = state.tr
  const ordered = [...spans].sort((a, b) => b.from - a.from)
  for (const span of ordered) {
    if (span.newText.length === 0) {
      tr.delete(span.from, span.to)
    } else {
      const marks = state.doc.resolve(span.from).marks()
      tr.replaceWith(span.from, span.to, state.schema.text(span.newText, marks))
    }
  }
  tr.setMeta(metaKey, true)
  return tr
}
