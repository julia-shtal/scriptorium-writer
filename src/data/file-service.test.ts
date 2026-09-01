import { describe, it, expect, afterEach } from 'vitest'
import { existsSync } from 'node:fs'
import * as fsp from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import AdmZip from 'adm-zip'
import { FileService } from './file-service'
import { NodeFsPort } from '../platform/node/fs-port'
import { layout } from './paths'
import { isAppError } from '@shared/errors'
import type { ProseMirrorJSON } from '@shared/types'
import { serializeChapterToMarkdown } from './markdown'

const dirsToClean: string[] = []

async function makeService(): Promise<{ svc: FileService; lib: string; userData: string }> {
  const userData = await fsp.mkdtemp(join(tmpdir(), 'scriptorium-writer-ud-'))
  const lib = await fsp.mkdtemp(join(tmpdir(), 'scriptorium-writer-lib-'))
  dirsToClean.push(userData, lib)
  const svc = new FileService({ fs: new NodeFsPort(), userDataPath: userData, defaultLibraryPath: lib })
  await svc.ensureLibrary()
  return { svc, lib, userData }
}

const docWith = (text: string): ProseMirrorJSON => ({
  type: 'doc',
  content: [{ type: 'paragraph', content: text ? [{ type: 'text', text }] : [] }]
})

const chapterFiles = async (lib: string, storyId: string): Promise<string[]> =>
  (await fsp.readdir(layout.chaptersDir(lib, storyId)))
    .filter((f) => f.endsWith('.json'))
    .sort()

afterEach(async () => {
  await Promise.all(dirsToClean.splice(0).map((d) => fsp.rm(d, { recursive: true, force: true })))
})

describe('stories', () => {
  it('creates and reads back a story', async () => {
    const { svc } = await makeService()
    const story = await svc.createStory({ title: 'Franz Story', description: 'a tale' })
    expect(story.id).toBe('franz-story')
    expect(story.chapterOrder).toEqual([])
    const read = await svc.readStory(story.id)
    expect(read.title).toBe('Franz Story')
    expect(read.schemaVersion).toBeGreaterThan(0)
  })

  it('lists stories with chapter and word counts', async () => {
    const { svc } = await makeService()
    const story = await svc.createStory({ title: 'A' })
    const ch = await svc.createChapter(story.id, 'One')
    await svc.saveChapter(story.id, { id: ch.id, title: 'One', doc: docWith('one two three') })
    const summaries = await svc.listStories()
    expect(summaries).toHaveLength(1)
    expect(summaries[0]).toMatchObject({ id: story.id, chapterCount: 1, wordCount: 3 })
  })

  it('updates story metadata', async () => {
    const { svc } = await makeService()
    const story = await svc.createStory({ title: 'A' })
    const updated = await svc.updateStoryMeta(story.id, { status: 'in_progress', tags: ['x'] })
    expect(updated.status).toBe('in_progress')
    expect(updated.tags).toEqual(['x'])
    expect((await svc.readStory(story.id)).status).toBe('in_progress')
  })

  it('soft-deletes a story to .trash rather than hard-deleting', async () => {
    const { svc, lib } = await makeService()
    const story = await svc.createStory({ title: 'Doomed' })
    await svc.deleteStory(story.id)
    expect(await svc.listStories()).toEqual([])
    const trashed = await fsp.readdir(layout.trashDir(lib))
    expect(trashed.some((name) => name.startsWith(story.id))).toBe(true)
  })
})

