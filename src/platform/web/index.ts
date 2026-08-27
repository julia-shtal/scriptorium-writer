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
 * NOT web-only despite the name (MC2): `createPlatformFromFsPort` below is the SHARED
 * FileService wiring, imported by `src/platform/capacitor/index.ts` as well. Only
 * `createWebPlatform` and the module-private `requestPersistentStorage` are web-specific.
 * Change anything in the shared half — or in `makeApiFromService` — and you are changing
 * Android too, so check both composition roots rather than assuming this file is the PWA's.
 *
 * Browser code: this module must never import a `node:` built-in.
 */

import { zip } from 'fflate'
import type { Api, ImportFileResult, ExportFileResult, ExportLibraryResult } from '@shared/types'
import type { Platform } from '@renderer/platform'
import { AppError } from '@shared/errors'
import { FileService } from '@data/file-service'
import type { FsPort } from '@data/fs-port'
import { buildChapterExportBytes, buildStoryExportBytes } from '@data/export-format'
import { OpfsFsPort } from './opfs-fs-port'
import { pickImportFile } from './import-file'
import { triggerDownload, MIME } from './download'

/** Strip characters illegal in filenames; mirrors the desktop saveExport sanitizer.
 *  Exported (MC2) so the native export path derives export filenames the same way rather
 *  than growing a second sanitizer that could drift. */
export function safeName(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, '_').slice(0, 80)
}

/** Minimal shape of the File System Access API bits we use; typed locally so the
 *  web tsconfig needs no extra lib. */
interface SaveFilePickerWindow {
  showSaveFilePicker?: (opts: {
    suggestedName?: string
    types?: { description: string; accept: Record<string, string[]> }[]
  }) => Promise<{
    createWritable: () => Promise<{ write: (data: Uint8Array) => Promise<void>; close: () => Promise<void> }>
  }>
}

/**
 * Write `bytes` to a user-chosen location via showSaveFilePicker when available (MP9).
 * Returns 'saved', 'canceled' (user dismissed the picker), or 'unsupported' (no picker
 * — caller should fall back to a download). Any non-abort error propagates.
 */
async function trySavePicker(bytes: Uint8Array, filename: string): Promise<'saved' | 'canceled' | 'unsupported'> {
  const picker = (globalThis as unknown as SaveFilePickerWindow).showSaveFilePicker
  if (typeof picker !== 'function') return 'unsupported'
  try {
    const handle = await picker({
      suggestedName: filename,
      types: [{ description: 'Zip archive', accept: { 'application/zip': ['.zip'] } }]
    })
    const writable = await handle.createWritable()
    await writable.write(bytes)
    await writable.close()
    return 'saved'
  } catch (err) {
    // User cancelled the picker → not an error, just no backup this time. Shipping
    // engines reject with a DOMException named AbortError; the broader Error check is
    // belt-and-suspenders for any engine that throws a plain Error on cancel.
    if (err instanceof Error && err.name === 'AbortError') return 'canceled'
    throw err
  }
}

/**
 * Zip the whole library into an in-memory archive (MP6, shared with Capacitor in MC2).
 *
 * Extracted from `exportLibrary` below so the native export path
 * (`src/platform/capacitor/native-export.ts`) produces a byte-identical archive rather than
 * a second, drifting copy of the same fflate call. Entry paths are the library-relative
 * paths `readLibraryEntries` returns.
 *
 * NOTE the invariant this depends on: `readLibraryEntries` walks the library root
 * RECURSIVELY, so whatever folder the caller writes the resulting archive into must live
 * OUTSIDE that root (see `src/platform/capacitor/roots.ts` EXPORTS_FOLDER and the guard in
 * native-export.test.ts) — otherwise each archive swallows all previous ones.
 */
export async function zipLibrary(service: FileService): Promise<Uint8Array> {
  const entries = await service.readLibraryEntries()
  const tree: Record<string, Uint8Array> = {}
  for (const e of entries) tree[e.path] = e.data
  return new Promise<Uint8Array>((resolve, reject) => {
    // Async (non-blocking) zip; level 6 matches the desktop archiver setting.
    zip(tree, { level: 6 }, (err, data) => (err ? reject(err) : resolve(data)))
  })
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
      const bytes = await zipLibrary(service)
      const filename = `library-${new Date().toISOString().slice(0, 10)}.zip`
      const picked = await trySavePicker(bytes, filename)
      if (picked === 'canceled') return { canceled: true }
      if (picked === 'unsupported') {
        // Fallback: the MP6 download path (the one Chrome for Android runs).
        triggerDownload(bytes, filename, MIME.zip)
      }
      // 'saved' via the picker, or downloaded via the fallback: both are a completed
      // export. `path` is the suggested filename, not the real save location — the File
      // System Access API does not expose the folder the user chose.
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

/** Shared FileService wiring for every FsPort-backed platform (web + Capacitor). The
 *  '/userdata' and '/library' literals live here and nowhere else.
 *
 *  Returns the booted `service` alongside the `api` because the Capacitor composition root
 *  needs library-wide reads (`readLibraryEntries`, via {@link zipLibrary}) that the `Api`
 *  surface deliberately does not expose — `Api` is the renderer's contract, and a
 *  whole-library byte dump has no business on it. Callers that only need the renderer
 *  surface (e.g. `createWebPlatform`) simply destructure `api` and ignore this. */
export async function createPlatformFromFsPort(
  fs: FsPort,
  paths: { userDataPath: string; defaultLibraryPath: string }
): Promise<{ api: Api; service: FileService }> {
  const service = new FileService({ fs, ...paths })
  await service.ensureLibrary()
  return { api: makeApiFromService(service), service }
}

/**
 * Boot the web {@link Platform}: OPFS-backed filesystem → FileService → Api. No
 * `lifecycle` is provided — the browser has no host quit/update lifecycle to bridge.
 */
export async function createWebPlatform(): Promise<Platform> {
  const storagePersisted = await requestPersistentStorage()
  const { api } = await createPlatformFromFsPort(new OpfsFsPort(), {
    userDataPath: '/userdata',
    defaultLibraryPath: '/library'
  })
  // No app-managed spellchecker on web — the device's native checker decides (MP5).
  return {
    api,
    storagePersisted,
    // exportsToDeviceFolder: false — the browser (or showSaveFilePicker) chooses where an
    // export lands, so naming a fixed folder here would be false.
    capabilities: { managedSpellcheck: false, evictableStorage: true, exportsToDeviceFolder: false }
  } // no `lifecycle` on web
}
