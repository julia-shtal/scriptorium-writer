import { create } from 'zustand'
import type { Story, StoryMeta } from '@shared/types'
import { useEditorStore } from './editorStore'
import { moveItem } from '@renderer/views/chapters-reorder'

/** One row in the open story's chapter list. */
export interface ChapterRow {
  id: string
  title: string
  wordCount: number
}

interface StoryState {
  story: Story | null
  chapters: ChapterRow[]
  load: (storyId: string) => Promise<void>
  reload: () => Promise<void>
  openStory: (storyId: string) => Promise<void>
  reorder: (chapterIds: string[]) => Promise<void>
  moveChapter: (from: number, to: number) => Promise<void>
  addChapter: (title: string) => Promise<void>
  renameChapter: (chapterId: string, title: string) => Promise<void>
  removeChapter: (chapterId: string) => Promise<void>
  updateMeta: (patch: Partial<StoryMeta>) => Promise<void>
  close: () => void
}

async function loadRows(story: Story): Promise<ChapterRow[]> {
  return Promise.all(
    story.chapterOrder.map(async (id) => {
      const ch = await window.api.readChapter(story.id, id)
      return { id: ch.id, title: ch.title, wordCount: ch.wordCount }
    })
  )
}

export const useStoryStore = create<StoryState>((set, get) => ({
  story: null,
  chapters: [],

  load: async (storyId) => {
    const story = await window.api.readStory(storyId)
    set({ story, chapters: await loadRows(story) })
  },

  reload: async () => {
    const { story } = get()
    if (story) await get().load(story.id)
  },

  openStory: async (storyId) => {
    const story = await window.api.readStory(storyId)
    set({ story, chapters: await loadRows(story) })
    let chapterId = story.chapterOrder[0]
    if (!chapterId) {
      const ch = await window.api.createChapter(storyId, 'Глава 1')
      chapterId = ch.id
      await get().reload()
    }
    await useEditorStore.getState().openChapter(storyId, chapterId)
  },

  reorder: async (chapterIds) => {
    const { story } = get()
    if (!story) return
    await window.api.reorderChapters(story.id, chapterIds)
    const byId = new Map(get().chapters.map((c) => [c.id, c]))
    set({
      story: { ...story, chapterOrder: chapterIds },
      chapters: chapterIds.map((id) => byId.get(id)).filter((c): c is ChapterRow => !!c)
    })
  },

  moveChapter: async (from, to) => {
    const ids = get().chapters.map((c) => c.id)
    await get().reorder(moveItem(ids, from, to))
  },

  addChapter: async (title) => {
    const { story } = get()
    if (!story) return
    const ch = await window.api.createChapter(story.id, title || 'Новая глава')
    await get().reload()
    await useEditorStore.getState().openChapter(story.id, ch.id)
  },

  renameChapter: async (chapterId, title) => {
    const { story } = get()
    if (!story) return
    const editor = useEditorStore.getState()
    if (editor.chapterId === chapterId) {
      // The open chapter has a live (possibly dirty) doc in the editor. Route the
      // rename through the editor's single write path so we never round-trip a stale
      // on-disk doc and clobber unsaved prose (reliability #1: two writers must not
      // fight over one chapter's canon).
      editor.setTitle(title)
      await editor.flush()
    } else {
      const ch = await window.api.readChapter(story.id, chapterId)
      await window.api.saveChapter(story.id, { id: chapterId, title, doc: ch.doc })
    }
    await get().reload()
  },

  removeChapter: async (chapterId) => {
    const { story } = get()
    if (!story) return
    await window.api.deleteChapter(story.id, chapterId)
    await get().reload()
  },

  updateMeta: async (patch) => {
    const { story } = get()
    if (!story) return
    const updated = await window.api.updateStoryMeta(story.id, patch)
    set({ story: updated })
  },

  close: () => set({ story: null, chapters: [] })
}))
