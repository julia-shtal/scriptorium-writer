import { DEMO_CHAPTER_1_DOC } from './demoContent'

export interface BootstrapResult {
  storyId: string
  chapterId: string
}

/**
 * Ensure there is something to edit on startup. Idempotent: if a story already exists,
 * open its first chapter (creating one if it somehow has none); otherwise seed a demo
 * story with two chapters, the first pre-filled with sample prose. This is the M2
 * stand-in for the Library/Chapters navigation that arrives in M6.
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

  const story = await window.api.createStory({ title: 'Демо' })
  const chapter1 = await window.api.createChapter(story.id, 'Глава 1')
  await window.api.createChapter(story.id, 'Глава 2')
  await window.api.saveChapter(story.id, {
    id: chapter1.id,
    title: chapter1.title,
    doc: DEMO_CHAPTER_1_DOC
  })
  return { storyId: story.id, chapterId: chapter1.id }
}