describe('chapters', () => {
  it('createChapter appends to chapterOrder; readChapter resolves by id', async () => {
    const { svc } = await makeService()
    const story = await svc.createStory({ title: 'A' })
    const ch = await svc.createChapter(story.id, 'Beginning')
    expect((await svc.readStory(story.id)).chapterOrder).toEqual([ch.id])
    const read = await svc.readChapter(story.id, ch.id)
    expect(read.title).toBe('Beginning')
    expect(read.wordCount).toBe(0)
  })

  it('saveChapter computes wordCount + updatedAt in main and reloads identically', async () => {
    const { svc } = await makeService()
    const story = await svc.createStory({ title: 'A' })
    const ch = await svc.createChapter(story.id, 'One')
    const result = await svc.saveChapter(story.id, {
      id: ch.id,
      title: 'One',
      doc: docWith('alpha beta gamma')
    })
    expect(result.wordCount).toBe(3)
    const read = await svc.readChapter(story.id, ch.id)
    expect(read.wordCount).toBe(3)
    expect(read.updatedAt).toBe(result.savedAt)
    expect(read.doc).toEqual(docWith('alpha beta gamma'))
  })

  it('refuses to overwrite good canon with an invalid doc', async () => {
    const { svc } = await makeService()
    const story = await svc.createStory({ title: 'A' })
    const ch = await svc.createChapter(story.id, 'One')
    await svc.saveChapter(story.id, { id: ch.id, title: 'One', doc: docWith('good text') })
    await expect(
      svc.saveChapter(story.id, { id: ch.id, title: 'One', doc: {} as ProseMirrorJSON })
    ).rejects.toSatisfy((e: unknown) => isAppError(e) && e.code === 'INVALID_DOC')
    // Good canon untouched.
    expect((await svc.readChapter(story.id, ch.id)).doc).toEqual(docWith('good text'))
  })

  it('soft-deletes a chapter and removes it from chapterOrder', async () => {
    const { svc, lib } = await makeService()
    const story = await svc.createStory({ title: 'A' })
    const ch = await svc.createChapter(story.id, 'Gone')
    await svc.deleteChapter(story.id, ch.id)
    expect((await svc.readStory(story.id)).chapterOrder).toEqual([])
    const trash = await fsp.readdir(layout.trashDir(lib))
    expect(trash.length).toBeGreaterThan(0)
  })
})

describe('reorderChapters', () => {
  it('renames files to new NN- ordinals but chapters still resolve by id', async () => {
    const { svc, lib } = await makeService()
    const story = await svc.createStory({ title: 'A' })
    const a = await svc.createChapter(story.id, 'Aaa')
    const b = await svc.createChapter(story.id, 'Bbb')
    const c = await svc.createChapter(story.id, 'Ccc')
    expect(await chapterFiles(lib, story.id)).toEqual(['01-aaa.json', '02-bbb.json', '03-ccc.json'])

    await svc.reorderChapters(story.id, [c.id, a.id, b.id])

    expect((await svc.readStory(story.id)).chapterOrder).toEqual([c.id, a.id, b.id])
    // Filenames now reflect the new ordinals...
    expect(await chapterFiles(lib, story.id)).toEqual(['01-ccc.json', '02-aaa.json', '03-bbb.json'])
    // ...but each id still resolves to the right chapter.
    expect((await svc.readChapter(story.id, c.id)).title).toBe('Ccc')
    expect((await svc.readChapter(story.id, a.id)).title).toBe('Aaa')
    expect((await svc.readChapter(story.id, b.id)).title).toBe('Bbb')
  })

  it('rejects a chapter list that is not a permutation of the current order', async () => {
    const { svc } = await makeService()
    const story = await svc.createStory({ title: 'A' })
    const a = await svc.createChapter(story.id, 'Aaa')
    await expect(svc.reorderChapters(story.id, [a.id, 'ghost'])).rejects.toSatisfy(
      (e: unknown) => isAppError(e) && e.code === 'INVALID_INPUT'
    )
  })
})

describe('versions', () => {
  it('snapshots on each save and lists them newest-first', async () => {
    const { svc } = await makeService()
    const story = await svc.createStory({ title: 'A' })
    const ch = await svc.createChapter(story.id, 'One')
    const r1 = await svc.saveChapter(story.id, { id: ch.id, title: 'One', doc: docWith('first') })
    const r2 = await svc.saveChapter(story.id, { id: ch.id, title: 'One', doc: docWith('second') })
    const versions = await svc.listVersions(story.id, ch.id)
    expect(versions.map((v) => v.versionId)).toEqual([r2.versionId, r1.versionId])
  })

  it('prunes to exactly maxVersionsPerChapter, keeping the newest', async () => {
    const { svc } = await makeService()
    const settings = await svc.readSettings()
    await svc.saveSettings({ ...settings, maxVersionsPerChapter: 3 })
    const story = await svc.createStory({ title: 'A' })
    const ch = await svc.createChapter(story.id, 'One')

    const ids: string[] = []
    for (let i = 0; i < 5; i++) {
      const r = await svc.saveChapter(story.id, {
        id: ch.id,
        title: 'One',
        doc: docWith(`revision ${i}`)
      })
      ids.push(r.versionId)
    }

    const versions = await svc.listVersions(story.id, ch.id)
    expect(versions).toHaveLength(3)
    // The three newest saves survive; the two oldest are pruned.
    expect(versions.map((v) => v.versionId)).toEqual([ids[4], ids[3], ids[2]])
  })

  it('restoreVersion snapshots current state, then writes the restored doc as canon', async () => {
    const { svc } = await makeService()
    const story = await svc.createStory({ title: 'A' })
    const ch = await svc.createChapter(story.id, 'One')
    const v1 = await svc.saveChapter(story.id, { id: ch.id, title: 'One', doc: docWith('version one') })
    await svc.saveChapter(story.id, { id: ch.id, title: 'One', doc: docWith('version two') })
    const countBefore = (await svc.listVersions(story.id, ch.id)).length

    const restored = await svc.restoreVersion(story.id, ch.id, v1.versionId)

    expect(restored.doc).toEqual(docWith('version one'))
    expect((await svc.readChapter(story.id, ch.id)).doc).toEqual(docWith('version one'))
    // Restoring first snapshots the current ("version two") state, so history grows.
    expect((await svc.listVersions(story.id, ch.id)).length).toBeGreaterThan(countBefore)
  })
})

