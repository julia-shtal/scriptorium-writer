import { describe, it, expect } from 'vitest'
import { parseTags, formatTags } from './story-tags'

describe('parseTags', () => {
  it('splits on commas, trims, drops empties', () => {
    expect(parseTags(' fantasy,  draft , ,epic ')).toEqual(['fantasy', 'draft', 'epic'])
  })
  it('de-duplicates case-insensitively, keeping first spelling', () => {
    expect(parseTags('Epic, epic, EPIC')).toEqual(['Epic'])
  })
  it('returns [] for blank input', () => {
    expect(parseTags('   ')).toEqual([])
  })
})

describe('formatTags', () => {
  it('joins with ", "', () => {
    expect(formatTags(['a', 'b'])).toBe('a, b')
  })
})
