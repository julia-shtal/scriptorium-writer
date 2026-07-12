/**
 * IPC registration — the bridge between the renderer's `window.api` and the
 * main-process {@link FileService}. Every method of the shared `Api` surface maps
 * 1:1 to an `ipcMain.handle` channel of the same name.
 *
 * Handlers never leak raw Node errors across the boundary: any thrown value is
 * normalized and encoded ({@link encodeErrorForIpc}) so Electron can serialize it
 * and the preload can decode it back into a typed {@link AppError}.
 *
 * Electron's `ipcMain` and `shell` are injected so this module stays unit-testable
 * without spinning up an Electron runtime.
 */

import type { Api } from '@shared/types'
import { encodeErrorForIpc, toAppError } from '@shared/errors'
import type { FileService } from './file-service'

/** Minimal shape of `ipcMain` we depend on. */
export interface IpcRegistrar {
  handle(channel: string, listener: (event: unknown, ...args: unknown[]) => unknown): void
}

export interface IpcServices {
  fileService: FileService
  /** Reveal a folder in the OS file explorer (wraps `shell.openPath` in main). */
  revealInFolder(path: string): Promise<void>
  /** Re-apply spellcheck languages to the live session (wraps `session.setSpellCheckerLanguages`). M6. */
  setSpellLanguages(langs: string[]): void
}

/** All channels, kept in lockstep with the `Api` surface (compile-checked below). */
export const IPC_CHANNELS = [
  'ping',
  'listStories',
  'createStory',
  'deleteStory',
  'readStory',
  'updateStoryMeta',
  'reorderChapters',
  'createChapter',
  'readChapter',
  'saveChapter',
  'deleteChapter',
  'listVersions',
  'readVersion',
  'restoreVersion',
  'readNotes',
  'saveNotes',
  'readSettings',
  'saveSettings',
  'applySpellLanguages',
  'scanLibrary',
  'revealInFolder'
] as const

// Compile-time guarantee that IPC_CHANNELS covers exactly the Api surface.
type Channel = (typeof IPC_CHANNELS)[number]
type _AssertChannelsCoverApi = keyof Api extends Channel ? true : never
type _AssertApiCoversChannels = Channel extends keyof Api ? true : never
const _channelsCoverApi: _AssertChannelsCoverApi = true
const _apiCoversChannels: _AssertApiCoversChannels = true
void _channelsCoverApi
void _apiCoversChannels

export function registerIpcHandlers(registrar: IpcRegistrar, services: IpcServices): void {
  const { fileService: fs, revealInFolder, setSpellLanguages } = services

  // Each entry receives the raw IPC args and returns a promise/value. Arg types are
  // guaranteed by the preload wrappers, whose signatures come from `Api`; here we
  // accept `unknown[]` and hand them to the typed FileService methods.
  const handlers: Record<Channel, (args: unknown[]) => unknown> = {
    ping: () => 'pong',
    listStories: () => fs.listStories(),
    createStory: ([input]) => fs.createStory(input as Parameters<Api['createStory']>[0]),
    deleteStory: ([id]) => fs.deleteStory(id as string),
    readStory: ([id]) => fs.readStory(id as string),
    updateStoryMeta: ([id, meta]) =>
      fs.updateStoryMeta(id as string, meta as Parameters<Api['updateStoryMeta']>[1]),
    reorderChapters: ([id, ids]) => fs.reorderChapters(id as string, ids as string[]),
    createChapter: ([storyId, title]) => fs.createChapter(storyId as string, title as string),
    readChapter: ([storyId, chapterId]) =>
      fs.readChapter(storyId as string, chapterId as string),
    saveChapter: ([storyId, chapter]) =>
      fs.saveChapter(storyId as string, chapter as Parameters<Api['saveChapter']>[1]),
    deleteChapter: ([storyId, chapterId]) =>
      fs.deleteChapter(storyId as string, chapterId as string),
    listVersions: ([storyId, chapterId]) =>
      fs.listVersions(storyId as string, chapterId as string),
    readVersion: ([storyId, chapterId, versionId]) =>
      fs.readVersion(storyId as string, chapterId as string, versionId as string),
    restoreVersion: ([storyId, chapterId, versionId]) =>
      fs.restoreVersion(storyId as string, chapterId as string, versionId as string),
    readNotes: ([storyId]) => fs.readNotes(storyId as string),
    saveNotes: ([storyId, notes]) =>
      fs.saveNotes(storyId as string, notes as Parameters<Api['saveNotes']>[1]),
    readSettings: () => fs.readSettings(),
    saveSettings: ([settings]) => fs.saveSettings(settings as Parameters<Api['saveSettings']>[0]),
    applySpellLanguages: ([langs]) => setSpellLanguages(langs as string[]),
    scanLibrary: () => fs.scanLibrary(),
    revealInFolder: ([path]) => revealInFolder(path as string)
  }

  for (const channel of IPC_CHANNELS) {
    const handler = handlers[channel]
    registrar.handle(channel, async (_event, ...args) => {
      try {
        return await handler(args)
      } catch (err) {
        // Log the real error in main, hand a clean encoded one to the renderer.
        console.error(`[ipc:${channel}]`, toAppError(err))
        throw encodeErrorForIpc(err)
      }
    })
  }
}