describe('startup scan / recovery', () => {
  it('flags a corrupt canon with a snapshot and never blanks the file', async () => {
    const { svc, lib } = await makeService()
    const story = await svc.createStory({ title: 'A' })
    const ch = await svc.createChapter(story.id, 'One')
    await svc.saveChapter(story.id, { id: ch.id, title: 'One', doc: docWith('precious words') })

    const [file] = await chapterFiles(lib, story.id)
    const canonPath = join(layout.chaptersDir(lib, story.id), file)
    await fsp.writeFile(canonPath, 'not valid json {{{', 'utf8')

    const report = await svc.scanLibrary()
    expect(report).toHaveLength(1)
    expect(report[0]).toMatchObject({ storyId: story.id, chapterId: ch.id, reason: 'corrupt' })
    expect(report[0].newestVersionId).not.toBeNull()

    // The scan must not have repaired/blanked the corrupt file.
    expect(await fsp.readFile(canonPath, 'utf8')).toBe('not valid json {{{')
    // Reading a corrupt chapter surfaces a typed error, not empty content.
    await expect(svc.readChapter(story.id, ch.id)).rejects.toSatisfy(
      (e: unknown) => isAppError(e) && e.code === 'CHAPTER_CORRUPT'
    )
  })

  it('flags a missing canon as reason "missing"', async () => {
    const { svc, lib } = await makeService()
    const story = await svc.createStory({ title: 'A' })
    const ch = await svc.createChapter(story.id, 'One')
    await svc.saveChapter(story.id, { id: ch.id, title: 'One', doc: docWith('words') })

    const [file] = await chapterFiles(lib, story.id)
    await fsp.rm(join(layout.chaptersDir(lib, story.id), file))

    const report = await svc.scanLibrary()
    expect(report).toHaveLength(1)
    expect(report[0]).toMatchObject({ chapterId: ch.id, reason: 'missing' })
  })

  it('reports nothing for a healthy library', async () => {
    const { svc } = await makeService()
    const story = await svc.createStory({ title: 'A' })
    const ch = await svc.createChapter(story.id, 'One')
    await svc.saveChapter(story.id, { id: ch.id, title: 'One', doc: docWith('fine') })
    expect(await svc.scanLibrary()).toEqual([])
  })
})

describe('notes', () => {
  it('creates a default empty notes file on demand and round-trips saves', async () => {
    const { svc } = await makeService()
    const story = await svc.createStory({ title: 'A' })
    const notes = await svc.readNotes(story.id)
    expect(notes.characters).toEqual([])
    expect(notes.scratch).toBe('')

    notes.scratch = 'idea'
    notes.characters.push({ id: 'c1', name: 'Franz', body: 'protagonist' })
    await svc.saveNotes(story.id, notes)
    const reread = await svc.readNotes(story.id)
    expect(reread.scratch).toBe('idea')
    expect(reread.characters[0].name).toBe('Franz')
  })
})

