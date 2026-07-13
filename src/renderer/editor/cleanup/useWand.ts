// src/renderer/editor/cleanup/useWand.ts
//
// Orchestrates the wand's preview → confirm/cancel flow against a TipTap editor and
// the editor store. Shared by the Toolbar (trigger) and the WandActionBar
// (confirm/cancel + keyboard).

import { useCallback, useState } from 'react'
import type { Editor } from '@tiptap/react'
import { useEditorStore } from '@renderer/store/editorStore'
import { computeSpans, type CleanupSpan } from './computeSpans'
import { buildCleanupTransaction } from './applyCleanup'
import { wandPreviewKey, type WandPreviewMeta } from './wandPreviewPlugin'

export interface WandController {
  /** Spans currently previewed (empty when not in preview). */
  spans: CleanupSpan[]
  /** Transient "nothing to clean" note; auto-clears. */
  emptyNote: boolean
  /** Compute spans over the selection (or whole doc) and enter preview, or note-empty. */
  trigger: () => void
  /** Apply all spans as one transaction and leave preview. */
  confirm: () => void
  /** Discard the preview; the doc is untouched. */
  cancel: () => void
}

function setPreviewMeta(editor: Editor, meta: WandPreviewMeta): void {
  const { state, view } = editor
  view.dispatch(state.tr.setMeta(wandPreviewKey, meta))
}

export function useWand(editor: Editor | null): WandController {
  const [spans, setSpans] = useState<CleanupSpan[]>([])
  const [emptyNote, setEmptyNote] = useState(false)
  const setWandPreviewActive = useEditorStore((s) => s.setWandPreviewActive)

  const leavePreview = useCallback(() => {
    if (!editor) return
    setPreviewMeta(editor, null)
    editor.setEditable(true)
    setWandPreviewActive(false)
    setSpans([])
  }, [editor, setWandPreviewActive])

  const trigger = useCallback(() => {
    if (!editor) return
    const { selection, doc } = editor.state
    const range = selection.empty ? { from: 0, to: doc.content.size } : { from: selection.from, to: selection.to }
    const computed = computeSpans(doc, range)
    if (computed.length === 0) {
      setEmptyNote(true)
      window.setTimeout(() => setEmptyNote(false), 1800)
      return
    }
    setSpans(computed)
    setPreviewMeta(editor, { spans: computed })
    editor.setEditable(false)
    setWandPreviewActive(true)
  }, [editor, setWandPreviewActive])

  const confirm = useCallback(() => {
    if (!editor || spans.length === 0) return
    // Re-enable editing first so the applying transaction is accepted, then leave.
    editor.setEditable(true)
    setPreviewMeta(editor, null)
    const tr = buildCleanupTransaction(editor.state, spans)
    editor.view.dispatch(tr)
    setWandPreviewActive(false)
    setSpans([])
    editor.commands.focus()
  }, [editor, spans, setWandPreviewActive])

  const cancel = useCallback(() => {
    leavePreview()
    editor?.commands.focus()
  }, [editor, leavePreview])

  return { spans, emptyNote, trigger, confirm, cancel }
}
