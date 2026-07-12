import { describe, it, expect } from 'vitest'
import { currentStreak, recordActiveDay } from './stats'

describe('recordActiveDay', () => {
  it('adds a day and keeps the set sorted-unique', () => {
    expect(recordActiveDay(['2026-07-10'], '2026-07-11')).toEqual(['2026-07-10', '2026-07-11'])
    expect(recordActiveDay(['2026-07-11'], '2026-07-11')).toEqual(['2026-07-11'])
  })
})

describe('currentStreak', () => {
  it('counts consecutive days ending today', () => {
    expect(currentStreak(['2026-07-10', '2026-07-11', '2026-07-12'], '2026-07-12')).toBe(3)
  })
  it('breaks the streak on a gap', () => {
    expect(currentStreak(['2026-07-09', '2026-07-11', '2026-07-12'], '2026-07-12')).toBe(2)
  })
  it('is 0 when today is not an active day', () => {
    expect(currentStreak(['2026-07-10'], '2026-07-12')).toBe(0)
  })
})
