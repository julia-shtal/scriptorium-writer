/**
 * Shared domain contract between main, preload, and renderer.
 *
 * This is the single source of truth for every persisted object and every IPC
 * payload. Never duplicate or redefine a type here elsewhere — import from
 * `@shared/types`.
 *
 * M0 ships the type skeleton only (compile-only, no logic). Later milestones fill
 * in the `window.api` surface and the FileService that backs it.
 */

/** ISO-8601 timestamp, e.g. "2026-07-09T10:15:00.000Z". */
export type ISODate = string

/**
 * A TipTap / ProseMirror document node tree. Loosely typed for now; the editor
 * (M2) is the authority on its concrete shape. Kept as an opaque record so the
 * canon stays lossless without the data layer needing to understand it.
 */
export type ProseMirrorJSON = Record<string, unknown>

export type StoryStatus = 'draft' | 'in_progress' | 'done'

export interface StoryMeta {
  /** Stable slug-ish id, e.g. "franz-story". Never derived from the filename. */
  id: string
  title: string
  description: string
  tags: string[]
  status: StoryStatus
  createdAt: ISODate
  updatedAt: ISODate
}

export interface Story extends StoryMeta {
  /** Chapter ids in display order. */
  chapterOrder: string[]
  schemaVersion: number
}

/** Lightweight row for the library list view. */
export interface StorySummary {
  id: string
  title: string
  status: StoryStatus
  chapterCount: number
  wordCount: number
  updatedAt: ISODate
}

/** Input for creating a new story. */
export interface NewStoryInput {
  title: string
  description?: string
  tags?: string[]
  status?: StoryStatus
}

export interface Chapter {
  id: string
  title: string
  /** TipTap document — the canonical content (source of truth). */
  doc: ProseMirrorJSON
  wordCount: number
  createdAt: ISODate
  updatedAt: ISODate
  schemaVersion: number
}

/** What the renderer sends on save; main computes counts + dates itself. */
export type ChapterWrite = Pick<Chapter, 'id' | 'title' | 'doc'>

/** Returned by a successful save (M1). */
export interface SaveResult {
  savedAt: ISODate
  wordCount: number
  versionId: string
}

export interface VersionSummary {
  versionId: string
  savedAt: ISODate
  wordCount: number
}

export interface NoteEntry {
  id: string
  name: string
  body: string
}

/** Per-story codex; kept flexible. */
export interface Notes {
  characters: NoteEntry[]
  locations: NoteEntry[]
  world: NoteEntry[]
  timeline: NoteEntry[]
  /** Free-form parked text. */
  scratch: string
  schemaVersion: number
}

export interface Settings {
  theme: 'book'
  autosaveIntervalMs: number
  autosaveDebounceMs: number
  spellLanguages: string[]
  editorFontFamily: string
  editorFontSizePx: number
  maxVersionsPerChapter: number
  /** Where the library folder lives. */
  libraryPath: string
  schemaVersion: number
}

/**
 * The typed surface exposed on `window.api` via the preload contextBridge.
 *
 * M0 wires only `ping` end-to-end to prove the IPC + contextBridge path. The full
 * surface (library / story / chapters / versions / notes / settings) lands in M1.
 */
export interface Api {
  /** Round-trips through `ipcMain.handle('ping')`; returns `'pong'`. */
  ping(): Promise<'pong'>

  // TODO(M1): library — listStories, createStory, deleteStory
  // TODO(M1): story — readStory, updateStoryMeta, reorderChapters
  // TODO(M1): chapters — createChapter, readChapter, saveChapter, deleteChapter
  // TODO(M1): versions — listVersions, readVersion, restoreVersion
  // TODO(M1): notes — readNotes, saveNotes
  // TODO(M1): settings — readSettings, saveSettings
  // TODO(M1): misc — revealInFolder
}
