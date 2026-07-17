import { create } from 'zustand'
import type { ProseMirrorJSON, SaveResult } from '@shared/types'
import { countWords, countWordsInText } from '@shared/word-count'

/** Footer save-status states. */
export type SaveStatus = 'idle' | 'editing' | 'saving' | 'saved' | 'error'

// Autosave config + timer handles live at module scope: outside React so they
// survive re-renders, and outside the store so tests can drive them with fake
// timers. `inFlight` serializes saves so concurrent triggers never double-write.
let debounceMs = 2000
let intervalMs = 120000
let debounceTimer: ReturnType<typeof setTimeout> | null = null
let intervalTimer: ReturnType<typeof setInterval> | null = null
let inFlight: Promise<void> | null = null

interface EditorState {
  storyId: string | null
  chapterId: string | null
  title: string
  doc: ProseMirrorJSON | null
  dirty: boolean
  wordCount: number
  selectionWordCount: number
  /** Per-chapter view preference (first-line indent). Not stored in the doc. */
  indentOn: boolean
  /**
   * True while the cleanup wand is showing its inline diff preview. The doc is only
   * decorated (not yet edited), the editor is read-only, and autosave must be
   * suppressed so no snapshot of the uncommitted, decoration-only state is taken.
   */
  wandPreviewActive: boolean
  saveStatus: SaveStatus
  lastSavedAt: string | null
  /** Soft warning when the sibling `.md` backup failed to write (M7); canon still saved. */
  mdWarning: string | null

  openChapter: (storyId: string, chapterId: string) => Promise<void>
  applyDocUpdate: (doc: ProseMirrorJSON, selectionText: string) => void
  setSelection: (selectionText: string) => void
  setTitle: (title: string) => void
  toggleIndent: () => void
  /** Enter/leave the wand preview (see `wandPreviewActive`). */
  setWandPreviewActive: (active: boolean) => void
  /** The single write path — used by manual Save, debounce, interval, blur, quit. */
  flush: () => Promise<void>
  /** Manual Save button alias (cancels any pending debounce, then flushes). */
  save: () => Promise<void>
  /** Arm the debounce timer after an edit. */
  scheduleAutosave: () => void
  /** (Re)configure debounce/interval and (re)start the interval timer. */
  configureAutosave: (cfg: { debounceMs: number; intervalMs: number }) => void
  /** Clear both timers (unmount / test teardown). */
  stopAutosave: () => void
  /** Close the open chapter (e.g. its story was deleted): cancel pending autosave and reset editor state. */
  closeChapter: () => void
}

export const useEditorStore = create<EditorState>((set, get) => ({
  storyId: null,
  chapterId: null,
  title: '',
  doc: null,
  dirty: false,
  wordCount: 0,
  selectionWordCount: 0,
  indentOn: true,
  wandPreviewActive: false,
  saveStatus: 'idle',
  lastSavedAt: null,
  mdWarning: null,

  openChapter: async (storyId, chapterId) => {
    // Chapter-switch guard: cancel any pending debounce and force a final flush so
    // no unsaved edits are lost when the doc is swapped out from under the editor.
    if (debounceTimer) {
      clearTimeout(debounceTimer)
      debounceTimer = null
    }
    if (get().dirty) await get().flush()
    const chapter = await window.api.readChapter(storyId, chapterId)
    set({
      storyId,
      chapterId,
      title: chapter.title,
      doc: chapter.doc,
      dirty: false,
      wordCount: chapter.wordCount,
      selectionWordCount: 0,
      saveStatus: 'idle'
    })
  },

  applyDocUpdate: (doc, selectionText) => {
    set({
      doc,
      dirty: true,
      saveStatus: 'editing',
      wordCount: countWords(doc),
      selectionWordCount: countWordsInText(selectionText)
    })
    get().scheduleAutosave()
  },

  setSelection: (selectionText) =>
    set({ selectionWordCount: countWordsInText(selectionText) }),

  setTitle: (title) => {
    set({ title, dirty: true, saveStatus: 'editing' })
    get().scheduleAutosave()
  },

  toggleIndent: () => set((s) => ({ indentOn: !s.indentOn })),

  setWandPreviewActive: (active) => set({ wandPreviewActive: active }),

  flush: async () => {
    // Serialize with any save already running, then re-check dirty so edits made
    // mid-save are captured by a follow-up flush (never two concurrent writes).
    if (inFlight) await inFlight
    const { storyId, chapterId, title, doc, dirty } = get()
    if (!dirty || !storyId || !chapterId || !doc) return
    set({ saveStatus: 'saving', mdWarning: null })
    const run = (async () => {
      try {
        const result: SaveResult = await window.api.saveChapter(storyId, {
          id: chapterId,
          title,
          doc
        })
        // If the doc/title changed while the save was in flight, stay dirty and let
        // the next flush persist the newer state; don't clobber live word count.
        const changed = get().doc !== doc || get().title !== title
        if (changed) {
          set({ saveStatus: 'editing', dirty: true, lastSavedAt: result.savedAt })
        } else {
          set({
            saveStatus: 'saved',
            dirty: false,
            wordCount: result.wordCount,
            lastSavedAt: result.savedAt,
            mdWarning: result.mdWarning ?? null
          })
        }
      } catch {
        // Typed AppError is decoded in preload. Keep dirty so retry/interval re-tries.
        set({ saveStatus: 'error' })
      }
    })()
    inFlight = run
    try {
      await run
    } finally {
      if (inFlight === run) inFlight = null
    }
  },

  save: async () => {
    if (debounceTimer) {
      clearTimeout(debounceTimer)
      debounceTimer = null
    }
    await get().flush()
  },

  scheduleAutosave: () => {
    // Suppressed during the wand preview: the doc is only decorated, not yet edited.
    if (get().wandPreviewActive) return
    if (debounceTimer) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => {
      debounceTimer = null
      void get().flush()
    }, debounceMs)
  },

  configureAutosave: ({ debounceMs: d, intervalMs: i }) => {
    debounceMs = d
    intervalMs = i
    if (intervalTimer) clearInterval(intervalTimer)
    intervalTimer = setInterval(() => {
      // Skip the periodic flush while the wand preview is up (uncommitted state).
      if (get().dirty && !get().wandPreviewActive) void get().flush()
    }, intervalMs)
  },

  stopAutosave: () => {
    if (debounceTimer) {
      clearTimeout(debounceTimer)
      debounceTimer = null
    }
    if (intervalTimer) {
      clearInterval(intervalTimer)
      intervalTimer = null
    }
  },

  closeChapter: () => {
    if (debounceTimer) {
      clearTimeout(debounceTimer)
      debounceTimer = null
    }
    set({
      storyId: null,
      chapterId: null,
      title: '',
      doc: null,
      dirty: false,
      wordCount: 0,
      selectionWordCount: 0,
      saveStatus: 'idle',
      lastSavedAt: null,
      mdWarning: null
    })
  }
}))
