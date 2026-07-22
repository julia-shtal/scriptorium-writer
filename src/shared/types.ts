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
  /**
   * Set when the sibling `.md` backup could not be written (M7). The `.json` canon
   * still saved successfully — this is a soft, non-fatal warning.
   */
  mdWarning?: string
}

export interface VersionSummary {
  versionId: string
  savedAt: ISODate
  wordCount: number
}

/**
 * Reported by the startup scan when a chapter's canon `.json` is missing or fails
 * to parse. Never a side effect — the corrupt/missing file is left untouched and the
 * renderer (M5) uses this to offer a one-click restore from `newestVersionId`.
 */
export interface ChapterRecovery {
  storyId: string
  chapterId: string
  /** Best-effort title (from a readable snapshot); may be absent if unrecoverable. */
  chapterTitle?: string
  reason: 'missing' | 'corrupt'
  /** Newest snapshot available to restore from, or `null` if none exists. */
  newestVersionId: string | null
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
  /** True once the first-run demo story has been seeded; prevents re-seeding a deliberately-emptied library. */
  demoSeeded?: boolean
  schemaVersion: number
}

/** Result of a library export (M13). `canceled` when the user dismissed the save dialog. */
export type ExportLibraryResult = { canceled: true } | { canceled: false; path: string }

/** Normalized payload returned by the import file-picker (M14). */
export type ImportFileResult =
  | { canceled: true }
  | { canceled: false; kind: 'md'; text: string }
  | { canceled: false; kind: 'docx'; html: string; warnings: string[] }

/** Result of a chapter/story .docx export (M14). `canceled` = user dismissed the save dialog. */
export type ExportDocxResult = { canceled: true } | { canceled: false; path: string }

/**
 * The typed surface exposed on `window.api` via the preload contextBridge. Every
 * method here is backed 1:1 by an `ipcMain.handle` registration delegating to the
 * main-process `FileService`. Signatures are the single source of truth for both
 * the preload wrappers and the IPC handlers.
 */
export interface Api {
  /** Round-trips through `ipcMain.handle('ping')`; returns `'pong'`. */
  ping(): Promise<'pong'>

  // library
  listStories(): Promise<StorySummary[]>
  createStory(input: NewStoryInput): Promise<Story>
  deleteStory(id: string): Promise<void> // soft delete → .trash

  // story
  readStory(id: string): Promise<Story>
  updateStoryMeta(id: string, meta: Partial<StoryMeta>): Promise<Story>
  reorderChapters(id: string, chapterIds: string[]): Promise<void>

  // chapters
  createChapter(storyId: string, title: string): Promise<Chapter>
  readChapter(storyId: string, chapterId: string): Promise<Chapter>
  saveChapter(storyId: string, chapter: ChapterWrite): Promise<SaveResult>
  deleteChapter(storyId: string, chapterId: string): Promise<void> // soft delete

  // versions
  listVersions(storyId: string, chapterId: string): Promise<VersionSummary[]>
  readVersion(storyId: string, chapterId: string, versionId: string): Promise<Chapter>
  restoreVersion(storyId: string, chapterId: string, versionId: string): Promise<Chapter>

  // notes
  readNotes(storyId: string): Promise<Notes>
  saveNotes(storyId: string, notes: Notes): Promise<void>

  // settings
  readSettings(): Promise<Settings>
  saveSettings(settings: Settings): Promise<void>
  /** Re-apply spellcheck languages to the live session (no restart). M6. */
  applySpellLanguages(langs: string[]): Promise<void>

  // recovery — startup scan for missing/corrupt canon (consumed by M5)
  scanLibrary(): Promise<ChapterRecovery[]>

  // misc
  revealInFolder(path: string): Promise<void> // open a folder in the OS file explorer
  /** Export the whole library to a user-chosen .zip (M13). Main shows the save dialog. */
  exportLibrary(): Promise<ExportLibraryResult>

  // import / export (M14)
  /** Show an open dialog (.md/.docx), read the file, return normalized content. */
  readImportFile(): Promise<ImportFileResult>
  /** Export one chapter to a user-chosen .docx (save dialog in main). */
  exportChapterDocx(storyId: string, chapterId: string): Promise<ExportDocxResult>
  /** Export the whole story to one .docx, one Heading-1 per chapter in chapterOrder. */
  exportStoryDocx(storyId: string): Promise<ExportDocxResult>
}

/**
 * Payload pushed to the renderer when `electron-updater` has finished downloading an
 * update and it is ready to install on next restart (M12). Kept minimal — the UI only
 * needs the version string for the "update ready" notice.
 */
export interface UpdateDownloadedInfo {
  version: string
}

/**
 * A separate main→renderer push bridge, exposed on `window.lifecycle`. Kept off the
 * invoke-only `Api` surface (which is compile-locked 1:1 to the IPC channels) because
 * this is an event subscription, not a request/response call.
 */
export interface LifecycleApi {
  /**
   * Register the renderer's final-flush handler. Main invokes it on `before-quit`;
   * when it resolves, the renderer acks so main can finish quitting.
   */
  onQuitFlush(handler: () => Promise<void> | void): void

  /**
   * Subscribe to "an update has been downloaded and is ready to install" pushes from
   * main (M12). The renderer shows a small dismissible notice offering restart-now.
   */
  onUpdateDownloaded(handler: (info: UpdateDownloadedInfo) => void): void

  /**
   * Ask main to flush the renderer and then install the downloaded update + restart.
   * Routed through the same quit-guard flush as a normal quit so unsaved edits are
   * never lost — main never calls `quitAndInstall()` without flushing first.
   */
  restartToUpdate(): void
}