describe('markdown backup (M7)', () => {
  it('writes a sibling .md next to the .json canon on save', async () => {
    const { svc, lib } = await makeService()
    const story = await svc.createStory({ title: 'MD Story' })
    const ch = await svc.createChapter(story.id, 'Chapter One')
    await svc.saveChapter(story.id, {
      id: ch.id,
      title: 'Chapter One',
      doc: docWith('hello world')
    })

    const dir = layout.chaptersDir(lib, story.id)
    const names = await fsp.readdir(dir)
    const json = names.find((n) => n.endsWith('.json'))
    const md = names.find((n) => n.endsWith('.md'))
    expect(json).toBeDefined()
    expect(md).toBeDefined()
    // Same stem, different extension.
    expect(md).toBe(json!.replace(/\.json$/, '.md'))

    const body = await fsp.readFile(join(dir, md!), 'utf8')
    expect(body).toContain('hello world')
    expect(body).toBe(serializeChapterToMarkdown('Chapter One', docWith('hello world')))
  })

  it('returns mdWarning and preserves the .json canon when the .md write fails', async () => {
    const { svc, lib } = await makeService()
    const story = await svc.createStory({ title: 'MD Fail Story' })
    const ch = await svc.createChapter(story.id, 'Chapter One')

    // First save succeeds and creates the .md.
    await svc.saveChapter(story.id, { id: ch.id, title: 'Chapter One', doc: docWith('v1') })
    const dir = layout.chaptersDir(lib, story.id)
    const jsonName = (await chapterFiles(lib, story.id))[0]
    const mdPath = join(dir, jsonName.replace(/\.json$/, '.md'))

    // Sabotage the .md target: replace the file with a DIRECTORY so the atomic
    // rename-over-target fails deterministically on every platform.
    await fsp.rm(mdPath)
    await fsp.mkdir(mdPath)

    const result = await svc.saveChapter(story.id, {
      id: ch.id,
      title: 'Chapter One',
      doc: docWith('v2')
    })

    // Save reported as succeeded-with-warning.
    expect(result.mdWarning).toBeTruthy()
    expect(result.savedAt).toBeTruthy()

    // Canon is intact and holds the new content.
    const reread = await svc.readChapter(story.id, ch.id)
    expect(JSON.stringify(reread.doc)).toContain('v2')
  })

  it('soft-deletes the sibling .md alongside the .json', async () => {
    const { svc, lib } = await makeService()
    const story = await svc.createStory({ title: 'Del Story' })
    const ch = await svc.createChapter(story.id, 'Chapter One')
    await svc.saveChapter(story.id, { id: ch.id, title: 'Chapter One', doc: docWith('body') })

    const dir = layout.chaptersDir(lib, story.id)
    expect((await fsp.readdir(dir)).some((n) => n.endsWith('.md'))).toBe(true)

    await svc.deleteChapter(story.id, ch.id)

    // No orphan .md left behind in the live chapters directory.
    expect((await fsp.readdir(dir)).some((n) => n.endsWith('.md'))).toBe(false)
  })

  it('renames the sibling .md when chapters are reordered', async () => {
    const { svc, lib } = await makeService()
    const story = await svc.createStory({ title: 'Reorder Story' })
    const a = await svc.createChapter(story.id, 'Alpha')
    const b = await svc.createChapter(story.id, 'Beta')
    await svc.saveChapter(story.id, { id: a.id, title: 'Alpha', doc: docWith('alpha body') })
    await svc.saveChapter(story.id, { id: b.id, title: 'Beta', doc: docWith('beta body') })

    await svc.reorderChapters(story.id, [b.id, a.id])

    const dir = layout.chaptersDir(lib, story.id)
    const names = (await fsp.readdir(dir)).sort()
    const mds = names.filter((n) => n.endsWith('.md'))
    // Exactly one .md per chapter — no orphans, no duplicates.
    expect(mds.length).toBe(2)
    // Every .md has a matching .json of the same stem (they stayed in sync).
    for (const md of mds) {
      expect(names).toContain(md.replace(/\.md$/, '.json'))
    }
    // Beta is now first (ordinal 01), Alpha second (ordinal 02).
    expect(mds[0]).toMatch(/^01-.*\.md$/)
    expect(mds[1]).toMatch(/^02-.*\.md$/)
    const first = await fsp.readFile(join(dir, mds[0]), 'utf8')
    expect(first).toContain('beta body')
  })
})

