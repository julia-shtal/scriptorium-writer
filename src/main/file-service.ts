/**
 * FileService — the single home of all disk I/O and the reliability backbone
 * (CLAUDE.md, SPEC §4, §5). The renderer never touches `fs`; every persistence
 * operation flows through here over IPC.
 *
 * Guarantees:
 *  - All data writes are atomic (tmp + fsync + rename) via {@link atomicWriteFile}.
 *  - Outgoing docs are validated; good canon is never overwritten with bad.
 *  - Every successful chapter save writes a version snapshot, pruned to a cap.
 *  - Corrupt/missing canon is surfaced for recovery, never silently blanked.
 *  - Deletes are soft (moved to `.trash/`), never destructive.
 *
 * The service is deliberately free of any Electron import so it can be unit-tested
 * against real temp directories. The main process supplies `userDataPath` and the
 * default library path at construction time.
 */

import * as fsp from 'node:fs/promises'
import { basename, join } from 'node:path'
import type {
  Chapter,
  ChapterRecovery,
  ChapterWrite,
  NewStoryInput,
  Notes,
  ProseMirrorJSON,
  SaveResult,
  Settings,
  Story,
  StoryMeta,
  StorySummary,
  VersionSummary
} from '@shared/types'
import {
  CHAPTER_SCHEMA_VERSION,
  NOTES_SCHEMA_VERSION,
  SETTINGS_SCHEMA_VERSION,
  STORY_SCHEMA_VERSION
} from '@shared/schema'
import { AppError } from '@shared/errors'
import { atomicWriteFile } from './atomic-write'
import { serializeChapterToMarkdown } from './markdown'
import { countWords } from '@shared/word-count'
import {
  chapterFileStem,
  isoSafeTimestamp,
  layout,
  makeChapterId,
  makeUniqueStoryId
} from './paths'

export interface FileServiceOptions {
  /** Where per-machine settings live (`app.getPath('userData')` in production). */
  userDataPath: string
  /** Default library root when settings carry no override (documents/Scriptorium-Writer). */
  defaultLibraryPath: string
}

const nowIso = (): string => new Date().toISOString()

const clonePmDoc = (doc: ProseMirrorJSON): ProseMirrorJSON =>
  JSON.parse(JSON.stringify(doc)) as ProseMirrorJSON

export class FileService {
  private readonly userDataPath: string
  private readonly defaultLibraryPath: string
  private readonly settingsPath: string
  private settingsCache: Settings | null = null
  /** Guarantees strictly-increasing, unique, lexically-sortable snapshot names. */
  private lastSnapshotMs = 0

  constructor(options: FileServiceOptions) {
    this.userDataPath = options.userDataPath
    this.defaultLibraryPath = options.defaultLibraryPath
    this.settingsPath = join(this.userDataPath, 'settings.json')
  }

  // ── Settings ──────────────────────────────────────────────────────────────

  private defaultSettings(): Settings {
    return {
      theme: 'book',
      autosaveIntervalMs: 120_000,
      autosaveDebounceMs: 2_000,
      spellLanguages: ['ru', 'en-US'],
      editorFontFamily: 'PT Serif',
      editorFontSizePx: 17,
      maxVersionsPerChapter: 20,
      libraryPath: this.defaultLibraryPath,
      schemaVersion: SETTINGS_SCHEMA_VERSION
    }
  }

  async readSettings(): Promise<Settings> {
    if (this.settingsCache) return this.settingsCache
    try {
      const raw = await fsp.readFile(this.settingsPath, 'utf8')
      const parsed = JSON.parse(raw) as Partial<Settings>
      // Merge over defaults so a settings file from an older schema still boots.
      this.settingsCache = { ...this.defaultSettings(), ...parsed }
    } catch (err) {
      if (isNotFound(err)) {
        this.settingsCache = this.defaultSettings()
        await this.writeSettingsFile(this.settingsCache)
      } else {
        // Corrupt settings are non-precious: fall back to defaults in memory, but do
        // NOT overwrite the file (it may be recoverable by hand).
        this.settingsCache = this.defaultSettings()
      }
    }
    return this.settingsCache
  }

