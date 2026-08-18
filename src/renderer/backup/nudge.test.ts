import { describe, it, expect } from 'vitest'
import { shouldShowBackupNudge, olderThanOrMissing, BACKUP_NUDGE_WINDOW_MS } from './nudge'

const NOW = Date.parse('2026-08-10T00:00:00.000Z')
const base = { isWeb: true, storyCount: 1, lastLibraryBackupAt: undefined, dismissedAt: undefined, now: NOW }

describe('olderThanOrMissing', () => {
  it('is true when the timestamp is missing', () => {
    expect(olderThanOrMissing(undefined, NOW, BACKUP_NUDGE_WINDOW_MS)).toBe(true)
  })
  it('is true when the timestamp is unparseable', () => {
    expect(olderThanOrMissing('not-a-date', NOW, BACKUP_NUDGE_WINDOW_MS)).toBe(true)
  })
  it('is false for a fresh timestamp', () => {
    const fresh = new Date(NOW - 1000).toISOString()
    expect(olderThanOrMissing(fresh, NOW, BACKUP_NUDGE_WINDOW_MS)).toBe(false)
  })
  it('is true once the window has elapsed', () => {
    const old = new Date(NOW - BACKUP_NUDGE_WINDOW_MS - 1000).toISOString()
    expect(olderThanOrMissing(old, NOW, BACKUP_NUDGE_WINDOW_MS)).toBe(true)
  })
  it('is true at exactly the window boundary (>= semantics)', () => {
    const exact = new Date(NOW - BACKUP_NUDGE_WINDOW_MS).toISOString()
    expect(olderThanOrMissing(exact, NOW, BACKUP_NUDGE_WINDOW_MS)).toBe(true)
  })
})

describe('shouldShowBackupNudge', () => {
  it('shows on web, non-empty library, never backed up, never dismissed', () => {
    expect(shouldShowBackupNudge(base)).toBe(true)
  })
  it('never shows on desktop', () => {
    expect(shouldShowBackupNudge({ ...base, isWeb: false })).toBe(false)
  })
  it('never shows for an empty library', () => {
    expect(shouldShowBackupNudge({ ...base, storyCount: 0 })).toBe(false)
  })
  it('is hidden by a fresh backup', () => {
    const fresh = new Date(NOW - 1000).toISOString()
    expect(shouldShowBackupNudge({ ...base, lastLibraryBackupAt: fresh })).toBe(false)
  })
  it('reappears once the backup is stale', () => {
    const stale = new Date(NOW - BACKUP_NUDGE_WINDOW_MS - 1000).toISOString()
    expect(shouldShowBackupNudge({ ...base, lastLibraryBackupAt: stale })).toBe(true)
  })
  it('is hidden by a recent dismissal', () => {
    const fresh = new Date(NOW - 1000).toISOString()
    expect(shouldShowBackupNudge({ ...base, dismissedAt: fresh })).toBe(false)
  })
  it('reappears once the dismissal is stale', () => {
    const stale = new Date(NOW - BACKUP_NUDGE_WINDOW_MS - 1000).toISOString()
    expect(shouldShowBackupNudge({ ...base, dismissedAt: stale })).toBe(true)
  })
})
