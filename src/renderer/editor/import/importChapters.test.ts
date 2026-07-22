import { describe, it, expect, vi, afterEach } from 'vitest'
import { planImportChapters, commitImport, type PlannedChapter } from './importChapters'
import type { ImportFileResult, ProseMirrorJSON } from '@shared/types'

const md = (text: string): ImportFileResult => ({ canceled: false, kind: 'md', text })

describe('planImportChapters (markdown)', () => {
  it('single mode → one chapter, empty title, whole body', () => {
    const chapters = planImportChapters(md('# H\n\nbody'), 'single')
    expect(chapters).toHaveLength(1)
    expect(chapters[0].title).toBe('')
    // heading text is flattened into the body, never dropped
    expect(JSON.stringify(chapters[0].doc)).toContain('H')
    expect(JSON.stringify(chapters[0].doc)).toContain('body')
  })

  it('split mode → one chapter per heading with titles + content', () => {
    const chapters = planImportChapters(md('# One\n\na\n\n# Two\n\nb'), 'split')
    expect(chapters.map((c) => c.title)).toEqual(['One', 'Two'])
    expect(JSON.stringify(chapters[0].doc)).toContain('a')
    expect(JSON.stringify(chapters[1].doc)).toContain('b')
  })

  it('split mode keeps a non-empty leading section as an empty-title chapter', () => {
    const chapters = planImportChapters(md('intro\n\n# One\n\na'), 'split')
    expect(chapters.map((c) => c.title)).toEqual(['', 'One'])
  })
})

describe('commitImport', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  const doc = (marker: string): ProseMirrorJSON =>
    ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: marker }] }] }) as ProseMirrorJSON

  it('creates then saves each planned chapter in order and returns the count', async () => {
    const calls: string[] = []
    const createChapter = vi.fn(async (_storyId: string, title: string) => {
      calls.push(`create:${title}`)
      return { id: `id-${title}`, title, wordCount: 0 }
    })
    const saveChapter = vi.fn(async (_storyId: string, ch: { id: string }) => {
      calls.push(`save:${ch.id}`)
    })
    vi.stubGlobal('window', { api: { createChapter, saveChapter } })

    const planned: PlannedChapter[] = [
      { title: 'A', doc: doc('a') },
      { title: 'B', doc: doc('b') }
    ]
    const created = await commitImport('story-1', planned)

    expect(created).toBe(2)
    expect(createChapter).toHaveBeenCalledTimes(2)
    expect(saveChapter).toHaveBeenCalledTimes(2)
    // create precedes save for each chapter, and chapters commit in plan order.
    expect(calls).toEqual(['create:A', 'save:id-A', 'create:B', 'save:id-B'])
    // saveChapter receives the id returned by the matching createChapter.
    expect(saveChapter).toHaveBeenNthCalledWith(1, 'story-1', {
      id: 'id-A',
      title: 'A',
      doc: planned[0].doc
    })
  })

  it('returns 0 and touches nothing for an empty plan', async () => {
    const createChapter = vi.fn()
    const saveChapter = vi.fn()
    vi.stubGlobal('window', { api: { createChapter, saveChapter } })

    const created = await commitImport('story-1', [])

    expect(created).toBe(0)
    expect(createChapter).not.toHaveBeenCalled()
    expect(saveChapter).not.toHaveBeenCalled()
  })
})
