import type { ChapterRecovery } from '@shared/types'
import { api } from '@renderer/platform'
import { bootstrapLibrary } from './bootstrap'
import { useEditorStore } from './editorStore'
import { useSettingsStore } from './settingsStore'
import { useStoryStore } from './storyStore'
import { useUiStore } from './uiStore'

/**
 * The one-time application boot: settings, then the library. Extracted from `app.tsx`
 * so the ordering below is testable — it is load-bearing, and getting it wrong is
 * invisible until the day something in the library is broken.
 *
 * Settings load FIRST, because nothing about them depends on the library while a great
 * deal downstream depends on them (editor font and autosave, the UI language that seeds
 * new chapter titles, the Settings view itself). They used to load last, so a library
 * that failed to open left `settings` null for the rest of the session — the Settings
 * view stuck on «Загрузка…», with no way back short of restarting the app.
 *
 * Returns the chapters the startup scan flagged, for the recovery dialog. Throws only
 * on failures the user cannot resolve from that dialog; the caller renders the message.
 */
export async function bootApp(): Promise<ChapterRecovery[]> {
  await useSettingsStore.getState().load()

  const recoveries = await api().scanLibrary()
  const { storyId, chapterId } = await bootstrapLibrary()

  if (!storyId || !chapterId) {
    // Empty library (nothing seeded): land on the Library view.
    useUiStore.getState().setActiveView('library')
    return recoveries
  }

  // The story list first: it tolerates an unreadable chapter, so the book stays open
  // even when one of its chapters is the thing being recovered.
  await useStoryStore.getState().load(storyId)
  try {
    await useEditorStore.getState().openChapter(storyId, chapterId)
  } catch (err) {
    // A chapter the scan already flagged is *expected* to fail to open — deleting a
    // canon is exactly what puts it on that list, and it is very often the chapter the
    // writer had open last. Turning that into a fatal boot error would blank the app
    // behind the very dialog offering to restore it.
    const flagged = recoveries.some((r) => r.storyId === storyId && r.chapterId === chapterId)
    if (!flagged) throw err
  }
  return recoveries
}
