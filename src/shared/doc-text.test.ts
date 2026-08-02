import { describe, it, expect } from 'vitest'
import { extractPlainText } from './doc-text'

const doc = (...paragraphs: string[]): Record<string, unknown> => ({
  type: 'doc',
  content: paragraphs.map((text) => ({
    type: 'paragraph',
    content: text ? [{ type: 'text', text }] : []
  }))
})

describe('extractPlainText', () => {
  it('joins text nodes across paragraphs with spaces', () => {
    expect(extractPlainText(doc('one two', 'three'))).toBe('one two three')
  })

  it('gathers text nested in marks and inline nodes', () => {
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
    expect(extractPlainText(nested)).toBe('bold  and plain')
  })

  it('returns an empty string for an empty doc', () => {
    expect(extractPlainText(doc(''))).toBe('')
  })

  it('does not throw on a malformed doc', () => {
    expect(extractPlainText({} as Record<string, unknown>)).toBe('')
  })
})
