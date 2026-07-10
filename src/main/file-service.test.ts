import { describe, it, expect, afterEach } from 'vitest'
import * as fsp from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { FileService } from './file-service'
import { layout } from './paths'
import { isAppError } from '@shared/errors'
import type { ProseMirrorJSON } from '@shared/types'

const dirsToClean: string[] = []

async function makeService(): Promise<{ svc: FileService; lib: string; userData: string }> {
  const userData = await fsp.mkdtemp(join(tmpdir(), 'scriptorium-writer-ud-'))
  const lib = await fsp.mkdtemp(join(tmpdir(), 'scriptorium-writer-lib-'))
  dirsToClean.push(userData, lib)
  const svc = new FileService({ userDataPath: userData, defaultLibraryPath: lib })
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
})
