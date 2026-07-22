import { describe, it, expect } from 'vitest'
import { planImportChapters } from './importChapters'
import type { ImportFileResult } from '@shared/types'

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
