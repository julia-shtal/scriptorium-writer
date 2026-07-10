import { describe, it, expect } from 'vitest'
import { countWords, countWordsInText } from './word-count'

const doc = (...paragraphs: string[]): Record<string, unknown> => ({
  type: 'doc',
  content: paragraphs.map((text) => ({
    type: 'paragraph',
    content: text ? [{ type: 'text', text }] : []
  }))
})

describe('countWordsInText', () => {
  it('counts whitespace-separated words', () => {
    expect(countWordsInText('  one   two three ')).toBe(3)
  })

  it('empty string is zero', () => {
    expect(countWordsInText('   ')).toBe(0)
  })
})

describe('countWords', () => {
  it('counts words across all text nodes in the document', () => {
    expect(countWords(doc('one two three', 'four five'))).toBe(5)
  })

  it('returns 0 for an empty document', () => {
    expect(countWords(doc(''))).toBe(0)
  })

  it('collapses runs of whitespace rather than counting empties', () => {
    expect(countWords(doc('  hello   world  '))).toBe(2)
  })

  it('counts text nested in marks and inline nodes', () => {
    const nested: Record<string, unknown> = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'bold', marks: [{ type: 'bold' }] },
            { type: 'text', text: ' and plain' }
          ]
        }
      ]
    }
    expect(countWords(nested)).toBe(3)
  })

  it('does not throw on a malformed doc', () => {
    expect(countWords({} as Record<string, unknown>)).toBe(0)
  })
})
