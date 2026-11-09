import { describe, it, expect } from 'vitest'
import type { ImportStoryPreview } from '@shared/types'
import { countByStatus, initialDecisions, replaceCount, wouldChange, localIsNewer } from './import-summary'

const row = (
  id: string,
  status: ImportStoryPreview['status'],
  over: Partial<ImportStoryPreview> = {}
): ImportStoryPreview => ({
  id,
  status,
  warnings: [],
  incoming: { title: id, chapterCount: 1, wordCount: 1, updatedAt: '2026-01-01T00:00:00.000Z' },
  ...over
})

describe('import summary', () => {
  const rows = [row('a', 'new'), row('b', 'conflict'), row('c', 'identical'), row('d', 'invalid')]

  it('counts statuses', () => {
    expect(countByStatus(rows)).toEqual({ new: 1, conflict: 1, identical: 1, invalid: 1 })
    expect(countByStatus([])).toEqual({ new: 0, conflict: 0, identical: 0, invalid: 0 })
  })

  it('starts from the status defaults', () => {
    expect(initialDecisions(rows)).toEqual({ a: 'import', b: 'keepBoth', c: 'skip', d: 'skip' })
  })

  it('wouldChange is false when everything is skip', () => {
    expect(wouldChange({ a: 'skip', b: 'skip', c: 'skip', d: 'skip' })).toBe(false)
    expect(wouldChange({})).toBe(false)
    expect(wouldChange(initialDecisions(rows))).toBe(true)
  })

  it('an all-identical archive starts with nothing to change', () => {
    expect(wouldChange(initialDecisions([row('a', 'identical'), row('b', 'invalid')]))).toBe(false)
  })

  it('counts replaces', () => {
    expect(replaceCount({ a: 'import', b: 'replace' })).toBe(1)
    expect(replaceCount({ a: 'replace', b: 'replace', c: 'keepBoth' })).toBe(2)
  })

  it('localIsNewer compares updatedAt', () => {
    const local = (updatedAt: string): ImportStoryPreview['local'] => ({
      title: 'b', chapterCount: 1, wordCount: 1, updatedAt
    })
    expect(localIsNewer(row('b', 'conflict', { local: local('2026-06-01T00:00:00.000Z') }))).toBe(true)
    expect(localIsNewer(row('b', 'conflict', { local: local('2025-06-01T00:00:00.000Z') }))).toBe(false)
    expect(localIsNewer(row('a', 'new'))).toBe(false)
    // An unreadable local story.json reports '' — unknown is not "newer".
    expect(localIsNewer(row('b', 'conflict', { local: local('') }))).toBe(false)
  })
})
