import { describe, it, expect } from 'vitest'
import { makeSnippet } from './snippet'

describe('makeSnippet', () => {
  it('returns before/match/after with truncation flags for a mid-text match', () => {
    const text = 'x'.repeat(100) + 'NEEDLE' + 'y'.repeat(100)
    const s = makeSnippet(text, 100, 6, 40)
    expect(s.match).toBe('NEEDLE')
    expect(s.before).toBe('x'.repeat(40))
    expect(s.after).toBe('y'.repeat(40))
    expect(s.truncatedStart).toBe(true)
    expect(s.truncatedEnd).toBe(true)
  })

  it('does not flag truncation at the very start/end', () => {
    const s = makeSnippet('NEEDLE tail', 0, 6, 40)
    expect(s.before).toBe('')
    expect(s.truncatedStart).toBe(false)
    expect(s.truncatedEnd).toBe(false)
  })

  it('collapses internal whitespace/newlines to single spaces', () => {
    const s = makeSnippet('aa\n\n  bb NEEDLE cc', 9, 6, 40)
    expect(s.before).toBe('aa bb ')
    expect(s.match).toBe('NEEDLE')
  })
})
