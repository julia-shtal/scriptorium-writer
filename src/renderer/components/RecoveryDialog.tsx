import { useState } from 'react'
import { IconAlertTriangle } from '@tabler/icons-react'
import type { ChapterRecovery } from '@shared/types'
import { useT } from '@renderer/i18n/useT'

interface Props {
  recoveries: ChapterRecovery[]
  onResolved: (r: ChapterRecovery) => void
  onClose: () => void
}

/**
 * Startup crash-recovery prompt. For each chapter the M1 scan flagged as
 * missing/corrupt, offer a one-click restore from its newest snapshot. The corrupt
 * canon is never touched here — restore goes through restoreVersion (M1).
 */
export function RecoveryDialog({ recoveries, onResolved, onClose }: Props): JSX.Element {
  const t = useT()
  const [busy, setBusy] = useState<string | null>(null)
  const [failed, setFailed] = useState<string | null>(null)

  const restore = async (r: ChapterRecovery): Promise<void> => {
    if (!r.newestVersionId) return
    setBusy(r.chapterId)
    setFailed(null)
    try {
      await window.api.restoreVersion(r.storyId, r.chapterId, r.newestVersionId)
      onResolved(r)
    } catch {
      setFailed(r.chapterId)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="modal-backdrop">
      <div className="modal">
        <h2 className="modal-title">
          <IconAlertTriangle size={20} /> {t.recoveryDialog.title}
        </h2>
        <p>{t.recoveryDialog.intro}</p>
        <ul className="recovery-list">
          {recoveries.map((r) => (
            <li key={`${r.storyId}/${r.chapterId}`}>
              <span>
                {r.chapterTitle ?? r.chapterId} —{' '}
                {r.reason === 'missing'
                  ? t.recoveryDialog.reasonMissing
                  : t.recoveryDialog.reasonCorrupt}
                {failed === r.chapterId && (
                  <span className="recovery-failed">{t.recoveryDialog.restoreFailed}</span>
                )}
              </span>
              {r.newestVersionId ? (
                <button
                  className="linkish"
                  disabled={busy === r.chapterId}
                  onClick={() => void restore(r)}
                >
                  {t.recoveryDialog.restore}
                </button>
              ) : (
                <span className="recovery-lost">{t.recoveryDialog.noSnapshot}</span>
              )}
            </li>
          ))}
        </ul>
        <div className="modal-actions">
          <button className="linkish" onClick={onClose}>
            {t.recoveryDialog.close}
          </button>
        </div>
      </div>
    </div>
  )
}