  async saveSettings(settings: Settings): Promise<void> {
    const next: Settings = { ...settings, schemaVersion: SETTINGS_SCHEMA_VERSION }
    await this.writeSettingsFile(next)
    this.settingsCache = next
  }

  private async writeSettingsFile(settings: Settings): Promise<void> {
    await atomicWriteFile(this.settingsPath, pretty(settings))
  }

  private async getLibraryRoot(): Promise<string> {
    const settings = await this.readSettings()
    return settings.libraryPath || this.defaultLibraryPath
  }

  /** Create the top-level library folders. Called once at app init. */
  async ensureLibrary(): Promise<void> {
    const root = await this.getLibraryRoot()
    await fsp.mkdir(layout.storiesDir(root), { recursive: true })
    await fsp.mkdir(layout.trashDir(root), { recursive: true })
  }

  // ── Library / stories ───────────────────────────────────────────────────────

  async listStories(): Promise<StorySummary[]> {
    const root = await this.getLibraryRoot()
    const ids = await this.listStoryIds(root)
    const summaries: StorySummary[] = []
    for (const id of ids) {
      let story: Story
      try {
        story = await this.readStoryAt(root, id)
      } catch {
        continue // skip unreadable story dirs rather than failing the whole list
      }
      let wordCount = 0
      for (const chapterId of story.chapterOrder) {
        const chapter = await this.tryReadChapter(root, id, chapterId)
        if (chapter) wordCount += chapter.wordCount
      }
      summaries.push({
        id: story.id,
        title: story.title,
        status: story.status,
        chapterCount: story.chapterOrder.length,
        wordCount,
        updatedAt: story.updatedAt
      })
    }
    return summaries
  }

  async createStory(input: NewStoryInput): Promise<Story> {
    const root = await this.getLibraryRoot()
    const existing = await this.listStoryIds(root)
    const id = makeUniqueStoryId(input.title, existing)
    const timestamp = nowIso()
    const story: Story = {
      id,
      title: input.title,
      description: input.description ?? '',
      tags: input.tags ?? [],
      status: input.status ?? 'draft',
      createdAt: timestamp,
      updatedAt: timestamp,
      chapterOrder: [],
      schemaVersion: STORY_SCHEMA_VERSION
    }
    // Materialize the story's folders up front.
    await fsp.mkdir(layout.chaptersDir(root, id), { recursive: true })
    await fsp.mkdir(layout.versionsDir(root, id), { recursive: true })
    await fsp.mkdir(layout.notesDir(root, id), { recursive: true })
    await this.writeStory(root, story)
    return story
  }

  async readStory(id: string): Promise<Story> {
    const root = await this.getLibraryRoot()
    return this.readStoryAt(root, id)
  }

  async updateStoryMeta(id: string, meta: Partial<StoryMeta>): Promise<Story> {
    const root = await this.getLibraryRoot()
    const story = await this.readStoryAt(root, id)
    // Only mutable metadata fields; id/timestamps/order are managed here.
    const next: Story = {
      ...story,
      title: meta.title ?? story.title,
      description: meta.description ?? story.description,
      tags: meta.tags ?? story.tags,
      status: meta.status ?? story.status,
      updatedAt: nowIso()
    }
    await this.writeStory(root, next)
    return next
  }

  async deleteStory(id: string): Promise<void> {
    const root = await this.getLibraryRoot()
    const from = layout.storyDir(root, id)
    await assertExists(from, () => new AppError('NOT_FOUND', `story "${id}" not found`))
    const dest = join(layout.trashDir(root), `${id}-${isoSafeTimestamp(new Date())}`)
    await fsp.mkdir(layout.trashDir(root), { recursive: true })
    await fsp.rename(from, dest)
  }

  async reorderChapters(id: string, chapterIds: string[]): Promise<void> {
    const root = await this.getLibraryRoot()
    const story = await this.readStoryAt(root, id)

    const current = story.chapterOrder
    const sameSet =
      chapterIds.length === current.length &&
      new Set(chapterIds).size === chapterIds.length &&
      chapterIds.every((c) => current.includes(c))
    if (!sameSet) {
      throw new AppError('INVALID_INPUT', 'reorder list must be a permutation of chapterOrder')
    }

    await this.renumberChapterFiles(layout.chaptersDir(root, id), chapterIds)
    await this.writeStory(root, { ...story, chapterOrder: [...chapterIds], updatedAt: nowIso() })
  }

