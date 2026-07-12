import { describe, expect, test } from 'vitest'
import {
  collectFootnoteTexts,
  footnoteMarker,
  footnoteDefinition
} from './footnote-markdown'
import type { ProseMirrorJSON } from './types'

const doc: ProseMirrorJSON = {
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: 'Hello' },
        { type: 'footnote', attrs: { text: 'first note' } },
        { type: 'text', text: ' world' },
        { type: 'footnote', attrs: { text: 'second note' } }
      ]
    }
  ]
}

describe('footnote-markdown', () => {
  test('collectFootnoteTexts returns footnote texts in document order', () => {
    expect(collectFootnoteTexts(doc)).toEqual(['first note', 'second note'])
  })

  test('collectFootnoteTexts returns [] when there are no footnotes', () => {
    expect(collectFootnoteTexts({ type: 'doc', content: [{ type: 'paragraph' }] })).toEqual([])
  })

  test('footnoteMarker formats a 1-based marker', () => {
    expect(footnoteMarker(1)).toBe('[^1]')
    expect(footnoteMarker(2)).toBe('[^2]')
  })

  test('footnoteDefinition formats a 1-based definition line', () => {
    expect(footnoteDefinition(1, 'first note')).toBe('[^1]: first note')
  })
})
