/**
 * Pure helpers behind ImportLibraryDialog (M31): counts, starting decisions, and the
 * confirm-button state. Kept out of the .tsx so node tests can cover them.
 */
import type { ImportDecision, ImportStoryPreview, ImportStoryStatus } from '@shared/types'
import { defaultDecision } from '@shared/library-import-rules'

export function countByStatus(rows: ImportStoryPreview[]): Record<ImportStoryStatus, number> {
  const out: Record<ImportStoryStatus, number> = { new: 0, conflict: 0, identical: 0, invalid: 0 }
  for (const r of rows) out[r.status]++
  return out
}

/** Keyed by the archive id — the key `applyLibraryImport` expects. */
export function initialDecisions(rows: ImportStoryPreview[]): Record<string, ImportDecision> {
  return Object.fromEntries(rows.map((r) => [r.id, defaultDecision(r.status)]))
}

/** The primary button is disabled when nothing would change. */
export function wouldChange(decisions: Record<string, ImportDecision>): boolean {
  return Object.values(decisions).some((d) => d !== 'skip')
}

export function replaceCount(decisions: Record<string, ImportDecision>): number {
  return Object.values(decisions).filter((d) => d === 'replace').length
}

/**
 * Replace warns harder when the local copy is the more recent one. ISO strings in the
 * same UTC format compare correctly as strings; '' (unreadable local) is never newer.
 */
export function localIsNewer(row: ImportStoryPreview): boolean {
  return !!row.local?.updatedAt && row.local.updatedAt > row.incoming.updatedAt
}
