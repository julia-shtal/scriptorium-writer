import type { ExportLibraryResult } from '@shared/types'
import { api } from '@renderer/platform'
import { useSettingsStore } from '@renderer/store/settingsStore'

/**
 * Run a full-library export and, on success, record the moment as
 * `lastLibraryBackupAt` (MP9). One code path for every export trigger — the Settings
 * button and the library nudge — so any successful backup, on desktop or web, freshens
 * the timestamp the web nudge reads. A canceled export leaves the timestamp untouched.
 *
 * The archive is the operation; the timestamp is secondary bookkeeping. A failure to
 * persist it must NOT surface to the caller as an export failure (reliability priority
 * #1: never tell the user a completed backup failed) — so the stamp is best-effort.
 */
export async function runLibraryBackup(): Promise<ExportLibraryResult> {
  const result = await api().exportLibrary()
  if (!result.canceled) {
    const current = useSettingsStore.getState().settings
    if (current) {
      const next = { ...current, lastLibraryBackupAt: new Date().toISOString() }
      // Freshen the in-memory timestamp FIRST, unconditionally. This is what the web
      // nudge reads, so a completed backup must hide it immediately — even if writing the
      // stamp to disk below fails. Going through settingsStore.update() instead would gate
      // this behind a successful save(): a failed OPFS write would then leave the nudge
      // showing forever, telling the user an already-completed backup is still overdue.
      useSettingsStore.setState({ settings: next })
      try {
        await api().saveSettings(next)
      } catch {
        // The archive is written and the nudge is already cleared; persisting the stamp
        // is best-effort bookkeeping and must never surface as an export failure.
      }
    }
  }
  return result
}
