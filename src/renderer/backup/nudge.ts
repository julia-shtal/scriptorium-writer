/**
 * Backup-nudge visibility (MP9). Pure so it can be unit-tested without rendering the
 * library view. The nudge exists only on the PWA build, where OPFS data is evictable;
 * `isWeb` is decided by the caller from the platform's web signal, not user-agent
 * sniffing.
 */

/** One week. Both "backup is stale" and "dismissal has expired" use this window. */
export const BACKUP_NUDGE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000

/** localStorage key holding the ISO timestamp of the last nudge dismissal. */
export const BACKUP_NUDGE_DISMISS_KEY = 'scriptorium.backupNudgeDismissedAt'

/** True when `ts` is absent, unparseable, or at least `windowMs` in the past. */
export function olderThanOrMissing(ts: string | undefined, now: number, windowMs: number): boolean {
  if (!ts) return true
  const t = Date.parse(ts)
  if (Number.isNaN(t)) return true
  return now - t >= windowMs
}

export interface BackupNudgeInput {
  isWeb: boolean
  storyCount: number
  lastLibraryBackupAt?: string
  dismissedAt?: string
  now: number
}

export function shouldShowBackupNudge(i: BackupNudgeInput): boolean {
  return (
    i.isWeb &&
    i.storyCount > 0 &&
    olderThanOrMissing(i.lastLibraryBackupAt, i.now, BACKUP_NUDGE_WINDOW_MS) &&
    olderThanOrMissing(i.dismissedAt, i.now, BACKUP_NUDGE_WINDOW_MS)
  )
}
