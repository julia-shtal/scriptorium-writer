import { create } from 'zustand'
import type { ProseMirrorJSON, SaveResult } from '@shared/types'
import { countWords, countWordsInText } from '@shared/word-count'

/** Footer save-status states. M5 fleshes out the transitions/retry UI. */
export type SaveStatus = 'idle' | 'editing' | 'saving' | 'saved' | 'error'

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
  saveStatus: SaveStatus
  lastSavedAt: string | null

  openChapter: (storyId: string, chapterId: string) => Promise<void>
  applyDocUpdate: (doc: ProseMirrorJSON, selectionText: string) => void
  setSelection: (selectionText: string) => void
  setTitle: (title: string) => void
  toggleIndent: () => void
  save: () => Promise<void>
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
  saveStatus: 'idle',
  lastSavedAt: null,

  openChapter: async (storyId, chapterId) => {
    // Minimal safeguard so the manual flow never loses edits when switching.
    // The full autosave + switch/quit guard orchestration is M5.
    if (get().dirty) await get().save()
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

  applyDocUpdate: (doc, selectionText) =>
    set({
      doc,
      dirty: true,
      saveStatus: 'editing',
      wordCount: countWords(doc),
      selectionWordCount: countWordsInText(selectionText)
    }),

  setSelection: (selectionText) =>
    set({ selectionWordCount: countWordsInText(selectionText) }),

  setTitle: (title) => set({ title, dirty: true, saveStatus: 'editing' }),

  toggleIndent: () => set((s) => ({ indentOn: !s.indentOn })),

  save: async () => {
    const { storyId, chapterId, title, doc } = get()
    if (!storyId || !chapterId || !doc) return
    set({ saveStatus: 'saving' })
    try {
      const result: SaveResult = await window.api.saveChapter(storyId, {
        id: chapterId,
        title,
        doc
      })
      set({
        dirty: false,
        saveStatus: 'saved',
        wordCount: result.wordCount,
        lastSavedAt: result.savedAt
      })
    } catch {
      // Typed AppError is decoded in preload; M5 adds retry UX.
      set({ saveStatus: 'error' })
    }
  }
}))