describe('chapter file renumbering (delete)', () => {
  it('renumbers remaining chapter files to contiguous ordinals after a delete', async () => {
    const { svc, lib } = await makeService()
    const story = await svc.createStory({ title: 'Renum' })
    const a = await svc.createChapter(story.id, 'Alpha')
    const b = await svc.createChapter(story.id, 'Beta')
    const c = await svc.createChapter(story.id, 'Gamma')
    await svc.saveChapter(story.id, { id: a.id, title: 'Alpha', doc: docWith('alpha') })
    await svc.saveChapter(story.id, { id: c.id, title: 'Gamma', doc: docWith('gamma') })

    await svc.deleteChapter(story.id, b.id)

    // Files (both .json and .md) renumber to 01/02 — no leftover 03- gap.
    const dir = layout.chaptersDir(lib, story.id)
    const names = (await fsp.readdir(dir)).sort()
    expect(names.filter((n) => n.endsWith('.json'))).toEqual(['01-alpha.json', '02-gamma.json'])
    expect(names.filter((n) => n.endsWith('.md'))).toEqual(['01-alpha.md', '02-gamma.md'])
    // Chapters still resolve by id with their own content.
    expect(JSON.stringify((await svc.readChapter(story.id, c.id)).doc)).toContain('gamma')
  })

  it('does not overwrite a chapter when a later same-title chapter is created', async () => {
    // The reported data-loss scenario: identical (default) titles → identical slugs.
    const { svc, lib } = await makeService()
    const story = await svc.createStory({ title: 'Dup' })
    const a = await svc.createChapter(story.id, 'Глава')
    const b = await svc.createChapter(story.id, 'Глава')
    const c = await svc.createChapter(story.id, 'Глава')
    await svc.saveChapter(story.id, { id: a.id, title: 'Глава', doc: docWith('alpha') })
    await svc.saveChapter(story.id, { id: c.id, title: 'Глава', doc: docWith('gamma') })

    await svc.deleteChapter(story.id, b.id)
    const d = await svc.createChapter(story.id, 'Глава')
    await svc.saveChapter(story.id, { id: d.id, title: 'Глава', doc: docWith('delta') })

    // Exactly three canon files, all distinct, none clobbered.
    expect((await chapterFiles(lib, story.id)).length).toBe(3)
    expect(JSON.stringify((await svc.readChapter(story.id, a.id)).doc)).toContain('alpha')
    expect(JSON.stringify((await svc.readChapter(story.id, c.id)).doc)).toContain('gamma')
    expect(JSON.stringify((await svc.readChapter(story.id, d.id)).doc)).toContain('delta')
  })

  it('createChapter picks a free filename instead of overwriting a colliding one', async () => {
    // Backstop for a library already in the broken state: a stray file sits exactly
    // where the next create would write. It must not be clobbered.
    const { svc, lib } = await makeService()
    const story = await svc.createStory({ title: 'Guard' })
    const dir = layout.chaptersDir(lib, story.id)
    await fsp.writeFile(join(dir, '01-глава.json'), '{"stray":"keep me"}')

    const ch = await svc.createChapter(story.id, 'Глава')

    expect(await fsp.readFile(join(dir, '01-глава.json'), 'utf8')).toContain('keep me')
    expect((await svc.readChapter(story.id, ch.id)).id).toBe(ch.id)
  })
})