  /**
   * Rename chapter files (and their `.md` siblings) to contiguous `NN-slug` names
   * matching `orderedIds`. Two-phase (unique temp name, then final name) so a reorder
   * that swaps ordinals — or a delete that shifts everything down — never transiently
   * collides. Files whose canon is missing/corrupt are left in place; chapters resolve
   * by stable id regardless of filename. Called after both reorder and delete so the
   * `NN-` prefixes always mirror the live chapter order and never leave a gap a later
   * create could reuse (which, with a matching slug, would overwrite good data).
   */
  private async renumberChapterFiles(chaptersDir: string, orderedIds: string[]): Promise<void> {
    const located = await this.listChapterFiles(chaptersDir)
    const byId = new Map(located.map((c) => [c.chapter.id, c]))
    const staged: {
      tempPath: string
      finalName: string
      mdTempPath?: string
      mdFinalName?: string
    }[] = []
    for (let i = 0; i < orderedIds.length; i++) {
      const entry = byId.get(orderedIds[i])
      if (!entry) continue // corrupt/missing file; leave it, resolve-by-id still holds
      const stem = chapterFileStem(i + 1, entry.chapter.title)
      const tempPath = join(chaptersDir, `.reorder-${i}-${Date.now()}.tmp`)
      await fsp.rename(entry.path, tempPath)

      const item: {
        tempPath: string
        finalName: string
        mdTempPath?: string
        mdFinalName?: string
      } = { tempPath, finalName: `${stem}.json` }

      const mdSource = entry.path.replace(/\.json$/, '.md')
      if (await exists(mdSource)) {
        const mdTempPath = join(chaptersDir, `.reorder-md-${i}-${Date.now()}.tmp`)
        await fsp.rename(mdSource, mdTempPath)
        item.mdTempPath = mdTempPath
        item.mdFinalName = `${stem}.md`
      }
      staged.push(item)
    }
    for (const s of staged) {
      await fsp.rename(s.tempPath, join(chaptersDir, s.finalName))
      if (s.mdTempPath && s.mdFinalName) {
        await fsp.rename(s.mdTempPath, join(chaptersDir, s.mdFinalName))
      }
    }
  }

  /**
   * A chapter file path guaranteed not to collide with an existing file. Normally
   * returns `NN-slug.json`; if that already exists (a library left in the pre-fix
   * duplicate-ordinal state), it appends `-2`, `-3`, … so a create can never clobber
   * another chapter's canon.
   */
  private async freeChapterPath(dir: string, ordinal: number, title: string): Promise<string> {
    const stem = chapterFileStem(ordinal, title)
    let candidate = join(dir, `${stem}.json`)
    for (let n = 2; await exists(candidate); n++) {
      candidate = join(dir, `${stem}-${n}.json`)
    }
    return candidate
  }

  // ── Chapters ────────────────────────────────────────────────────────────────

  async createChapter(storyId: string, title: string): Promise<Chapter> {
    const root = await this.getLibraryRoot()
    const story = await this.readStoryAt(root, storyId)
    const id = makeChapterId(title, story.chapterOrder)
    const timestamp = nowIso()
    const chapter: Chapter = {
      id,
      title,
      doc: emptyDoc(),
      wordCount: 0,
      createdAt: timestamp,
      updatedAt: timestamp,
      schemaVersion: CHAPTER_SCHEMA_VERSION
    }
    const ordinal = story.chapterOrder.length + 1
    // Never overwrite an existing file: renumbering keeps ordinals contiguous, but a
    // library already carrying duplicate `NN-slug` names (from before that fix) could
    // still collide — pick a free name rather than clobber good data.
    const target = await this.freeChapterPath(layout.chaptersDir(root, storyId), ordinal, title)
    await atomicWriteFile(target, pretty(chapter))
    await this.writeStory(root, {
      ...story,
      chapterOrder: [...story.chapterOrder, id],
      updatedAt: timestamp
    })
    return chapter
  }

