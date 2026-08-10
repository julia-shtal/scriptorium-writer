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

import { zip } from 'fflate'
import type { Api, ImportFileResult, ExportFileResult, ExportLibraryResult } from '@shared/types'
import type { Platform } from '@renderer/platform'
import { AppError } from '@shared/errors'
import { FileService } from '@data/file-service'
import { buildChapterExportBytes, buildStoryExportBytes } from '@data/export-format'
import { OpfsFsPort } from './opfs-fs-port'
import { pickImportFile } from './import-file'
import { triggerDownload, MIME } from './download'

/** Strip characters illegal in filenames; mirrors the desktop saveExport sanitizer. */
function safeName(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, '_').slice(0, 80)
}

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
      // Web has no app-managed spellchecker to (re)configure — the device's native
      // checker decides which languages it offers. Intentionally a resolved no-op,
      // NOT an UNSUPPORTED throw: Settings calls this on every language toggle and
      // must not error. The spellLanguages setting still persists (readSettings/
      // saveSettings), so the same library opened on desktop keeps the user's choice.
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
    exportLibrary: async (): Promise<ExportLibraryResult> => {
      const entries = await service.readLibraryEntries()
      const tree: Record<string, Uint8Array> = {}
      for (const e of entries) tree[e.path] = e.data
      const bytes = await new Promise<Uint8Array>((resolve, reject) => {
        // Async (non-blocking) zip; level 6 matches the desktop archiver setting.
        zip(tree, { level: 6 }, (err, data) => (err ? reject(err) : resolve(data)))
      })
      const filename = `library-${new Date().toISOString().slice(0, 10)}.zip`
      triggerDownload(bytes, filename, MIME.zip)
      // Web has no OS path and no cancel signal: `path` is the download filename, never canceled.
      return { canceled: false, path: filename }
    },

    // import / export
    readImportFile: (): Promise<ImportFileResult> => pickImportFile(),
    exportChapter: async (storyId, chapterId, format): Promise<ExportFileResult> => {
      const chapter = await service.readChapter(storyId, chapterId)
      const bytes = await buildChapterExportBytes(chapter, format)
      const filename = `${safeName(chapter.title) || 'chapter'}.${format}`
      triggerDownload(bytes, filename, MIME[format])
      // `path` is the download filename (not a filesystem path); never canceled on web.
      return { canceled: false, path: filename }
    },
    exportStory: async (storyId, format): Promise<ExportFileResult> => {
      const story = await service.readStory(storyId)
      const chapters = await Promise.all(
        story.chapterOrder.map((id) => service.readChapter(storyId, id))
      )
      const bytes = await buildStoryExportBytes(chapters, story.chapterOrder, format)
      const filename = `${safeName(story.title) || 'story'}.${format}`
      triggerDownload(bytes, filename, MIME[format])
      return { canceled: false, path: filename }
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
  // No app-managed spellchecker on web — the device's native checker decides (MP5).
  return {
    api: makeApiFromService(service),
    storagePersisted,
    capabilities: { managedSpellcheck: false }
  } // no `lifecycle` on web
}