describe('settings', () => {
  it('returns defaults and persists changes', async () => {
    const { svc, lib } = await makeService()
    const settings = await svc.readSettings()
    expect(settings.spellLanguages).toEqual(['ru', 'en-US'])
    expect(settings.maxVersionsPerChapter).toBe(20)
    expect(settings.libraryPath).toBe(lib)

    await svc.saveSettings({ ...settings, editorFontSizePx: 20 })
    expect((await svc.readSettings()).editorFontSizePx).toBe(20)
  })

  it('defaults language to ru on a fresh install (M26)', async () => {
    const { svc } = await makeService()
    expect((await svc.readSettings()).language).toBe('ru')
  })

  it('backfills language to ru for a settings file lacking the key (M26)', async () => {
    // Construct a fresh service with an empty cache: write a partial settings.json
    // (no `language` key) FIRST, then instantiate, so the very first readSettings must
    // merge the on-disk partial over defaults. (makeService warms the cache via
    // ensureLibrary → readSettings, which would mask a from-disk backfill.)
    const userData = await fsp.mkdtemp(join(tmpdir(), 'scriptorium-writer-ud-'))
    const lib = await fsp.mkdtemp(join(tmpdir(), 'scriptorium-writer-lib-'))
    dirsToClean.push(userData, lib)
    await fsp.writeFile(
      join(userData, 'settings.json'),
      JSON.stringify({ editorFontSizePx: 19 }),
      'utf8'
    )
    const svc = new FileService({ fs: new NodeFsPort(), userDataPath: userData, defaultLibraryPath: lib })

    const settings = await svc.readSettings()
    expect(settings.language).toBe('ru')
    // Sanity: the on-disk override still applied, proving we read the partial file.
    expect(settings.editorFontSizePx).toBe(19)
  })

  it('seeds language from firstRunLanguage on a genuine fresh install (no settings file)', async () => {
    const userData = await fsp.mkdtemp(join(tmpdir(), 'scriptorium-writer-ud-'))
    const lib = await fsp.mkdtemp(join(tmpdir(), 'scriptorium-writer-lib-'))
    dirsToClean.push(userData, lib)
    const svc = new FileService({
      fs: new NodeFsPort(),
      userDataPath: userData,
      defaultLibraryPath: lib,
      firstRunLanguage: 'en'
    })

    const settings = await svc.readSettings()
    expect(settings.language).toBe('en')
    // The seed is persisted to disk, not just held in memory.
    const onDisk = JSON.parse(await fsp.readFile(join(userData, 'settings.json'), 'utf8'))
    expect(onDisk.language).toBe('en')
  })

  it('defaults language to ru on a fresh install when firstRunLanguage is omitted', async () => {
    const userData = await fsp.mkdtemp(join(tmpdir(), 'scriptorium-writer-ud-'))
    const lib = await fsp.mkdtemp(join(tmpdir(), 'scriptorium-writer-lib-'))
    dirsToClean.push(userData, lib)
    const svc = new FileService({ fs: new NodeFsPort(), userDataPath: userData, defaultLibraryPath: lib })

    expect((await svc.readSettings()).language).toBe('ru')
  })

  it('keeps ru for an existing file missing language even when firstRunLanguage is en', async () => {
    // Critical regression guard: an existing install that predates the `language` key
    // must stay Russian. The first-run seed applies ONLY when no settings file exists.
    const userData = await fsp.mkdtemp(join(tmpdir(), 'scriptorium-writer-ud-'))
    const lib = await fsp.mkdtemp(join(tmpdir(), 'scriptorium-writer-lib-'))
    dirsToClean.push(userData, lib)
    await fsp.writeFile(
      join(userData, 'settings.json'),
      JSON.stringify({ editorFontSizePx: 19 }),
      'utf8'
    )
    const svc = new FileService({
      fs: new NodeFsPort(),
      userDataPath: userData,
      defaultLibraryPath: lib,
      firstRunLanguage: 'en'
    })

    const settings = await svc.readSettings()
    expect(settings.language).toBe('ru')
    // Sanity: we really read the partial on-disk file (merge path), not the seed path.
    expect(settings.editorFontSizePx).toBe(19)
  })

  it('round-trips lastLibraryBackupAt through save/read (MP9)', async () => {
    const { svc } = await makeService()
    const settings = await svc.readSettings()
    const when = '2026-08-10T12:00:00.000Z'
    await svc.saveSettings({ ...settings, lastLibraryBackupAt: when })
    expect((await svc.readSettings()).lastLibraryBackupAt).toBe(when)
  })

  it('loads a settings file written before lastLibraryBackupAt existed (MP9)', async () => {
    // A settings.json from the current schema with NO lastLibraryBackupAt key must
    // load with no error and no data loss; the field is simply undefined.
    const userData = await fsp.mkdtemp(join(tmpdir(), 'scriptorium-writer-ud-'))
    const lib = await fsp.mkdtemp(join(tmpdir(), 'scriptorium-writer-lib-'))
    dirsToClean.push(userData, lib)
    await fsp.writeFile(
      join(userData, 'settings.json'),
      JSON.stringify({ editorFontSizePx: 21, language: 'ru' }),
      'utf8'
    )
    const svc = new FileService({ fs: new NodeFsPort(), userDataPath: userData, defaultLibraryPath: lib })

    const settings = await svc.readSettings()
    expect(settings.lastLibraryBackupAt).toBeUndefined()
    expect(settings.editorFontSizePx).toBe(21) // proves the on-disk file was read
  })
})