  async readChapter(storyId: string, chapterId: string): Promise<Chapter> {
    const root = await this.getLibraryRoot()
    const story = await this.readStoryAt(root, storyId)
    const path = await this.resolveChapterPath(root, storyId, story, chapterId)
    if (!path) throw new AppError('NOT_FOUND', `chapter "${chapterId}" not found`)
    return this.readChapterFile(path)
  }

  async saveChapter(storyId: string, incoming: ChapterWrite): Promise<SaveResult> {
    const root = await this.getLibraryRoot()
    const story = await this.readStoryAt(root, storyId)
    if (!story.chapterOrder.includes(incoming.id)) {
      throw new AppError('NOT_FOUND', `chapter "${incoming.id}" not in story "${storyId}"`)
    }
    validateDoc(incoming.doc)

    // Preserve createdAt from existing canon when we can; recover gracefully if the
    // canon is missing (e.g. restoring into a gap) by starting a fresh createdAt.
    const existingPath = await this.resolveChapterPath(root, storyId, story, incoming.id)
    let createdAt = nowIso()
    if (existingPath) {
      const prior = await this.tryReadChapterFile(existingPath)
      if (prior) createdAt = prior.createdAt
    }

    const stamp = this.nextSnapshotDate()
    const savedAt = stamp.toISOString()
    const chapter: Chapter = {
      id: incoming.id,
      title: incoming.title,
      doc: clonePmDoc(incoming.doc),
      wordCount: countWords(incoming.doc),
      createdAt,
      updatedAt: savedAt,
      schemaVersion: CHAPTER_SCHEMA_VERSION
    }

    const ordinal = story.chapterOrder.indexOf(incoming.id) + 1
    const target =
      existingPath ??
      join(layout.chaptersDir(root, storyId), `${chapterFileStem(ordinal, incoming.title)}.json`)
    await atomicWriteFile(target, pretty(chapter))

    // M7: write the human-readable Markdown backup alongside the canon. Best-effort —
    // a failure here must never fail the save or corrupt the .json canon (SPEC §5, §8).
    let mdWarning: string | undefined
    try {
      const mdTarget = target.replace(/\.json$/, '.md')
      await atomicWriteFile(mdTarget, serializeChapterToMarkdown(chapter.title, chapter.doc))
    } catch (err) {
      mdWarning = `Markdown backup failed: ${err instanceof Error ? err.message : String(err)}`
      console.error(`[saveChapter] ${mdWarning}`, err)
    }

    const versionId = await this.writeSnapshot(root, storyId, chapter, stamp)
    await this.pruneVersions(root, storyId, incoming.id)

    return {
      savedAt,
      wordCount: chapter.wordCount,
      versionId,
      ...(mdWarning ? { mdWarning } : {})
    }
  }

  async deleteChapter(storyId: string, chapterId: string): Promise<void> {
    const root = await this.getLibraryRoot()
    const story = await this.readStoryAt(root, storyId)
    if (!story.chapterOrder.includes(chapterId)) {
      throw new AppError('NOT_FOUND', `chapter "${chapterId}" not found`)
    }
    const trashRoot = join(
      layout.trashDir(root),
      `${storyId}--${chapterId}--${isoSafeTimestamp(new Date())}`
    )
    // Soft-delete the canon file and the chapter's version history together.
    const path = await this.resolveChapterPath(root, storyId, story, chapterId)
    if (path) {
      await fsp.mkdir(join(trashRoot, 'chapters'), { recursive: true })
      await fsp.rename(path, join(trashRoot, 'chapters', basename(path)))
      // M7: the Markdown backup follows its canon into the trash so no orphan lingers.
      const mdPath = path.replace(/\.json$/, '.md')
      if (await exists(mdPath)) {
        await fsp.rename(mdPath, join(trashRoot, 'chapters', basename(mdPath)))
      }
    }
    const versionsDir = layout.chapterVersionsDir(root, storyId, chapterId)
    if (await exists(versionsDir)) {
      await fsp.mkdir(trashRoot, { recursive: true })
      await fsp.rename(versionsDir, join(trashRoot, 'versions'))
    }
    // Renumber the survivors so their `NN-` prefixes stay contiguous — otherwise the
    // deleted ordinal becomes a gap the next create would reuse, colliding with (and
    // overwriting) a same-slug chapter that kept its old, higher number.
    const remaining = story.chapterOrder.filter((c) => c !== chapterId)
    await this.renumberChapterFiles(layout.chaptersDir(root, storyId), remaining)
    await this.writeStory(root, { ...story, chapterOrder: remaining, updatedAt: nowIso() })
  }

