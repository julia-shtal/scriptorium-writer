import { describe, it, expect } from 'vitest'
import type { ProseMirrorJSON } from '@shared/types'
import { FileService } from '@data/file-service'
import { MemoryFsPort } from './memory-fs-port'
import { makeApiFromService, zipLibrary } from './index'
import { unzipSync } from 'fflate'

const docWith = (text: string): ProseMirrorJSON => ({
  type: 'doc',
  content: [{ type: 'paragraph', content: text ? [{ type: 'text', text }] : [] }]
})

/**
 * Node-only coverage for {@link makeApiFromService}: the pure Api ↔ FileService
 * mapping, exercised over the in-memory port so this suite never needs a browser.
 * `createWebPlatform` itself (which now boots OpfsFsPort, requiring `navigator.storage`)
 * is covered separately in `create-web-platform.browser.test.ts`.
 */
async function makeTestApi() {
  const service = new FileService({
    fs: new MemoryFsPort(),
    userDataPath: '/userdata',
    defaultLibraryPath: '/library'
  })
  await service.ensureLibrary()
  return makeApiFromService(service)
}

describe('makeApiFromService', () => {
  it('round-trips a chapter save/read within the session', async () => {
    const api = await makeTestApi()

    expect(await api.ping()).toBe('pong')

    const story = await api.createStory({ title: 'Franz Story' })
    const chapter = await api.createChapter(story.id, 'Chapter One')

    const body = 'The web build persists in memory.'
    await api.saveChapter(story.id, {
      id: chapter.id,
      title: chapter.title,
      doc: docWith(body)
    })

    const read = await api.readChapter(story.id, chapter.id)
    const firstParagraph = (read.doc.content as ProseMirrorJSON[])[0]
    const firstText = (firstParagraph.content as ProseMirrorJSON[])[0]
    expect(firstText.text).toBe(body)
  })

  it('apply/discard route to the FileService (M31)', async () => {
    // Source library -> real archive bytes via the shared zipper.
    const source = new FileService({
      fs: new MemoryFsPort(),
      userDataPath: '/userdata',
      defaultLibraryPath: '/library'
    })
    await source.ensureLibrary()
    const story = await source.createStory({ title: 'Travelling Story' })
    const chapter = await source.createChapter(story.id, 'One')
    await source.saveChapter(story.id, { id: chapter.id, title: chapter.title, doc: docWith('hi') })
    const archive = await zipLibrary(source)

    // Fresh destination; preview via the service (the picker needs a DOM), apply via the Api.
    const dest = new FileService({
      fs: new MemoryFsPort(),
      userDataPath: '/userdata',
      defaultLibraryPath: '/library'
    })
    await dest.ensureLibrary()
    const api = makeApiFromService(dest)
    const preview = await dest.previewLibraryImport(archive, 'x.zip')
    expect(preview.canceled).toBe(false)

    const result = await api.applyLibraryImport(preview.importId, {})
    expect(result.imported).toHaveLength(1)
    expect((await api.listStories()).map((x) => x.id)).toContain(story.id)

    await expect(api.discardLibraryImport('anything')).resolves.toBeUndefined()
  })

  describe('unsupported methods reject with an UNSUPPORTED AppError', () => {
    it('revealInFolder', async () => {
      const api = await makeTestApi()
      await expect(api.revealInFolder('/anywhere')).rejects.toMatchObject({
        code: 'UNSUPPORTED'
      })
    })
  })

  it('applySpellLanguages resolves as a no-op (web has no app-managed checker)', async () => {
    const api = await makeTestApi()
    await expect(api.applySpellLanguages(['ru', 'en-US'])).resolves.toBeUndefined()
  })
})

describe('zipLibrary', () => {
  it('writes a manifest.json with the shared shape (M31)', async () => {
    const service = new FileService({
      fs: new MemoryFsPort(),
      userDataPath: '/userdata',
      defaultLibraryPath: '/library',
      platform: 'web'
    })
    await service.ensureLibrary()
    await service.createStory({ title: 'One' })

    const files = unzipSync(await zipLibrary(service))
    const m = JSON.parse(new TextDecoder().decode(files['manifest.json'])) as Record<string, unknown>
    expect(m).toMatchObject({ format: 'scriptorium-library', formatVersion: 1, platform: 'web' })
    expect(Object.keys(m).sort()).toEqual([
      'appVersion',
      'exportedAt',
      'format',
      'formatVersion',
      'platform',
      'schema'
    ])
  })
})
