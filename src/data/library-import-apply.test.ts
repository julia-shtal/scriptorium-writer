import { describe, it, expect, afterEach } from 'vitest'
import { existsSync } from 'node:fs'
import * as fsp from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { unzipSync, zipSync } from 'fflate'
import { FileService } from './file-service'
import { NodeFsPort } from '../platform/node/fs-port'
import type { FsPort } from './fs-port'
import { layout } from './paths'
import { importedTitle } from './library-import-apply'

const dirs: string[] = []
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((d) => fsp.rm(d, { recursive: true, force: true })))
})

const slash = (p: string): string => p.replace(/\\/g, '/')

/** NodeFsPort with hooks to fail, or silently truncate, chosen writes/renames. */
class FaultyFsPort extends NodeFsPort {
  failWrite: (path: string) => boolean = () => false
  /** Writes matching this lose their last byte: a short write that does not throw. */
  truncateWrite: (path: string) => boolean = () => false
  failRename: (from: string, to: string) => boolean = () => false
  /** errno code on the injected rename error (e.g. 'EPERM' for a transient Windows lock). */
  renameErrorCode: string | undefined = undefined
  renameCalls: [string, string][] = []
  override async writeFile(path: string, data: string | Uint8Array): Promise<void> {
    if (this.failWrite(path)) throw new Error(`injected write failure: ${path}`)
    if (this.truncateWrite(path)) {
      const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data
      return super.writeFile(path, bytes.subarray(0, Math.max(0, bytes.byteLength - 1)))
    }
    return super.writeFile(path, data)
  }
  override async rename(from: string, to: string): Promise<void> {
    this.renameCalls.push([slash(from), slash(to)])
    if (this.failRename(from, to)) {
      throw Object.assign(new Error(`injected rename failure: ${from} -> ${to}`), { code: this.renameErrorCode })
    }
    return super.rename(from, to)
  }
}

async function makeService(fs: FsPort = new NodeFsPort()): Promise<{ svc: FileService; lib: string }> {
  const userData = await fsp.mkdtemp(join(tmpdir(), 'sw-imp-ud-'))
  const lib = await fsp.mkdtemp(join(tmpdir(), 'sw-imp-lib-'))
  dirs.push(userData, lib)
  const svc = new FileService({ fs, userDataPath: userData, defaultLibraryPath: lib, platform: 'test' })
  await svc.ensureLibrary()
  return { svc, lib }
}

const doc = (text: string): Record<string, unknown> => ({
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text }] }]
})

/** A source library (default: stories `a` and `b`), exported the way web/Android do it. */
async function sourceArchive(titles: string[] = ['A', 'B']): Promise<Uint8Array> {
  const { svc } = await makeService()
  for (const title of titles) {
    const s = await svc.createStory({ title })
    const ch = await svc.createChapter(s.id, 'One')
    await svc.saveChapter(s.id, { id: ch.id, title: 'One', doc: doc(`${title} text`) })
  }
  const tree: Record<string, Uint8Array> = {}
  for (const e of await svc.readLibraryEntries()) tree[e.path] = e.data
  return zipSync(tree)
}

async function tree(dir: string): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  const walk = async (abs: string, rel: string): Promise<void> => {
    for (const ent of await fsp.readdir(abs, { withFileTypes: true })) {
      const r = rel ? `${rel}/${ent.name}` : ent.name
      if (ent.isDirectory()) await walk(join(abs, ent.name), r)
      else out.set(r, await fsp.readFile(join(abs, ent.name), 'utf8'))
    }
  }
  await walk(dir, '')
  return out
}

/** `stories/**` entries as sorted [path, hex] pairs — Buffer vs Uint8Array-proof. */
const storyEntries = (entries: Iterable<[string, Uint8Array]>): [string, string][] =>
  [...entries]
    .filter(([path]) => path.startsWith('stories/'))
    .map(([path, data]): [string, string] => [path, Buffer.from(data).toString('hex')])
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))

