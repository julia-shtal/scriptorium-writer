/**
 * Web platform composition root (MP3, storage upgraded to OPFS in MP4).
 *
 * This is the browser-side analogue of the Electron main-process wiring: it maps the
 * shared {@link Api} surface directly onto {@link FileService} calls — the same 1:1
 * mapping the IPC layer (`src/main/ipc.ts`) performs, minus the IPC hop, since in the
 * web build the renderer and the data layer run in the same JS context.
 *
 * Storage is OPFS-backed (`OpfsFsPort`): `createWebPlatform` boots a `FileService`
 * over the Origin Private File System, so data PERSISTS across page reloads.
 *
 * Browser code: this module must never import a `node:` built-in.
 */

import type { Api } from '@shared/types'
import type { Platform } from '@renderer/platform'
import { AppError } from '@shared/errors'
import { FileService } from '@data/file-service'
import { OpfsFsPort } from './opfs-fs-port'

/**
 * Build the full {@link Api} surface backed directly by a {@link FileService}. The
 * return type is annotated as `Api` so the compiler enforces the complete surface: if
 * `Api` grows a method, this object must gain it too or fail to compile.
 */
export function makeApiFromService(service: FileService): Api {
  const api: Api = {
    ping: async () => 'pong',

    // library
    listStories: () => service.listStories(),
    createStory: (input) => service.createStory(input),
    deleteStory: (id) => service.deleteStory(id),

    // story
    readStory: (id) => service.readStory(id),
    updateStoryMeta: (id, meta) => service.updateStoryMeta(id, meta),
    reorderChapters: (id, chapterIds) => service.reorderChapters(id, chapterIds),

    // chapters
    createChapter: (storyId, title) => service.createChapter(storyId, title),
    readChapter: (storyId, chapterId) => service.readChapter(storyId, chapterId),
    saveChapter: (storyId, chapter) => service.saveChapter(storyId, chapter),
    deleteChapter: (storyId, chapterId) => service.deleteChapter(storyId, chapterId),

    // versions
    listVersions: (storyId, chapterId) => service.listVersions(storyId, chapterId),
    readVersion: (storyId, chapterId, versionId) =>
      service.readVersion(storyId, chapterId, versionId),
    restoreVersion: (storyId, chapterId, versionId) =>
      service.restoreVersion(storyId, chapterId, versionId),

    // notes
    readNotes: (storyId) => service.readNotes(storyId),
    saveNotes: (storyId, notes) => service.saveNotes(storyId, notes),

    // settings
    readSettings: () => service.readSettings(),
    saveSettings: (settings) => service.saveSettings(settings),
    applySpellLanguages: async (_langs) => {
      // TODO(MP5): web spellcheck — no live browser spellchecker session to configure yet.
      throw new AppError(
        'UNSUPPORTED',
        'Spellcheck language switching is not available in the web build.'
      )
    },

    // recovery
    scanLibrary: () => service.scanLibrary(),

    // misc
    revealInFolder: async (_path) => {
      throw new AppError(
        'UNSUPPORTED',
        'Revealing a folder in the OS file explorer is not available in a browser.'
      )
    },
    exportLibrary: async () => {
      // TODO(MP6): web import/export
      throw new AppError('UNSUPPORTED', 'Library export is not available in the web build.')
    },

    // import / export
    readImportFile: async () => {
      // TODO(MP6): web import/export
      throw new AppError('UNSUPPORTED', 'File import is not available in the web build.')
    },
    exportChapter: async (_storyId, _chapterId, _format) => {
      // TODO(MP6): web import/export
      throw new AppError('UNSUPPORTED', 'Chapter export is not available in the web build.')
    },
    exportStory: async (_storyId, _format) => {
      // TODO(MP6): web import/export
      throw new AppError('UNSUPPORTED', 'Story export is not available in the web build.')
    }
  }
  return api
}

/**
 * Best-effort request for persistent storage so the browser is less likely to evict
 * OPFS data under disk pressure. Not available on every platform/browser
 * (`navigator.storage?.persist` may be undefined), so this is guarded and never
 * throws. The outcome is logged and surfaced on the returned {@link Platform} so a
 * later milestone (MP9) can warn the user when persistence was not granted.
 */
async function requestPersistentStorage(): Promise<boolean | undefined> {
  if (typeof navigator === 'undefined' || !navigator.storage?.persist) return undefined
  try {
    const granted = await navigator.storage.persist()
    if (granted) {
      console.log('[web platform] persistent storage granted')
    } else {
      console.warn(
        '[web platform] persistent storage NOT granted — OPFS data may be evicted under disk pressure'
      )
    }
    return granted
  } catch (err) {
    console.warn('[web platform] navigator.storage.persist() failed', err)
    return undefined
  }
}

/**
 * Boot the web {@link Platform}: OPFS-backed filesystem → FileService → Api. No
 * `lifecycle` is provided — the browser has no host quit/update lifecycle to bridge.
 */
export async function createWebPlatform(): Promise<Platform> {
  const storagePersisted = await requestPersistentStorage()
  const fs = new OpfsFsPort()
  const service = new FileService({
    fs,
    userDataPath: '/userdata',
    defaultLibraryPath: '/library'
  })
  await service.ensureLibrary()
  return { api: makeApiFromService(service), storagePersisted } // no `lifecycle` on web
}
