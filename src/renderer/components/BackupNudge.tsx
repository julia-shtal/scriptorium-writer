import { useState } from 'react'
import { IconDeviceFloppy } from '@tabler/icons-react'
import { getPlatform } from '@renderer/platform'
import { useSettingsStore } from '@renderer/store/settingsStore'
import { useT } from '@renderer/i18n/useT'
import { runLibraryBackup } from '@renderer/backup/run-library-backup'
import {
  shouldShowBackupNudge,
  BACKUP_NUDGE_DISMISS_KEY
} from '@renderer/backup/nudge'

/**
 * Web-only "your backup is overdue" strip shown in the library view (MP9). Reuses the
 * `.update-notice` styling (like WebUpdateNotice) rather than inventing a new visual
 * treatment. Non-modal; never appears mid-writing. Renders nothing on desktop, for an
 * empty library, or when a recent backup/dismissal is on record.
 */
export function BackupNudge({ storyCount }: { storyCount: number }): JSX.Element | null {
  const t = useT()
  const lastLibraryBackupAt = useSettingsStore((s) => s.settings?.lastLibraryBackupAt)
  // localStorage is not reactive; read the dismissal once per mount into state.
  const [dismissedAt, setDismissedAt] = useState<string | undefined>(() => {
    try {
      return localStorage.getItem(BACKUP_NUDGE_DISMISS_KEY) ?? undefined
    } catch {
      return undefined
    }
  })
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)

  const isWeb = getPlatform().capabilities?.evictableStorage === true
  const visible = shouldShowBackupNudge({
    isWeb,
    storyCount,
    lastLibraryBackupAt,
    dismissedAt,
    now: Date.now()
  })
  if (!visible) return null

  const backup = async (): Promise<void> => {
    setBusy(true)
    setFailed(false)
    try {
      // On success this freshens lastLibraryBackupAt, which hides the nudge via the store.
      await runLibraryBackup()
    } catch (err) {
      // A rejected export (e.g. MC1's Android UNSUPPORTED export guard) must not look
      // like a no-op tap. runLibraryBackup only stamps lastLibraryBackupAt after a
      // successful export, so a throw here leaves it untouched and the nudge correctly
      // stays visible — this just adds the missing user-facing feedback for that case.
      console.error('Backup failed', err)
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }

  const dismiss = (): void => {
    const now = new Date().toISOString()
    try {
      localStorage.setItem(BACKUP_NUDGE_DISMISS_KEY, now)
    } catch {
      /* storage unavailable — still hide for this session via state below */
    }
    setDismissedAt(now)
  }

  return (
    <div className="update-notice" role="status">
      <IconDeviceFloppy size={16} className="update-notice-icon" />
      <div className="update-notice-text">
        <div>{t.backup.nudgeText}</div>
        {failed && (
          <div className="update-notice-error" role="alert">
            {t.backup.nudgeFailed}
          </div>
        )}
      </div>
      <button className="update-notice-btn primary" disabled={busy} onClick={() => void backup()}>
        {t.backup.nudgeAction}
      </button>
      <button className="update-notice-btn ghost" onClick={dismiss}>
        {t.backup.dismiss}
      </button>
    </div>
  )
}