describe('library import (M31)', () => {
  it('imports every story into an empty library, byte-equal', async () => {
    const bytes = await sourceArchive()
    const { svc, lib } = await makeService()
    const preview = await svc.previewLibraryImport(bytes, 'lib.zip')
    expect(preview.stories.map((s) => [s.id, s.status])).toEqual([
      ['a', 'new'],
      ['b', 'new']
    ])
    expect(preview.manifest).toBeNull() // zipped from readLibraryEntries: no manifest
    const result = await svc.applyLibraryImport(preview.importId, {})
    expect(result.imported.map((r) => r.finalId)).toEqual(['a', 'b'])
    expect(result.failed).toEqual([])
    expect((await svc.listStories()).map((s) => s.id).sort()).toEqual(['a', 'b'])
    expect(existsSync(join(lib, '.import-tmp'))).toBe(false)

    // Spec: files byte-equal after import — same paths, same bytes, versions/ included.
    const archived = storyEntries(Object.entries(unzipSync(bytes)))
    const onDisk = storyEntries((await svc.readLibraryEntries()).map((e): [string, Uint8Array] => [e.path, e.data]))
    expect(archived.length).toBeGreaterThan(0)
    expect(archived.some(([p]) => p.includes('/versions/'))).toBe(true)
    expect(onDisk).toEqual(archived)
  })

  it('re-importing the same archive is all Identical and writes nothing', async () => {
    const bytes = await sourceArchive()
    const { svc, lib } = await makeService()
    await svc.applyLibraryImport((await svc.previewLibraryImport(bytes, 'x.zip')).importId, {})
    const before = await tree(lib)
    const again = await svc.previewLibraryImport(bytes, 'x.zip')
    expect(again.stories.every((s) => s.status === 'identical')).toBe(true)
    const result = await svc.applyLibraryImport(again.importId, {})
    expect(result.imported).toEqual([])
    expect(result.skipped.sort()).toEqual(['a', 'b'])
    expect(await tree(lib)).toEqual(before)
  })

  it('Keep both: new id, suffixed title, rewritten story.json, original untouched', async () => {
    const bytes = await sourceArchive()
    const { svc, lib } = await makeService()
    const local = await svc.createStory({ title: 'Local A' }) // id 'local-a' — make it collide:
    await fsp.rename(layout.storyDir(lib, local.id), layout.storyDir(lib, 'a'))
    await fsp.writeFile(layout.storyMeta(lib, 'a'), JSON.stringify({ ...local, id: 'a' }))
    const before = await fsp.readFile(layout.storyMeta(lib, 'a'), 'utf8')

    const preview = await svc.previewLibraryImport(bytes, 'x.zip')
    const a = preview.stories.find((s) => s.id === 'a')!
    expect(a.status).toBe('conflict')
    expect(a.local?.title).toBe('Local A')
    const result = await svc.applyLibraryImport(preview.importId, { a: 'keepBoth', b: 'skip' })
    expect(result.failed).toEqual([])
    const finalId = result.imported[0]!.finalId
    expect(finalId).not.toBe('a')
    // Not 'b' either: an id arriving in the archive is taken even when skipped.
    expect(finalId).not.toBe('b')
    const imported = JSON.parse(await fsp.readFile(layout.storyMeta(lib, finalId), 'utf8'))
    expect(imported.id).toBe(finalId)
    // A pattern, not importedTitle(..., new Date()): the test must not break at midnight.
    expect(imported.title).toMatch(/^A \(импорт \d{2}\.\d{2}\.\d{4}\)$/)
    expect(await fsp.readFile(layout.storyMeta(lib, 'a'), 'utf8')).toBe(before)
    expect((await svc.listStories()).map((s) => s.id).sort()).toEqual(['a', finalId].sort())
  })

  it('Replace: old copy in .trash, new copy in stories/', async () => {
    const bytes = await sourceArchive()
    const { svc, lib } = await makeService()
    await svc.createStory({ title: 'A' }) // id 'a', different content
    const preview = await svc.previewLibraryImport(bytes, 'x.zip')
    const result = await svc.applyLibraryImport(preview.importId, { a: 'replace', b: 'skip' })
    expect(result.imported).toEqual([{ id: 'a', finalId: 'a', decision: 'replace' }])
    expect((await svc.readStory('a')).chapterOrder).toHaveLength(1)
    expect((await fsp.readdir(layout.trashDir(lib))).some((n) => n.startsWith('a-'))).toBe(true)
  })

  it('a staging failure leaves no half story in stories/, reports failed, imports the rest', async () => {
    const bytes = await sourceArchive()
    const fs = new FaultyFsPort()
    const { svc, lib } = await makeService(fs)
    fs.failWrite = (p) => slash(p).includes('/.import-tmp/') && slash(p).includes('/a/chapters/')
    const preview = await svc.previewLibraryImport(bytes, 'x.zip')
    const result = await svc.applyLibraryImport(preview.importId, {})
    expect(result.failed.map((f) => f.id)).toEqual(['a'])
    expect(result.imported.map((r) => r.id)).toEqual(['b'])
    expect(existsSync(layout.storyDir(lib, 'a'))).toBe(false)
    expect(existsSync(join(lib, '.import-tmp'))).toBe(false)
  })

  it('Replace whose publish fails restores the local story from .trash', async () => {
    const bytes = await sourceArchive()
    const fs = new FaultyFsPort()
    const { svc, lib } = await makeService(fs)
    await svc.createStory({ title: 'A' })
    const localMeta = await fsp.readFile(layout.storyMeta(lib, 'a'), 'utf8')
    // Fail ONLY the publish rename (staging → stories/a). atomicWriteFile also renames
    // inside .import-tmp, so matching on `from` alone would break staging instead.
    fs.failRename = (from, to) => slash(from).includes('/.import-tmp/') && slash(to).endsWith('/stories/a')
    const preview = await svc.previewLibraryImport(bytes, 'x.zip')
    const result = await svc.applyLibraryImport(preview.importId, { a: 'replace', b: 'skip' })
    expect(result.failed.map((f) => f.id)).toEqual(['a'])
    expect(result.imported).toEqual([])
    expect(await fsp.readFile(layout.storyMeta(lib, 'a'), 'utf8')).toBe(localMeta)
    expect((await fsp.readdir(layout.trashDir(lib))).some((n) => n.startsWith('a-'))).toBe(false)
    expect(existsSync(join(lib, '.import-tmp'))).toBe(false)
  })

  it('Replace whose STAGING fails never touches the local story', async () => {
    const bytes = await sourceArchive()
    const fs = new FaultyFsPort()
    const { svc, lib } = await makeService(fs)
    await svc.createStory({ title: 'A' })
    const localMeta = await fsp.readFile(layout.storyMeta(lib, 'a'), 'utf8')
    fs.failWrite = (p) => slash(p).includes('/.import-tmp/') && slash(p).includes('/a/chapters/')
    const preview = await svc.previewLibraryImport(bytes, 'x.zip')
    const result = await svc.applyLibraryImport(preview.importId, { a: 'replace', b: 'skip' })
    expect(result.failed.map((f) => f.id)).toEqual(['a'])
    expect(await fsp.readFile(layout.storyMeta(lib, 'a'), 'utf8')).toBe(localMeta)
    expect((await fsp.readdir(layout.trashDir(lib))).some((n) => n.startsWith('a-'))).toBe(false)
    expect(existsSync(join(lib, '.import-tmp'))).toBe(false)
  })

  it('Replace whose VERIFY fails (a short staged write) never touches the local story', async () => {
    const bytes = await sourceArchive()
    const fs = new FaultyFsPort()
    const { svc, lib } = await makeService(fs)
    await svc.createStory({ title: 'A' })
    const localMeta = await fsp.readFile(layout.storyMeta(lib, 'a'), 'utf8')
    fs.truncateWrite = (p) => slash(p).includes('/.import-tmp/') && slash(p).includes('/a/chapters/')
    const preview = await svc.previewLibraryImport(bytes, 'x.zip')
    const result = await svc.applyLibraryImport(preview.importId, { a: 'replace', b: 'skip' })
    expect(result.failed.map((f) => f.id)).toEqual(['a'])
    // The WRITE_FAILED message from verify().
    expect(result.failed[0]!.reason).toMatch(/^staged chapters\/.+ is \d+ of \d+ bytes$/)
    expect(await fsp.readFile(layout.storyMeta(lib, 'a'), 'utf8')).toBe(localMeta)
    expect((await fsp.readdir(layout.trashDir(lib))).some((n) => n.startsWith('a-'))).toBe(false)
    expect(existsSync(join(lib, '.import-tmp'))).toBe(false)
  })

  it('a publish rename that hits a transient lock (EPERM) once is retried and succeeds', async () => {
    const bytes = await sourceArchive()
    const fs = new FaultyFsPort()
    const { svc, lib } = await makeService(fs)
    let failuresLeft = 1
    fs.renameErrorCode = 'EPERM'
    fs.failRename = (from, to) => {
      const publish = slash(from).includes('/.import-tmp/') && slash(to).endsWith('/stories/a')
      if (!publish || failuresLeft === 0) return false
      failuresLeft--
      return true
    }
    const preview = await svc.previewLibraryImport(bytes, 'x.zip')
    const result = await svc.applyLibraryImport(preview.importId, {})
    expect(result.failed).toEqual([])
    expect(result.imported.map((r) => r.id)).toEqual(['a', 'b'])
    expect(fs.renameCalls.filter(([, to]) => to.endsWith('/stories/a'))).toHaveLength(2)
    expect((await svc.readStory('a')).chapterOrder).toHaveLength(1)
    expect(existsSync(join(lib, '.import-tmp'))).toBe(false)
  })

  it('a story id that is an Object.prototype member takes the status default', async () => {
    const bytes = await sourceArchive(['Constructor', 'toString'])
    const { svc } = await makeService()
    const preview = await svc.previewLibraryImport(bytes, 'x.zip')
    expect(preview.stories.map((s) => s.id)).toEqual(['constructor', 'tostring'])
    const result = await svc.applyLibraryImport(preview.importId, {})
    expect(result.failed).toEqual([])
    expect(result.imported).toEqual([
      { id: 'constructor', finalId: 'constructor', decision: 'import' },
      { id: 'tostring', finalId: 'tostring', decision: 'import' }
    ])
  })

  it('an id differing from a local one only in letter case is a conflict; Replace trashes the local', async () => {
    const bytes = await sourceArchive()
    const { svc, lib } = await makeService()
    const local = await svc.createStory({ title: 'Local A' })
    // A local folder "A" (a hand-made or old library) vs the archive's "a".
    await fsp.rename(layout.storyDir(lib, local.id), layout.storyDir(lib, 'A'))
    await fsp.writeFile(layout.storyMeta(lib, 'A'), JSON.stringify({ ...local, id: 'A' }))
    const localMeta = await fsp.readFile(layout.storyMeta(lib, 'A'), 'utf8')

    const preview = await svc.previewLibraryImport(bytes, 'x.zip')
    const a = preview.stories.find((s) => s.id === 'a')!
    expect(a.status).toBe('conflict')
    expect(a.local?.title).toBe('Local A')
    const result = await svc.applyLibraryImport(preview.importId, { a: 'replace', b: 'skip' })
    expect(result.failed).toEqual([])
    expect(result.imported).toEqual([{ id: 'a', finalId: 'a', decision: 'replace' }])
    expect((await svc.listStories()).map((s) => s.id)).toEqual(['a'])
    const trashed = (await fsp.readdir(layout.trashDir(lib))).filter((n) => n.startsWith('A-'))
    expect(trashed).toHaveLength(1)
    expect(await fsp.readFile(join(layout.trashDir(lib), trashed[0]!, 'story.json'), 'utf8')).toBe(localMeta)
  })

  it('Replace whose publish AND restore fail keeps the local copy in .trash and says where', async () => {
    const bytes = await sourceArchive()
    const fs = new FaultyFsPort()
    const { svc, lib } = await makeService(fs)
    await svc.createStory({ title: 'A' })
    const localMeta = await fsp.readFile(layout.storyMeta(lib, 'a'), 'utf8')
    // Any rename INTO stories/a fails: the publish from staging and the restore from .trash.
    fs.failRename = (_from, to) => slash(to).endsWith('/stories/a')
    const preview = await svc.previewLibraryImport(bytes, 'x.zip')
    const result = await svc.applyLibraryImport(preview.importId, { a: 'replace', b: 'skip' })
    expect(result.failed.map((f) => f.id)).toEqual(['a'])
    expect(result.failed[0]!.reason).toContain('.trash')
    const trashed = (await fsp.readdir(layout.trashDir(lib))).filter((n) => n.startsWith('a-'))
    expect(trashed).toHaveLength(1)
    expect(await fsp.readFile(join(layout.trashDir(lib), trashed[0]!, 'story.json'), 'utf8')).toBe(localMeta)
  })

  it('a story created between preview and apply is never overwritten', async () => {
    const bytes = await sourceArchive()
    const { svc, lib } = await makeService()
    const preview = await svc.previewLibraryImport(bytes, 'x.zip')
    expect(preview.stories.find((s) => s.id === 'a')?.status).toBe('new')
    await svc.createStory({ title: 'A' }) // id 'a' appears after the preview
    const localMeta = await fsp.readFile(layout.storyMeta(lib, 'a'), 'utf8')
    const result = await svc.applyLibraryImport(preview.importId, {})
    expect(result.failed.map((f) => f.id)).toEqual(['a'])
    expect(result.imported.map((r) => r.id)).toEqual(['b'])
    expect(await fsp.readFile(layout.storyMeta(lib, 'a'), 'utf8')).toBe(localMeta)
  })

  it('rejects a decision the status does not allow, before any write; the import survives', async () => {
    const bytes = await sourceArchive()
    const { svc, lib } = await makeService()
    const preview = await svc.previewLibraryImport(bytes, 'x.zip')
    await expect(svc.applyLibraryImport(preview.importId, { a: 'replace' })).rejects.toMatchObject({
      code: 'INVALID_INPUT'
    })
    expect(await fsp.readdir(layout.storiesDir(lib))).toEqual([])
    expect(existsSync(join(lib, '.import-tmp'))).toBe(false)
    // The bad request did not consume the preview: the same importId still applies.
    const result = await svc.applyLibraryImport(preview.importId, { a: 'import' })
    expect(result.imported.map((r) => r.id)).toEqual(['a', 'b'])
  })

  it('an unknown or consumed importId is NOT_FOUND; discard is idempotent', async () => {
    const bytes = await sourceArchive()
    const { svc } = await makeService()
    await expect(svc.applyLibraryImport('nope', {})).rejects.toMatchObject({ code: 'NOT_FOUND' })
    const p = await svc.previewLibraryImport(bytes, 'x.zip')
    await svc.applyLibraryImport(p.importId, {})
    await expect(svc.applyLibraryImport(p.importId, {})).rejects.toMatchObject({ code: 'NOT_FOUND' })
    await expect(svc.discardLibraryImport(p.importId)).resolves.toBeUndefined()
    await expect(svc.discardLibraryImport('nope')).resolves.toBeUndefined()
  })

  it('discard drops the pending import', async () => {
    const bytes = await sourceArchive()
    const { svc } = await makeService()
    const p = await svc.previewLibraryImport(bytes, 'x.zip')
    await svc.discardLibraryImport(p.importId)
    await expect(svc.applyLibraryImport(p.importId, {})).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('a new preview discards the previous one', async () => {
    const bytes = await sourceArchive()
    const { svc } = await makeService()
    const first = await svc.previewLibraryImport(bytes, 'x.zip')
    await svc.previewLibraryImport(bytes, 'x.zip')
    await expect(svc.applyLibraryImport(first.importId, {})).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('a refused archive also drops the previous preview', async () => {
    const bytes = await sourceArchive()
    const { svc } = await makeService()
    const first = await svc.previewLibraryImport(bytes, 'x.zip')
    await expect(svc.previewLibraryImport(new Uint8Array([1, 2, 3]), 'bad.zip')).rejects.toMatchObject({
      code: 'IMPORT_INVALID_ARCHIVE'
    })
    await expect(svc.applyLibraryImport(first.importId, {})).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })
})

describe('importedTitle', () => {
  it('suffixes per UI language', () => {
    const d = new Date(2026, 10, 9)
    expect(importedTitle('Мороз', 'ru', d)).toBe('Мороз (импорт 09.11.2026)')
    expect(importedTitle('Frost', 'en', d)).toBe('Frost (imported 2026-11-09)')
  })
})

describe('previewLibraryImport last-modified', () => {
  it('sees a chapter saved after export as newer on the local side', async () => {
    const { svc } = await makeService()
    const s = await svc.createStory({ title: 'A' })
    const ch = await svc.createChapter(s.id, 'One')
    await svc.saveChapter(s.id, { id: ch.id, title: 'One', doc: doc('before') })
    const exported: Record<string, Uint8Array> = {}
    for (const e of await svc.readLibraryEntries()) exported[e.path] = e.data
    // saveChapter stamps only the chapter, not story.json — the case the story date missed.
    await new Promise((r) => setTimeout(r, 5))
    await svc.saveChapter(s.id, { id: ch.id, title: 'One', doc: doc('edited later') })
    const preview = await svc.previewLibraryImport(zipSync(exported), 'x.zip')
    const entry = preview.stories.find((p) => p.id === s.id)!
    expect(entry.status).toBe('conflict')
    expect(entry.local!.updatedAt > entry.incoming.updatedAt).toBe(true)
  })
})
