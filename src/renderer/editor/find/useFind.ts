// src/renderer/editor/find/useFind.ts
//
// Orchestrates M15 Find & Replace against a TipTap editor. Owns match recomputation,
// active-match navigation, highlight decorations, and replace-one / replace-all (each a
// single tagged transaction → one undo step). Query/options live in uiStore so they
// survive leaving and re-entering the editor view; matches/activeIndex are local.

import { useCallback, useEffect, useRef, useState } from 'react'
import type { Editor } from '@tiptap/react'
import { useUiStore } from '@renderer/store/uiStore'
import { useEditorStore } from '@renderer/store/editorStore'
import { computeMatches, type FindMatch, type FindOptions } from './computeMatches'
import { findHighlightKey, type FindHighlightMeta } from './findHighlightPlugin'
import { buildSpanReplaceTransaction } from '../shared/replaceSpans'

export interface FindController {
  open: boolean
  query: string
  replacement: string
  options: FindOptions
  matches: FindMatch[]
  activeIndex: number
  replacedNote: number | null
  focusTarget: 'find' | 'replace'
  openPanel: (focus?: 'find' | 'replace') => void
  closePanel: () => void
  setQuery: (q: string) => void
  setReplacement: (r: string) => void
  setOptions: (o: Partial<FindOptions>) => void
  next: () => void
  prev: () => void
  replaceCurrent: () => void
  replaceAll: () => void
}

function pushHighlight(editor: Editor, meta: FindHighlightMeta): void {
  editor.view.dispatch(editor.state.tr.setMeta(findHighlightKey, meta))
}

export function useFind(editor: Editor | null): FindController {
  const open = useUiStore((s) => s.findOpen)
  const query = useUiStore((s) => s.findQuery)
  const replacement = useUiStore((s) => s.findReplacement)
  const options = useUiStore((s) => s.findOptions)
  const setFindOpen = useUiStore((s) => s.setFindOpen)
  const setFindQuery = useUiStore((s) => s.setFindQuery)
  const setFindReplacement = useUiStore((s) => s.setFindReplacement)
  const setFindOptions = useUiStore((s) => s.setFindOptions)

  const [matches, setMatches] = useState<FindMatch[]>([])
  const [activeIndex, setActiveIndex] = useState(-1)
  const [replacedNote, setReplacedNote] = useState<number | null>(null)
  const [focusTarget, setFocusTarget] = useState<'find' | 'replace'>('find')
  const debounceRef = useRef<number | null>(null)

  const syncHighlight = useCallback(
    (ms: FindMatch[], active: number) => {
      if (!editor) return
      pushHighlight(editor, ms.length ? { matches: ms, activeIndex: active } : null)
    },
    [editor]
  )

  const recompute = useCallback(
    (q: string, opts: FindOptions, preferredIndex?: number) => {
      if (!editor) return
      const ms = q.trim() ? computeMatches(editor.state.doc, q, opts) : []
      let active = -1
      if (ms.length > 0) {
        active = preferredIndex == null ? 0 : Math.min(Math.max(preferredIndex, 0), ms.length - 1)
      }
      setMatches(ms)
      setActiveIndex(active)
      syncHighlight(ms, active)
    },
    [editor, syncHighlight]
  )

  // Query change → debounce ~120ms.
  useEffect(() => {
    if (!open || !editor) return
    if (debounceRef.current) window.clearTimeout(debounceRef.current)
    debounceRef.current = window.setTimeout(() => recompute(query, options), 120)
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current)
    }
  }, [open, editor, query, options, recompute])

  // Option toggle → recompute immediately.
  useEffect(() => {
    if (!open || !editor) return
    recompute(query, options)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options])

  // Doc changes while open → recompute, keeping the same ordinal.
  useEffect(() => {
    if (!open || !editor) return
    const handler = (): void => recompute(query, options, activeIndex)
    editor.on('update', handler)
    return () => {
      editor.off('update', handler)
    }
  }, [open, editor, query, options, activeIndex, recompute])

  const scrollTo = useCallback(
    (m: FindMatch) => {
      if (!editor) return
      editor.commands.setTextSelection({ from: m.from, to: m.to })
      editor.commands.scrollIntoView()
    },
    [editor]
  )

  const goTo = useCallback(
    (index: number) => {
      if (matches.length === 0) return
      const wrapped = (index + matches.length) % matches.length
      setActiveIndex(wrapped)
      syncHighlight(matches, wrapped)
      scrollTo(matches[wrapped])
    },
    [matches, syncHighlight, scrollTo]
  )

  const next = useCallback(() => goTo(activeIndex + 1), [goTo, activeIndex])
  const prev = useCallback(() => goTo(activeIndex - 1), [goTo, activeIndex])

  const openPanel = useCallback(
    (focus: 'find' | 'replace' = 'find') => {
      if (!editor) return
      if (useEditorStore.getState().wandPreviewActive) return // never open over wand preview
      const { selection } = editor.state
      if (!selection.empty) {
        const sel = editor.state.doc.textBetween(selection.from, selection.to)
        if (sel.length > 0 && !sel.includes('\n')) setFindQuery(sel)
      }
      setFocusTarget(focus)
      setFindOpen(true)
    },
    [editor, setFindOpen, setFindQuery]
  )

  const closePanel = useCallback(() => {
    if (editor) pushHighlight(editor, null)
    setMatches([])
    setActiveIndex(-1)
    setFindOpen(false)
    editor?.commands.focus()
    // findQuery / findOptions intentionally retained in the store.
  }, [editor, setFindOpen])

  const replaceCurrent = useCallback(() => {
    if (!editor || activeIndex < 0 || matches.length === 0) return
    const m = matches[activeIndex]
    const tr = buildSpanReplaceTransaction(editor.state, [{ from: m.from, to: m.to, newText: replacement }], 'findReplace')
    editor.view.dispatch(tr)
    // The doc-changed dispatch also triggers Effect 3's recompute; this explicit call
    // fixes the preferred activeIndex. Both run synchronously in one call stack so
    // React 18 batches them — no flicker.
    recompute(query, options, activeIndex)
  }, [editor, activeIndex, matches, replacement, query, options, recompute])

  const replaceAll = useCallback(() => {
    if (!editor || matches.length === 0) return
    const spans = matches.map((m) => ({ from: m.from, to: m.to, newText: replacement }))
    const count = spans.length
    const tr = buildSpanReplaceTransaction(editor.state, spans, 'findReplace')
    editor.view.dispatch(tr)
    // The doc-changed dispatch also triggers Effect 3's recompute; this explicit call
    // fixes the preferred activeIndex. Both run synchronously in one call stack so
    // React 18 batches them — no flicker.
    recompute(query, options, 0)
    setReplacedNote(count)
    window.setTimeout(() => setReplacedNote(null), 2000)
  }, [editor, matches, replacement, query, options, recompute])

  return {
    open, query, replacement, options, matches, activeIndex, replacedNote, focusTarget,
    openPanel, closePanel,
    setQuery: setFindQuery, setReplacement: setFindReplacement, setOptions: setFindOptions,
    next, prev, replaceCurrent, replaceAll
  }
}
