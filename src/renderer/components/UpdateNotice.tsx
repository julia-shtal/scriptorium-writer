import { IconDownload } from '@tabler/icons-react'
import { useUiStore } from '@renderer/store/uiStore'
import { useT } from '@renderer/i18n/useT'
import { format } from '@renderer/i18n/strings'
import { getPlatform } from '@renderer/platform'

/**
 * Small, dismissible "update ready" notice (M12). Shown as a footer-style strip (not a
 * blocking modal) once main has pushed `update-downloaded`. "Перезапустить" routes the
 * install through the main-process flush/quit-guard so unsaved edits are never lost;
 * "Позже" just clears the flag and hides the strip until the next launch.
 * Renders nothing on platforms with no lifecycle capability (e.g. web/PWA) — an absent
 * capability should be visibly absent rather than backed by a fabricated no-op.
 */
export function UpdateNotice(): JSX.Element | null {
  const t = useT()
  const version = useUiStore((s) => s.updateReadyVersion)
  const setUpdateReadyVersion = useUiStore((s) => s.setUpdateReadyVersion)
  const { lifecycle } = getPlatform()

  if (!version || !lifecycle) return null

  const restart = (): void => {
    // Do NOT clear the flag here: the flush + install/restart happens in main; if the
    // user cancels a native dialog we want the notice to remain.
    lifecycle.restartToUpdate()
  }

  return (
    <div className="update-notice" role="status">
      <IconDownload size={16} className="update-notice-icon" />
      <span className="update-notice-text">
        {format(t.updateNotice.ready, { version })}
      </span>
      <button className="update-notice-btn primary" onClick={restart}>
        {t.updateNotice.restart}
      </button>
      <button className="update-notice-btn ghost" onClick={() => setUpdateReadyVersion(null)}>
        {t.updateNotice.later}
      </button>
    </div>
  )
}