  // ── Versions ──────────────────────────────────────────────────────────────

  async listVersions(storyId: string, chapterId: string): Promise<VersionSummary[]> {
    const root = await this.getLibraryRoot()
    const dir = layout.chapterVersionsDir(root, storyId, chapterId)
    let names: string[]
    try {
      names = (await fsp.readdir(dir)).filter((n) => n.endsWith('.json'))
    } catch (err) {
      if (isNotFound(err)) return []
      throw err
    }
    const summaries: VersionSummary[] = []
    for (const name of names) {
      const snapshot = await this.tryReadChapterFile(join(dir, name))
      if (!snapshot) continue
      summaries.push({
        versionId: name.replace(/\.json$/, ''),
        savedAt: snapshot.updatedAt,
        wordCount: snapshot.wordCount
      })
    }
    // Newest first (version ids sort lexically in chronological order).
    summaries.sort((a, b) => (a.versionId < b.versionId ? 1 : a.versionId > b.versionId ? -1 : 0))
    return summaries
  }

  async readVersion(storyId: string, chapterId: string, versionId: string): Promise<Chapter> {
    const root = await this.getLibraryRoot()
    const path = join(layout.chapterVersionsDir(root, storyId, chapterId), `${versionId}.json`)
    if (!(await exists(path))) {
      throw new AppError('NOT_FOUND', `version "${versionId}" not found`)
    }
    return this.readChapterFile(path)
  }

  async restoreVersion(storyId: string, chapterId: string, versionId: string): Promise<Chapter> {
    const root = await this.getLibraryRoot()
    const story = await this.readStoryAt(root, storyId)
    const snapshot = await this.readVersion(storyId, chapterId, versionId)

    // Snapshot the current canon first (if it is readable) so a restore is itself
    // reversible, then write the restored doc as the new canon via the shared path.
    const currentPath = await this.resolveChapterPath(root, storyId, story, chapterId)
    if (currentPath) {
      const current = await this.tryReadChapterFile(currentPath)
      if (current) await this.writeSnapshot(root, storyId, current, this.nextSnapshotDate())
    }

    await this.saveChapter(storyId, {
      id: snapshot.id,
      title: snapshot.title,
      doc: snapshot.doc
    })
    return this.readChapter(storyId, chapterId)
  }

  // ── Notes ──────────────────────────────────────────────────────────────────

  async readNotes(storyId: string): Promise<Notes> {
    const root = await this.getLibraryRoot()
    await this.readStoryAt(root, storyId) // ensures the story exists
    const path = layout.notesFile(root, storyId)
    try {
      const raw = await fsp.readFile(path, 'utf8')
      return { ...emptyNotes(), ...(JSON.parse(raw) as Partial<Notes>) }
    } catch (err) {
      if (isNotFound(err)) {
        const notes = emptyNotes()
        await atomicWriteFile(path, pretty(notes))
        return notes
      }
      throw new AppError('READ_FAILED', `failed to read notes for "${storyId}"`, { cause: err })
    }
  }

  async saveNotes(storyId: string, notes: Notes): Promise<void> {
    const root = await this.getLibraryRoot()
    await this.readStoryAt(root, storyId)
    const next: Notes = { ...notes, schemaVersion: NOTES_SCHEMA_VERSION }
    await atomicWriteFile(layout.notesFile(root, storyId), pretty(next))
  }

  // ── Startup scan / recovery ─────────────────────────────────────────────────

