import { describe, it, expect } from 'vitest'
import type { ProseMirrorJSON } from '@shared/types'
import { FileService } from '@data/file-service'
import { MemoryFsPort } from './memory-fs-port'
import { makeApiFromService } from './index'

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
