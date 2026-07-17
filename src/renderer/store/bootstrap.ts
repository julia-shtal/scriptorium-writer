import { DEMO_CHAPTER_1_DOC } from './demoContent'

export interface BootstrapResult {
  storyId: string | null
  chapterId: string | null
}

/**
 * Ensure there is something to edit on startup. If a story already exists, open its
 * first chapter (creating one if it somehow has none). If the library is empty, seed
 * a demo story ONLY on a genuine first run (tracked by `settings.demoSeeded`); once
 * that flag is set, an empty library (e.g. because the user deleted everything) stays
 * empty instead of resurrecting the demo. This is the M2 stand-in for the
 * Library/Chapters navigation that arrives in M6.
 */
export async function bootstrapLibrary(): Promise<BootstrapResult> {
  const stories = await window.api.listStories()

  if (stories.length > 0) {
    const story = await window.api.readStory(stories[0].id)
    let chapterId = story.chapterOrder[0]
    if (!chapterId) {
      const chapter = await window.api.createChapter(story.id, 'Глава 1')
      chapterId = chapter.id
    }
    return { storyId: story.id, chapterId }
  }

  // Empty library: seed the demo only on a genuine first run. Once the user has
  // deleted everything (demoSeeded already set), leave the library empty instead of
  // resurrecting a story they deliberately removed.
  const settings = await window.api.readSettings()
  if (settings.demoSeeded) {
    return { storyId: null, chapterId: null }
  }

  const story = await window.api.createStory({ title: 'Демо' })
  const chapter1 = await window.api.createChapter(story.id, 'Глава 1')
  await window.api.saveChapter(story.id, {
    id: chapter1.id,
    title: chapter1.title,
    doc: DEMO_CHAPTER_1_DOC
  })
  await window.api.saveSettings({ ...settings, demoSeeded: true })
  return { storyId: story.id, chapterId: chapter1.id }
}