describe('libraryPath from another platform (MC3)', () => {
  /** A service whose settings.json already carries `libraryPath`, with an optional predicate.
   *  Written BEFORE construction so the very first readSettings must take the merge path —
   *  makeService() would warm the cache via ensureLibrary and mask the override entirely. */
  async function serviceWithLibraryPath(
    libraryPath: string,
    isLibraryPathUsable?: (path: string) => boolean
  ): Promise<{ svc: FileService; defaultLib: string }> {
    const userData = await fsp.mkdtemp(join(tmpdir(), 'scriptorium-writer-ud-'))
    const defaultLib = await fsp.mkdtemp(join(tmpdir(), 'scriptorium-writer-lib-'))
    dirsToClean.push(userData, defaultLib)
    await fsp.writeFile(join(userData, 'settings.json'), JSON.stringify({ libraryPath }), 'utf8')
    const svc = new FileService({
      fs: new NodeFsPort(),
      userDataPath: userData,
      defaultLibraryPath: defaultLib,
      isLibraryPathUsable
    })
    await svc.ensureLibrary()
    return { svc, defaultLib }
  }

  it('falls back to defaultLibraryPath when the predicate rejects the persisted path', async () => {
    // The real case: settings.json synced in from the desktop build. The path is meaningless
    // here, and MC3's rule is to ignore it rather than fail to launch.
    const windowsPath = 'C:\\Users\\julia\\Documents\\Scriptorium-Writer'
    const { svc, defaultLib } = await serviceWithLibraryPath(
      windowsPath,
      (p) => !/^[A-Za-z]:[\\/]/.test(p)
    )

    const story = await svc.createStory({ title: 'Rejected path' })
    expect(existsSync(join(layout.storiesDir(defaultLib), story.id))).toBe(true)

    // Ignored, NOT rewritten: the value is still correct on the platform that wrote it, and
    // the same settings file may travel back there.
    expect((await svc.readSettings()).libraryPath).toBe(windowsPath)
  })

  it('honours a persisted path the predicate accepts', async () => {
    const chosenLib = await fsp.mkdtemp(join(tmpdir(), 'scriptorium-writer-chosen-'))
    dirsToClean.push(chosenLib)
    const { svc, defaultLib } = await serviceWithLibraryPath(chosenLib, () => true)

    const story = await svc.createStory({ title: 'Accepted path' })
    expect(existsSync(join(layout.storiesDir(chosenLib), story.id))).toBe(true)
    expect(existsSync(join(layout.storiesDir(defaultLib), story.id))).toBe(false)
  })

  it('accepts everything when no predicate is supplied (desktop/web unchanged)', async () => {
    // The default must stay accept-all, or adding the option would silently change how every
    // existing desktop install resolves its library.
    const chosenLib = await fsp.mkdtemp(join(tmpdir(), 'scriptorium-writer-chosen-'))
    dirsToClean.push(chosenLib)
    const { svc, defaultLib } = await serviceWithLibraryPath(chosenLib)

    const story = await svc.createStory({ title: 'No predicate' })
    expect(existsSync(join(layout.storiesDir(chosenLib), story.id))).toBe(true)
    expect(existsSync(join(layout.storiesDir(defaultLib), story.id))).toBe(false)
  })

  it('still falls back on an empty libraryPath, predicate or not', async () => {
    // '' has always meant "no override". The predicate is never consulted for it, so a
    // predicate that (wrongly) accepted '' could not turn the library root into ''.
    const { svc, defaultLib } = await serviceWithLibraryPath('', () => true)

    const story = await svc.createStory({ title: 'Empty path' })
    expect(existsSync(join(layout.storiesDir(defaultLib), story.id))).toBe(true)
  })
})

describe('exportLibraryArchive (M13)', () => {
  it('writes a valid zip of the library with no .part remnant', async () => {
    const { svc } = await makeService()
    await svc.createStory({ title: 'One' })
    const outDir = await fsp.mkdtemp(join(tmpdir(), 'scriptorium-writer-out-'))
    dirsToClean.push(outDir)
    const dest = join(outDir, 'lib.zip')

    await svc.exportLibraryArchive(dest)

    expect(existsSync(dest)).toBe(true)
    expect(existsSync(dest + '.part')).toBe(false)
    const names = new AdmZip(dest).getEntries().map((e) => e.entryName.replace(/\\/g, '/'))
    expect(names.some((n) => n.startsWith('stories/'))).toBe(true)
  })

  it('throws AppError(EXPORT_FAILED) for an unwritable destination and leaves the source intact', async () => {
    const { svc } = await makeService()
    await svc.createStory({ title: 'Two' })
    const outDir = await fsp.mkdtemp(join(tmpdir(), 'scriptorium-writer-out-'))
    dirsToClean.push(outDir)
    // Parent directory does not exist -> unwritable destination.
    const dest = join(outDir, 'no-such-dir', 'lib.zip')

    await expect(svc.exportLibraryArchive(dest)).rejects.toMatchObject({
      name: 'AppError',
      code: 'EXPORT_FAILED'
    })
    const stories = await svc.listStories()
    expect(stories.some((s) => s.title === 'Two')).toBe(true)
  })
})