  async scanLibrary(): Promise<ChapterRecovery[]> {
    const root = await this.getLibraryRoot()
    const out: ChapterRecovery[] = []
    let storyIds: string[]
    try {
      storyIds = await this.listStoryIds(root)
    } catch {
      return out
    }
    for (const storyId of storyIds) {
      let story: Story
      try {
        story = await this.readStoryAt(root, storyId)
      } catch {
        continue
      }
      for (const chapterId of story.chapterOrder) {
        const path = await this.resolveChapterPath(root, storyId, story, chapterId)
        let reason: 'missing' | 'corrupt' | null = null
        let title: string | undefined
        if (!path) {
          reason = 'missing'
        } else {
          const chapter = await this.tryReadChapterFile(path)
          if (!chapter) reason = 'corrupt'
          else title = chapter.title
        }
        if (reason) {
          out.push({
            storyId,
            chapterId,
            chapterTitle: title,
            reason,
            newestVersionId: await this.newestVersionId(root, storyId, chapterId)
          })
        }
      }
    }
    return out
  }

  // ── Internal helpers ────────────────────────────────────────────────────────

  private async listStoryIds(root: string): Promise<string[]> {
    try {
      const entries = await fsp.readdir(layout.storiesDir(root), { withFileTypes: true })
      return entries.filter((e) => e.isDirectory()).map((e) => e.name)
    } catch (err) {
      if (isNotFound(err)) return []
      throw err
    }
  }

  private async readStoryAt(root: string, id: string): Promise<Story> {
    const path = layout.storyMeta(root, id)
    let raw: string
    try {
      raw = await fsp.readFile(path, 'utf8')
    } catch (err) {
      if (isNotFound(err)) throw new AppError('NOT_FOUND', `story "${id}" not found`)
      throw new AppError('READ_FAILED', `failed to read story "${id}"`, { cause: err })
    }
    try {
      return JSON.parse(raw) as Story
    } catch (err) {
      throw new AppError('READ_FAILED', `story "${id}" metadata is corrupt`, { cause: err })
    }
  }

  private async writeStory(root: string, story: Story): Promise<void> {
    await atomicWriteFile(layout.storyMeta(root, story.id), pretty(story))
  }

  /**
   * Locate a chapter's canon file. Authoritative path: scan files and match the
   * stable `id` inside each. Fallback (used when a file is corrupt and therefore
   * can't be parsed for its id): match the ordinal `NN-` prefix from `chapterOrder`,
   * so recovery can still find a broken canon.
   */
  private async resolveChapterPath(
    root: string,
    storyId: string,
    story: Story,
    chapterId: string
  ): Promise<string | null> {
    const ordinal = story.chapterOrder.indexOf(chapterId)
    if (ordinal === -1) return null
    const dir = layout.chaptersDir(root, storyId)
    let names: string[]
    try {
      names = (await fsp.readdir(dir)).filter((n) => n.endsWith('.json'))
    } catch (err) {
      if (isNotFound(err)) return null
      throw err
    }
    // Authoritative: match by id.
    for (const name of names) {
      const chapter = await this.tryReadChapterFile(join(dir, name))
      if (chapter?.id === chapterId) return join(dir, name)
    }
    // Fallback: match by ordinal prefix (handles a corrupt/unparseable canon).
    const prefix = new RegExp(`^0*${ordinal + 1}-`)
    const match = names.find((n) => prefix.test(n))
    return match ? join(dir, match) : null
  }

  private async listChapterFiles(
    dir: string
  ): Promise<{ path: string; chapter: Chapter }[]> {
    let names: string[]
    try {
      names = (await fsp.readdir(dir)).filter((n) => n.endsWith('.json'))
    } catch (err) {
      if (isNotFound(err)) return []
      throw err
    }
    const out: { path: string; chapter: Chapter }[] = []
    for (const name of names) {
      const path = join(dir, name)
      const chapter = await this.tryReadChapterFile(path)
      if (chapter) out.push({ path, chapter })
    }
    return out
  }

