import { useState } from 'react'
import { IconRefresh } from '@tabler/icons-react'
import { registerSW } from 'virtual:pwa-register'
import { useT } from '@renderer/i18n/useT'

/**
 * Web/PWA "update available" strip (MP7). Mirrors the desktop UpdateNotice look (reuses
 * the .update-notice CSS) but is a completely separate mechanism: vite-plugin-pwa's
 * service worker signals a waiting new build via onNeedRefresh; the user chooses when to
 * apply it (registerType: 'prompt' — never a silent mid-sentence reload).
 *
 * This is the ONLY consumer of `virtual:pwa-register`, and it is mounted only from
 * main.web.tsx — never from the shared App — so the Electron bundle never imports the
 * web-only virtual module. Renders nothing until a new SW is waiting or after dismissal.
 */
function useWebUpdatePrompt(): { needRefresh: boolean; update: () => void; dismiss: () => void } {
  const [needRefresh, setNeedRefresh] = useState(false)
  // Register the SW exactly once for the component's life; onNeedRefresh flips our state.
  const [updateSW] = useState(() =>
    registerSW({
      onNeedRefresh() {
        setNeedRefresh(true)
      }
    })
  )
  return {
    needRefresh,
    update: () => void updateSW(true), // activate the waiting SW + reload
    dismiss: () => setNeedRefresh(false)
  }
}

export function WebUpdateNotice(): JSX.Element | null {
  const t = useT()
  const { needRefresh, update, dismiss } = useWebUpdatePrompt()
  if (!needRefresh) return null

  return (
    <div className="update-notice" role="status">
      <IconRefresh size={16} className="update-notice-icon" />
      <span className="update-notice-text">{t.webUpdate.ready}</span>
      <button className="update-notice-btn primary" onClick={update}>
        {t.webUpdate.update}
      </button>
      <button className="update-notice-btn ghost" onClick={dismiss}>
        {t.webUpdate.later}
      </button>
    </div>
  )
}
