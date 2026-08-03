import { api } from '@renderer/platform'
import { DEMO_CHAPTER_1_DOC } from './demoContent'

export interface BootstrapResult {
  storyId: string | null
  chapterId: string | null
}

/**
 * Ensure there is something to edit on startup. If a story already exists, prefer
 * reopening whatever the user last had open (`settings.lastOpenedStoryId` /
 * `lastOpenedChapterId`), falling back to the first story/chapter when there's no
 * recorded choice or it no longer exists (e.g. deleted since). If the library is
 * empty, seed a demo story ONLY on a genuine first run (tracked by
 * `settings.demoSeeded`); once that flag is set, an empty library (e.g. because the
 * user deleted everything) stays empty instead of resurrecting the demo. This is the
 * M2 stand-in for the Library/Chapters navigation that arrives in M6.
 */
export async function bootstrapLibrary(): Promise<BootstrapResult> {
  const stories = await api().listStories()
  const settings = await api().readSettings()

  if (stories.length > 0) {
    const lastStorySummary = settings.lastOpenedStoryId
      ? stories.find((s) => s.id === settings.lastOpenedStoryId)
      : undefined
    const targetStoryId = lastStorySummary ? lastStorySummary.id : stories[0].id

    const story = await api().readStory(targetStoryId)
    let chapterId =
      settings.lastOpenedChapterId && story.chapterOrder.includes(settings.lastOpenedChapterId)
        ? settings.lastOpenedChapterId
        : story.chapterOrder[0]
    if (!chapterId) {
      const chapter = await api().createChapter(story.id, 'Глава 1')
      chapterId = chapter.id
    }
    return { storyId: story.id, chapterId }
  }

  // Empty library: seed the demo only on a genuine first run. Once the user has
  // deleted everything (demoSeeded already set), leave the library empty instead of
  // resurrecting a story they deliberately removed.
  if (settings.demoSeeded) {
    return { storyId: null, chapterId: null }
  }

  const story = await api().createStory({ title: 'Демо' })
  const chapter1 = await api().createChapter(story.id, 'Глава 1')
  await api().saveChapter(story.id, {
    id: chapter1.id,
    title: chapter1.title,
    doc: DEMO_CHAPTER_1_DOC
  })
  await api().saveSettings({ ...settings, demoSeeded: true })
  return { storyId: story.id, chapterId: chapter1.id }
}
