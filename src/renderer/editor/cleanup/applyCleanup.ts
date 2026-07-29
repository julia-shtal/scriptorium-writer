// src/renderer/editor/cleanup/applyCleanup.ts
//
// The wand's transaction builder. Thin wrapper over the shared span-replace builder
// (src/renderer/editor/shared/replaceSpans.ts), tagging the transaction `wandCleanup`.

import type { EditorState, Transaction } from '@tiptap/pm/state'
import type { CleanupSpan } from './computeSpans'
import { buildSpanReplaceTransaction } from '../shared/replaceSpans'

/** Build one `wandCleanup`-tagged transaction applying every cleanup span. */
export function buildCleanupTransaction(state: EditorState, spans: CleanupSpan[]): Transaction {
  return buildSpanReplaceTransaction(state, spans, 'wandCleanup')
}
