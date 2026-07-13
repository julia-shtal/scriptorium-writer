// src/renderer/editor/cleanup/applyCleanup.ts
//
// Build the single transaction that applies all cleanup spans. Kept separate from the
// React action bar so it can be unit-tested against a bare EditorState.

import type { EditorState, Transaction } from '@tiptap/pm/state'
import type { CleanupSpan } from './computeSpans'

/**
 * Build one transaction replacing every span, applied **rightmost-first** (descending
 * `from`) so earlier positions stay valid as we edit. Each span becomes a text node
 * carrying the marks present at its start position (so bold/italic runs are preserved),
 * or a plain delete when `newText` is empty. Tagged `wandCleanup` so history and
 * snapshotting treat the whole thing as one atomic edit / one undo step.
 */
export function buildCleanupTransaction(state: EditorState, spans: CleanupSpan[]): Transaction {
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
  tr.setMeta('wandCleanup', true)
  return tr
}