  private async readChapterFile(path: string): Promise<Chapter> {
    let raw: string
    try {
      raw = await fsp.readFile(path, 'utf8')
    } catch (err) {
      throw new AppError('READ_FAILED', `failed to read chapter at ${path}`, { cause: err })
    }
    try {
      return JSON.parse(raw) as Chapter
    } catch (err) {
      // Never blank a corrupt canon — surface a typed error so the caller can offer
      // recovery from a snapshot (SPEC §5.3).
      throw new AppError('CHAPTER_CORRUPT', `chapter canon at ${path} failed to parse`, {
        cause: err
      })
    }
  }

  private async tryReadChapterFile(path: string): Promise<Chapter | null> {
    try {
      return await this.readChapterFile(path)
    } catch {
      return null
    }
  }

  private async tryReadChapter(
    root: string,
    storyId: string,
    chapterId: string
  ): Promise<Chapter | null> {
    const story = await this.readStoryAt(root, storyId).catch(() => null)
    if (!story) return null
    const path = await this.resolveChapterPath(root, storyId, story, chapterId)
    return path ? this.tryReadChapterFile(path) : null
  }

  private async writeSnapshot(
    root: string,
    storyId: string,
    chapter: Chapter,
    stamp: Date
  ): Promise<string> {
    const versionId = isoSafeTimestamp(stamp)
    const dir = layout.chapterVersionsDir(root, storyId, chapter.id)
    await atomicWriteFile(join(dir, `${versionId}.json`), pretty(chapter))
    return versionId
  }

  private async pruneVersions(root: string, storyId: string, chapterId: string): Promise<void> {
    const { maxVersionsPerChapter } = await this.readSettings()
    const dir = layout.chapterVersionsDir(root, storyId, chapterId)
    let names: string[]
    try {
      names = (await fsp.readdir(dir)).filter((n) => n.endsWith('.json'))
    } catch (err) {
      if (isNotFound(err)) return
      throw err
    }
    if (names.length <= maxVersionsPerChapter) return
    names.sort() // ascending = oldest first
    const toDelete = names.slice(0, names.length - maxVersionsPerChapter)
    await Promise.all(toDelete.map((n) => fsp.rm(join(dir, n), { force: true })))
  }

  private async newestVersionId(
    root: string,
    storyId: string,
    chapterId: string
  ): Promise<string | null> {
    const dir = layout.chapterVersionsDir(root, storyId, chapterId)
    try {
      const names = (await fsp.readdir(dir)).filter((n) => n.endsWith('.json')).sort()
      const newest = names[names.length - 1]
      return newest ? newest.replace(/\.json$/, '') : null
    } catch (err) {
      if (isNotFound(err)) return null
      throw err
    }
  }

  private nextSnapshotDate(): Date {
    let ms = Date.now()
    if (ms <= this.lastSnapshotMs) ms = this.lastSnapshotMs + 1
    this.lastSnapshotMs = ms
    return new Date(ms)
  }
}

// ── Module-level helpers ──────────────────────────────────────────────────────

function emptyDoc(): ProseMirrorJSON {
  return { type: 'doc', content: [{ type: 'paragraph' }] }
}

function emptyNotes(): Notes {
  return {
    characters: [],
    locations: [],
    world: [],
    timeline: [],
    scratch: '',
    schemaVersion: NOTES_SCHEMA_VERSION
  }
}

/** Validate an outgoing ProseMirror doc: a good canon is never overwritten with bad. */
function validateDoc(doc: unknown): asserts doc is ProseMirrorJSON {
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) {
    throw new AppError('INVALID_DOC', 'document must be a ProseMirror object')
  }
  if ((doc as Record<string, unknown>).type !== 'doc') {
    throw new AppError('INVALID_DOC', 'document root must be a "doc" node')
  }
}

const pretty = (value: unknown): string => JSON.stringify(value, null, 2)

const isNotFound = (err: unknown): boolean =>
  typeof err === 'object' && err !== null && (err as { code?: string }).code === 'ENOENT'

const exists = async (path: string): Promise<boolean> => {
  try {
    await fsp.stat(path)
    return true
  } catch {
    return false
  }
}

const assertExists = async (path: string, makeError: () => AppError): Promise<void> => {
  if (!(await exists(path))) throw makeError()
}
