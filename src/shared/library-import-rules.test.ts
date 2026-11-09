import { describe, it, expect } from 'vitest'
import { allowedDecisions, defaultDecision } from './library-import-rules'

describe('import decision rules', () => {
  it('matches the spec table', () => {
    expect(defaultDecision('new')).toBe('import')
    expect(allowedDecisions('new')).toEqual(['import', 'skip'])
    expect(defaultDecision('identical')).toBe('skip')
    expect(allowedDecisions('identical')).toEqual(['skip'])
    expect(defaultDecision('conflict')).toBe('keepBoth')
    expect(allowedDecisions('conflict')).toEqual(['keepBoth', 'replace', 'skip'])
    expect(defaultDecision('invalid')).toBe('skip')
    expect(allowedDecisions('invalid')).toEqual(['skip'])
  })
})
