import { contextBridge, ipcRenderer } from 'electron'
import type { Api, LifecycleApi } from '@shared/types'
import { AppError, decodeIpcError } from '@shared/errors'

/**
 * Typed `window.api` surface. Every method is a thin wrapper over
 * `ipcRenderer.invoke`, with signatures that exactly match `@shared/types` (Api).
 *
 * Errors thrown in main are encoded into the rejection's message (see
 * `src/main/ipc.ts`); we decode them back into a typed {@link AppError} so the
 * renderer gets a real `code` to branch on instead of an opaque string.
 */
async function invoke<T>(channel: keyof Api, ...args: unknown[]): Promise<T> {
  try {
    return (await ipcRenderer.invoke(channel, ...args)) as T
  } catch (err) {
    const decoded = err instanceof Error ? decodeIpcError(err.message) : null
    if (decoded) throw new AppError(decoded.code, decoded.message)
    throw err
  }
}

const api: Api = {
  ping: () => invoke('ping'),

  // library
  listStories: () => invoke('listStories'),
  createStory: (input) => invoke('createStory', input),
  deleteStory: (id) => invoke('deleteStory', id),

  // story
  readStory: (id) => invoke('readStory', id),
  updateStoryMeta: (id, meta) => invoke('updateStoryMeta', id, meta),
  reorderChapters: (id, chapterIds) => invoke('reorderChapters', id, chapterIds),

  // chapters
  createChapter: (storyId, title) => invoke('createChapter', storyId, title),
  readChapter: (storyId, chapterId) => invoke('readChapter', storyId, chapterId),
  saveChapter: (storyId, chapter) => invoke('saveChapter', storyId, chapter),
  deleteChapter: (storyId, chapterId) => invoke('deleteChapter', storyId, chapterId),

  // versions
  listVersions: (storyId, chapterId) => invoke('listVersions', storyId, chapterId),
  readVersion: (storyId, chapterId, versionId) =>
    invoke('readVersion', storyId, chapterId, versionId),
  restoreVersion: (storyId, chapterId, versionId) =>
    invoke('restoreVersion', storyId, chapterId, versionId),

  // notes
  readNotes: (storyId) => invoke('readNotes', storyId),
  saveNotes: (storyId, notes) => invoke('saveNotes', storyId, notes),

  // settings
  readSettings: () => invoke('readSettings'),
  saveSettings: (settings) => invoke('saveSettings', settings),
  applySpellLanguages: (langs) => invoke('applySpellLanguages', langs),

  // recovery
  scanLibrary: () => invoke('scanLibrary'),

  // misc
  revealInFolder: (path) => invoke('revealInFolder', path)
}

const lifecycle: LifecycleApi = {
  onQuitFlush: (handler) => {
    ipcRenderer.on('quit:flush-request', async () => {
      try {
        await handler()
      } finally {
        // Always ack, even if the flush threw — main must not hang the quit.
        ipcRenderer.send('quit:flush-done')
      }
    })
  }
}

// With contextIsolation enabled (it always is — see main), expose through the
// contextBridge. The `else` branch only exists as a defensive fallback and should
// never run given our BrowserWindow config.
if (process.contextIsolated) {
  contextBridge.exposeInMainWorld('api', api)
  contextBridge.exposeInMainWorld('lifecycle', lifecycle)
} else {
  // @ts-expect-error — define on window only in the (unreachable) non-isolated case
  window.api = api
  // @ts-expect-error — same fallback for the lifecycle bridge
  window.lifecycle = lifecycle
}
