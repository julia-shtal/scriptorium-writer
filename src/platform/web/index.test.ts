import { describe, it, expect } from 'vitest'
import type { ProseMirrorJSON } from '@shared/types'
import { createWebPlatform } from './index'

const docWith = (text: string): ProseMirrorJSON => ({
  type: 'doc',
  content: [{ type: 'paragraph', content: text ? [{ type: 'text', text }] : [] }]
})

describe('createWebPlatform', () => {
  it('resolves to a Platform with an api and no lifecycle', async () => {
    const platform = await createWebPlatform()
    expect(platform.api).toBeDefined()
    expect(platform.lifecycle).toBeUndefined()
  })

  it('round-trips a chapter save/read within the session', async () => {
    const { api } = await createWebPlatform()

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
      const { api } = await createWebPlatform()
      await expect(api.revealInFolder('/anywhere')).rejects.toMatchObject({
        code: 'UNSUPPORTED'
      })
    })

    it('applySpellLanguages', async () => {
      const { api } = await createWebPlatform()
      await expect(api.applySpellLanguages(['en'])).rejects.toMatchObject({
        code: 'UNSUPPORTED'
      })
    })

    it('exportLibrary', async () => {
      const { api } = await createWebPlatform()
      await expect(api.exportLibrary()).rejects.toMatchObject({ code: 'UNSUPPORTED' })
    })

    it('readImportFile', async () => {
      const { api } = await createWebPlatform()
      await expect(api.readImportFile()).rejects.toMatchObject({ code: 'UNSUPPORTED' })
    })

    it('exportChapter', async () => {
      const { api } = await createWebPlatform()
      await expect(api.exportChapter('s', 'c', 'md')).rejects.toMatchObject({
        code: 'UNSUPPORTED'
      })
    })

    it('exportStory', async () => {
      const { api } = await createWebPlatform()
      await expect(api.exportStory('s', 'docx')).rejects.toMatchObject({
        code: 'UNSUPPORTED'
      })
    })
  })
})
