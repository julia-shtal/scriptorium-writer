/* eslint-disable @typescript-eslint/no-explicit-any --
 * The hardBreak case casts the returned block to `any` to reach into `.runs` without
 * narrowing the DocxBlock union; the test asserts the run shape at runtime. */
import { describe, it, expect } from 'vitest'
import { chapterToDocxBlocks } from './docx-export'
import type { ProseMirrorJSON } from '@shared/types'

const doc = (content: unknown[]): ProseMirrorJSON => ({ type: 'doc', content })

describe('chapterToDocxBlocks', () => {
  it('emits a paragraph with formatted runs', () => {
    const d = doc([
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'plain ' },
          { type: 'text', text: 'bold', marks: [{ type: 'bold' }] }
        ]
      }
    ])
    expect(chapterToDocxBlocks('T', d, { withHeading: false })).toEqual([
      {
        kind: 'paragraph',
        runs: [
          { text: 'plain ', bold: false, italics: false, strike: false },
          { text: 'bold', bold: true, italics: false, strike: false }
        ]
      }
    ])
  })

  it('prepends a Heading-1 block when withHeading is set', () => {
    const blocks = chapterToDocxBlocks('Chapter One', doc([{ type: 'paragraph' }]), {
      withHeading: true
    })
    expect(blocks[0]).toEqual({ kind: 'heading', text: 'Chapter One' })
  })

  it('maps a scene divider to a centered divider paragraph', () => {
    const blocks = chapterToDocxBlocks('T', doc([{ type: 'sceneDivider' }]), { withHeading: false })
    expect(blocks).toEqual([{ kind: 'divider' }])
  })

  it('maps a footnote node to a footnote run carrying its text', () => {
    const d = doc([
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'x' },
          { type: 'footnote', attrs: { text: 'the note' } }
        ]
      }
    ])
    const blocks = chapterToDocxBlocks('T', d, { withHeading: false })
    expect(blocks).toEqual([
      {
        kind: 'paragraph',
        runs: [
          { text: 'x', bold: false, italics: false, strike: false },
          { footnoteText: 'the note' }
        ]
      }
    ])
  })

  it('maps a hardBreak to a break run', () => {
    const d = doc([
      { type: 'paragraph', content: [{ type: 'text', text: 'a' }, { type: 'hardBreak' }, { type: 'text', text: 'b' }] }
    ])
    const runs = (chapterToDocxBlocks('T', d, { withHeading: false })[0] as any).runs
    expect(runs).toEqual([
      { text: 'a', bold: false, italics: false, strike: false },
      { break: true },
      { text: 'b', bold: false, italics: false, strike: false }
    ])
  })
})
