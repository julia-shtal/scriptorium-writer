import { useEffect, useMemo, useState } from 'react'
import { IconFileImport } from '@tabler/icons-react'
import type { ImportFileResult } from '@shared/types'
import { useStoryStore } from '@renderer/store/storyStore'
import { useSettingsStore } from '@renderer/store/settingsStore'
import { useT } from '@renderer/i18n/useT'
import { format } from '@renderer/i18n/strings'
import { plural } from '@renderer/i18n/plural'
import {
  planImportChapters,
  commitImport,
  type ImportMode
} from '@renderer/editor/import/importChapters'

interface Props {
  storyId: string
  file: Extract<ImportFileResult, { canceled: false }>
  onClose: () => void
}

/**
 * M14.1 import preview + confirm. Receives an already-loaded, non-canceled import
 * payload and lets the writer choose granularity (one chapter vs. split by headings),
 * previewing the exact plan it will commit. On confirm it commits *that* previewed plan
 * (never re-plans) through {@link commitImport}, then reloads the chapter list. A failed
 * commit still reloads so any partially-created chapters remain visible/deletable.
 */
export function ImportDialog({ storyId, file, onClose }: Props): JSX.Element {
  const t = useT()
  const language = useSettingsStore((s) => s.settings?.language ?? 'ru')
  const [mode, setMode] = useState<ImportMode>('single')
  const [committing, setCommitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Recompute the plan whenever the mode changes; the same array is what we commit.
  const planned = useMemo(() => planImportChapters(file, mode), [file, mode])

  // Escape closes the dialog (unless a commit is in flight).
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && !committing) onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [committing, onClose])

  const confirm = async (): Promise<void> => {
    setCommitting(true)
    setError(null)
    try {
      await commitImport(storyId, planned)
      await useStoryStore.getState().reload()
      onClose()
    } catch {
      // A split import isn't transactional: some chapters may already be created before
      // a later save fails. Reload (best-effort) so any created chapters appear, then
      // surface the failure inline and let the writer dismiss. The reload is guarded so a
      // secondary reload failure can't swallow the error message.
      try {
        await useStoryStore.getState().reload()
      } catch {
        // ignore — showing the error still matters more than a fresh list here
      }
      setError(t.errors.importFailed)
    } finally {
      // Always clear the in-flight flag so the dialog can never strand disabled. On the
      // success path onClose() has already unmounted, making this a harmless no-op.
      setCommitting(false)
    }
  }

  const count = planned.length
  const showSplitWarning = mode === 'split' && count > 1
  const showLossyNotice = file.kind === 'docx' && file.warnings.length > 0

  return (
    <div className="modal-backdrop" onClick={() => !committing && onClose()}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal-title">
          <IconFileImport size={20} /> {t.importDialog.title}
        </h2>

        <div className="import-modes">
          <label className="import-mode">
            <input
              type="radio"
              name="import-mode"
              checked={mode === 'single'}
              disabled={committing}
              onChange={() => setMode('single')}
            />
            {t.importDialog.modeSingle}
          </label>
          <label className="import-mode">
            <input
              type="radio"
              name="import-mode"
              checked={mode === 'split'}
              disabled={committing}
              onChange={() => setMode('split')}
            />
            {t.importDialog.modeSplit}
          </label>
        </div>

        <div className="import-preview">
          <div className="import-preview-count">
            {format(t.importDialog.previewCount, {
              count: String(count),
              chapters: plural(count, t.plurals.chapters, language)
            })}
          </div>
          <ul className="import-preview-list">
            {planned.map((ch, i) => (
              <li key={`${ch.title}-${i}`}>{ch.title || t.importDialog.untitled}</li>
            ))}
          </ul>
        </div>

        {showSplitWarning && (
          <div className="import-warn">{t.importDialog.splitWarning}</div>
        )}
        {showLossyNotice && (
          <div className="import-warn">{t.importDialog.lossyNotice}</div>
        )}
        {error && <div className="import-warn import-warn--error">{error}</div>}

        <div className="modal-actions">
          <button className="linkish" disabled={committing} onClick={onClose}>
            {t.importDialog.cancel}
          </button>
          <button className="linkish" disabled={committing} onClick={() => void confirm()}>
            {committing ? t.importDialog.committing : t.importDialog.commit}
          </button>
        </div>
      </div>
    </div>
  )
}
