import { api, getPlatform } from '@renderer/platform'
import { DEMO_CHAPTER_1_DOC } from './demoContent'
import { defaultChapterTitle } from './chapter-title'

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
 *
 * Seeding is additionally gated on the platform reporting that it can actually read the
 * library (MC3) — see the guard below.
 */
export async function bootstrapLibrary(): Promise<BootstrapResult> {
  // MC3, Android. `storageAccess` exists only where the OS can withhold access to the
  // library; `undefined` therefore means "no gate applies" (desktop/web), not "denied".
  //
  // When it IS denied, the reads below return a lie rather than an error. Measured on the
  // target tablet during MC2: after an uninstall the library files were still on disk, but
  // the reinstalled app had lost MediaStore ownership of them, so `listStories()` came back
  // EMPTY — not throwing. This function read that empty list as "first run", seeded a demo
  // story, and wrote it into a folder full of writing it could not see. Three demo stories
  // («демо», «демо-2», «демо-3») accumulated that way over one test session.
  //
  // So: no positive evidence that the library is readable, no writing. Return the same empty
  // result as an already-seeded empty library — and crucially do NOT set `demoSeeded`, which
  // would silently consume the real first run of a library we never managed to look at.
  //
  // Belt and braces: `app.tsx` holds the whole boot behind StorageAccessGate, so in practice
  // this is unreachable. It stays because the seeding decision is made *here*, and the next
  // caller of `bootstrapLibrary` will not know about the gate.
  if (getPlatform().storageAccess?.granted === false) {
    return { storyId: null, chapterId: null }
  }

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
      const chapter = await api().createChapter(
        story.id,
        defaultChapterTitle(1, settings.language ?? 'ru')
      )
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
  const chapter1 = await api().createChapter(
    story.id,
    defaultChapterTitle(1, settings.language ?? 'ru')
  )
  await api().saveChapter(story.id, {
    id: chapter1.id,
    title: chapter1.title,
    doc: DEMO_CHAPTER_1_DOC
  })
  await api().saveSettings({ ...settings, demoSeeded: true })
  return { storyId: story.id, chapterId: chapter1.id }
}
