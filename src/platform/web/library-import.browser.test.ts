/**
 * M31 library import round trip on the REAL Origin Private File System (Chromium via
 * `npm run test:browser`). The node suite proves the pipeline on NodeFsPort; this proves
 * it on OpfsFsPort, whose directory rename (the publish step) is a different code path:
 * native `FileSystemDirectoryHandle.move()` where the engine has it, else copy-then-rm.
 *
 * Export = readLibraryEntries + fflate zipSync, exactly as the web `zipLibrary` builds it.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { unzipSync, zipSync } from 'fflate'
import { FileService } from '@data/file-service'
import { OpfsFsPort } from './opfs-fs-port'

const scratch: string[] = []

afterEach(async () => {
  const root = await navigator.storage.getDirectory()
  for (const dir of scratch.splice(0)) {
    try {
      await root.removeEntry(dir.replace(/^\//, ''), { recursive: true })
    } catch {
      // Best-effort cleanup.
    }
  }
})

async function makeService(): Promise<{ svc: FileService; fs: OpfsFsPort; lib: string }> {
  const base = `/imptest-${crypto.randomUUID()}`
  scratch.push(base)
  const fs = new OpfsFsPort()
  const svc = new FileService({
    fs,
    userDataPath: `${base}/userdata`,
    defaultLibraryPath: `${base}/library`,
    platform: 'web'
  })
  await svc.ensureLibrary()
  return { svc, fs, lib: `${base}/library` }
}

const doc = (text: string): Record<string, unknown> => ({
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text }] }]
})

const hex = (data: Uint8Array): string => Array.from(data, (b) => b.toString(16).padStart(2, '0')).join('')

/** `stories/**` entries as sorted [path, hex] pairs. */
const storyEntries = (entries: Iterable<[string, Uint8Array]>): [string, string][] =>
  [...entries]
    .filter(([path]) => path.startsWith('stories/'))
    .map(([path, data]): [string, string] => [path, hex(data)])
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))

describe('library import on OPFS (M31)', () => {
  it('export → import into an empty library: all New, files byte-equal, staging gone', async () => {
    const { svc: source } = await makeService()
    for (const title of ['Мороз', 'Frost']) {
      const s = await source.createStory({ title })
      const ch = await source.createChapter(s.id, 'Глава')
      await source.saveChapter(s.id, { id: ch.id, title: 'Глава', doc: doc(`${title} — текст`) })
    }
    const tree: Record<string, Uint8Array> = {}
    for (const e of await source.readLibraryEntries()) tree[e.path] = e.data
    const bytes = zipSync(tree)

    const { svc: target, fs, lib } = await makeService()
    const preview = await target.previewLibraryImport(bytes, 'library.zip')
    expect(preview.stories.map((s) => [s.id, s.status])).toEqual([
      ['frost', 'new'],
      ['мороз', 'new']
    ])
    const result = await target.applyLibraryImport(preview.importId, {})
    expect(result.failed).toEqual([])
    expect(result.imported.map((r) => r.finalId)).toEqual(['frost', 'мороз'])

    expect((await target.listStories()).map((s) => [s.id, s.chapterCount]).sort()).toEqual([
      ['frost', 1],
      ['мороз', 1]
    ])
    const archived = storyEntries(Object.entries(unzipSync(bytes)))
    const onDisk = storyEntries(
      (await target.readLibraryEntries()).map((e): [string, Uint8Array] => [e.path, e.data])
    )
    expect(archived.length).toBeGreaterThan(0)
    expect(onDisk).toEqual(archived)
    // Nothing of the staging area is left at the library root.
    await expect(fs.stat(`${lib}/.import-tmp`)).rejects.toMatchObject({ code: 'ENOENT' })

    // And the same archive again is all Identical.
    const again = await target.previewLibraryImport(bytes, 'library.zip')
    expect(again.stories.every((s) => s.status === 'identical')).toBe(true)
  })
})
