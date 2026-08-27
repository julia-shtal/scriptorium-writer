import { create } from 'zustand'
import type { Story, StoryMeta } from '@shared/types'
import { useEditorStore } from './editorStore'
import { useSettingsStore } from './settingsStore'
import { moveItem } from '@renderer/views/chapters-reorder'
import { api } from '@renderer/platform'
import { defaultChapterTitle } from './chapter-title'

/** Active UI language, read lazily at creation time; defaults to 'ru' before settings load. */
const currentLanguage = (): 'ru' | 'en' => useSettingsStore.getState().settings?.language ?? 'ru'

/** One row in the open story's chapter list. */
export interface ChapterRow {
  id: string
  title: string
  wordCount: number
  /**
   * The chapter is in `chapterOrder` but its canon could not be read (missing or
   * corrupt). The row is a placeholder: title and word count are unknown, and the UI
   * must not offer to open, rename or export it. Startup recovery is what fixes it.
   */
  missing?: boolean
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
    story.chapterOrder.map(async (id): Promise<ChapterRow> => {
      try {
        const ch = await api().readChapter(story.id, id)
        return { id: ch.id, title: ch.title, wordCount: ch.wordCount }
      } catch {
        // One unreadable chapter must never take the whole story down with it. It used
        // to: a single missing canon left `story` null, so the app showed "no open work"
        // — behind the very recovery dialog offering to restore that chapter. Flagged
        // as a placeholder row, never silently dropped (CLAUDE.md: no silent blanking).
        return { id, title: '', wordCount: 0, missing: true }
      }
    })
  )
}

export const useStoryStore = create<StoryState>((set, get) => ({
  story: null,
  chapters: [],

  load: async (storyId) => {
    const story = await api().readStory(storyId)
    set({ story, chapters: await loadRows(story) })
  },

  reload: async () => {
    const { story } = get()
    if (story) await get().load(story.id)
  },

  openStory: async (storyId) => {
    const story = await api().readStory(storyId)
    set({ story, chapters: await loadRows(story) })
    let chapterId = story.chapterOrder[0]
    if (!chapterId) {
      const ch = await api().createChapter(storyId, defaultChapterTitle(1, currentLanguage()))
      chapterId = ch.id
      await get().reload()
    }
    await useEditorStore.getState().openChapter(storyId, chapterId)
  },

  reorder: async (chapterIds) => {
    const { story } = get()
    if (!story) return
    await api().reorderChapters(story.id, chapterIds)
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
    const seed = defaultChapterTitle(story.chapterOrder.length + 1, currentLanguage())
    const ch = await api().createChapter(story.id, title || seed)
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
      const ch = await api().readChapter(story.id, chapterId)
      await api().saveChapter(story.id, { id: chapterId, title, doc: ch.doc })
    }
    await get().reload()
  },

  removeChapter: async (chapterId) => {
    const { story } = get()
    if (!story) return
    await api().deleteChapter(story.id, chapterId)
    await get().reload()
  },

  updateMeta: async (patch) => {
    const { story } = get()
    if (!story) return
    const updated = await api().updateStoryMeta(story.id, patch)
    set({ story: updated })
  },

  close: () => set({ story: null, chapters: [] })
}))