describe('readLibraryEntries (MP6 web zip walker)', () => {
  it('returns every library file as a forward-slash relative path + bytes', async () => {
    const { svc } = await makeService()
    const story = await svc.createStory({ title: 'One' })
    const ch = await svc.createChapter(story.id, 'Ch')
    await svc.saveChapter(story.id, { id: ch.id, title: 'Ch', doc: docWith('hello world') })

    const entries = await svc.readLibraryEntries()
    const paths = entries.map((e) => e.path)

    // Relative to the library root, forward-slash separated, no leading slash.
    expect(paths.every((p) => !p.startsWith('/') && !p.includes('\\'))).toBe(true)
    // The story meta and the chapter canon are present.
    expect(paths.some((p) => p.startsWith('stories/') && p.endsWith('story.json'))).toBe(true)
    expect(
      paths.some((p) => p.startsWith('stories/') && p.includes('/chapters/') && p.endsWith('.json'))
    ).toBe(true)

    // Bytes are real: the chapter canon decodes to JSON containing the text.
    const canon = entries.find((e) => e.path.includes('chapters/') && e.path.endsWith('.json'))!
    expect(new TextDecoder().decode(canon.data)).toContain('hello world')
  })
})

describe('chapter filename follows the title (rename)', () => {
  it('renames the canon and its .md when a save carries a new title', async () => {
    const { svc, lib } = await makeService()
    const story = await svc.createStory({ title: 'A' })
    const ch = await svc.createChapter(story.id, 'Новая глава')
    await svc.saveChapter(story.id, { id: ch.id, title: 'Новая глава', doc: docWith('text') })
    expect(await chapterFiles(lib, story.id)).toEqual(['01-новая-глава.json'])

    await svc.saveChapter(story.id, { id: ch.id, title: 'Глава 2', doc: docWith('text') })

    const dir = layout.chaptersDir(lib, story.id)
    expect(await chapterFiles(lib, story.id)).toEqual(['01-глава-2.json'])
    expect(existsSync(join(dir, '01-глава-2.md'))).toBe(true)
    expect(existsSync(join(dir, '01-новая-глава.json'))).toBe(false)
    expect(existsSync(join(dir, '01-новая-глава.md'))).toBe(false)
    // The chapter still resolves by its stable id, and the content is the new save.
    const read = await svc.readChapter(story.id, ch.id)
    expect(read.title).toBe('Глава 2')
    expect(read.doc).toEqual(docWith('text'))
  })

  it('leaves the filename alone when the title is unchanged', async () => {
    const { svc, lib } = await makeService()
    const story = await svc.createStory({ title: 'A' })
    const ch = await svc.createChapter(story.id, 'Steady')
    await svc.saveChapter(story.id, { id: ch.id, title: 'Steady', doc: docWith('one') })
    await svc.saveChapter(story.id, { id: ch.id, title: 'Steady', doc: docWith('two') })
    expect(await chapterFiles(lib, story.id)).toEqual(['01-steady.json'])
  })

  it('never clobbers a file already sitting at the desired name', async () => {
    const { svc, lib } = await makeService()
    const story = await svc.createStory({ title: 'A' })
    const ch = await svc.createChapter(story.id, 'Original')
    const dir = layout.chaptersDir(lib, story.id)
    // A stray file (a leftover from an older library) already owns the name the new
    // title would want. The save must keep its own filename rather than overwrite it.
    await fsp.writeFile(join(dir, '01-taken.json'), JSON.stringify({ id: 'other', title: 'Taken' }))

    await svc.saveChapter(story.id, { id: ch.id, title: 'Taken', doc: docWith('mine') })

    expect(JSON.parse(await fsp.readFile(join(dir, '01-taken.json'), 'utf8')).title).toBe('Taken')
    expect((await svc.readChapter(story.id, ch.id)).doc).toEqual(docWith('mine'))
    expect(existsSync(join(dir, '01-original.json'))).toBe(true)
  })
})
