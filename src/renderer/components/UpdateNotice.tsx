import { IconDownload } from '@tabler/icons-react'
import { useUiStore } from '@renderer/store/uiStore'

/**
 * Small, dismissible "update ready" notice (M12). Shown as a footer-style strip (not a
 * blocking modal) once main has pushed `update-downloaded`. "Перезапустить" routes the
 * install through the main-process flush/quit-guard so unsaved edits are never lost;
 * "Позже" just clears the flag and hides the strip until the next launch.
 */
export function UpdateNotice(): JSX.Element | null {
  const version = useUiStore((s) => s.updateReadyVersion)
  const setUpdateReadyVersion = useUiStore((s) => s.setUpdateReadyVersion)

  if (!version) return null

  const restart = (): void => {
    // Do NOT clear the flag here: the flush + install/restart happens in main; if the
    // user cancels a native dialog we want the notice to remain.
    window.lifecycle.restartToUpdate()
  }

  return (
    <div className="update-notice" role="status">
      <IconDownload size={16} className="update-notice-icon" />
      <span className="update-notice-text">
        Обновление загружено (версия {version}). Перезапустите, чтобы установить.
      </span>
      <button className="update-notice-btn primary" onClick={restart}>
        Перезапустить
      </button>
      <button className="update-notice-btn ghost" onClick={() => setUpdateReadyVersion(null)}>
        Позже
      </button>
    </div>
  )
}
