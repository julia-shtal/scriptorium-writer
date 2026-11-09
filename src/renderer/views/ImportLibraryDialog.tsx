import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { IconFileImport } from '@tabler/icons-react'
import type {
  ImportDecision,
  ImportInvalidReason,
  ImportStoryPreview,
  ImportStorySide,
  ImportStoryStatus,
  LibraryImportPreview
} from '@shared/types'
import { allowedDecisions } from '@shared/library-import-rules'
import { api } from '@renderer/platform'
import { useSettingsStore } from '@renderer/store/settingsStore'
import { useT } from '@renderer/i18n/useT'
import { format, type Dictionary } from '@renderer/i18n/strings'
import { plural } from '@renderer/i18n/plural'
import {
  countByStatus,
  initialDecisions,
  localIsNewer,
  replaceCount,
  wouldChange
} from '@renderer/import/import-summary'
import {
  runLibraryImport,
  UnsavedChangesError,
  type LibraryImportOutcome
} from '@renderer/import/library-import-flow'
import { useUiStore } from '@renderer/store/uiStore'
import { useFocusTrap } from '@renderer/components/useFocusTrap'
import { formatDate, type UiLanguage } from './format'

interface Props {
  preview: Extract<LibraryImportPreview, { canceled: false }>
  onClose: () => void
}

type Phase = 'choose' | 'applying' | 'done'

// Typed lookups: a new status, decision or reason code fails to compile until it has text.
const statusLabel = (t: Dictionary): Record<ImportStoryStatus, string> => ({
  new: t.importLibrary.statusNew,
  identical: t.importLibrary.statusIdentical,
  conflict: t.importLibrary.statusConflict,
  invalid: t.importLibrary.statusInvalid
})
const decisionLabel = (t: Dictionary): Record<ImportDecision, string> => ({
  import: t.importLibrary.decisionImport,
  skip: t.importLibrary.decisionSkip,
  keepBoth: t.importLibrary.decisionKeepBoth,
  replace: t.importLibrary.decisionReplace
})
const invalidLabel = (t: Dictionary): Record<ImportInvalidReason, string> => ({
  missingStoryJson: t.importLibrary.invalidMissingStoryJson,
  badStoryJson: t.importLibrary.invalidBadStoryJson,
  idMismatch: t.importLibrary.invalidIdMismatch,
  storySchemaTooNew: t.importLibrary.invalidStorySchemaTooNew,
  badChapter: t.importLibrary.invalidBadChapter,
  chapterSchemaTooNew: t.importLibrary.invalidChapterSchemaTooNew,
  badNotes: t.importLibrary.invalidBadNotes,
  notesSchemaTooNew: t.importLibrary.invalidNotesSchemaTooNew
})

function sideMeta(side: ImportStorySide, t: Dictionary, language: UiLanguage): string {
  return format(t.importLibrary.sideMeta, {
    chapters: `${side.chapterCount} ${plural(side.chapterCount, t.plurals.chapters, language)}`,
    words: `${side.wordCount} ${plural(side.wordCount, t.plurals.words, language)}`,
    // '' means the local story.json was unreadable; never render "Invalid Date".
    date: side.updatedAt ? formatDate(side.updatedAt, language) : t.importLibrary.unknownDate
  })
}

/**
 * M31 library import: one row per archived story with its status and a decision, then a
 * result view. The heavy lifting (flush, close, apply, reopen, re-scan) is
 * {@link runLibraryImport}; this component only collects decisions and reports.
 */
export function ImportLibraryDialog({ preview, onClose }: Props): JSX.Element {
  const t = useT()
  const language = useSettingsStore((s) => s.settings?.language ?? 'ru')
  const [decisions, setDecisions] = useState<Record<string, ImportDecision>>(() =>
    initialDecisions(preview.stories)
  )
  const [phase, setPhase] = useState<Phase>('choose')
  const [outcome, setOutcome] = useState<LibraryImportOutcome | null>(null)
  const [error, setError] = useState<string | null>(null)

  const counts = useMemo(() => countByStatus(preview.stories), [preview.stories])
  const titleOf = (id: string): string => preview.stories.find((s) => s.id === id)?.incoming.title || id
  const replaces = replaceCount(decisions)
  const busy = phase === 'applying'
  const titleId = useId()
  const modalRef = useRef<HTMLDivElement>(null)
  // Re-focus when the result view replaces the decision view (a different element).
  useFocusTrap(modalRef, phase === 'done')

  // Every way out releases the parsed archive held on the data side. Discard is
  // idempotent, so this is also right after an apply that already consumed it.
  // Post-import recoveries are raised only here, once the result has been read, so
  // RecoveryDialog never opens on top of it. An empty scan leaves the list alone.
  const close = useCallback((): void => {
    void api().discardLibraryImport(preview.importId).catch(() => {})
    onClose()
    if (outcome && outcome.recoveries.length > 0) useUiStore.getState().setRecoveries(outcome.recoveries)
  }, [preview.importId, onClose, outcome])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && !busy) close()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [busy, close])

  const confirm = async (): Promise<void> => {
    setPhase('applying')
    setError(null)
    try {
      setOutcome(await runLibraryImport(preview.importId, decisions))
      setPhase('done')
    } catch (err) {
      // Not discarded, so the writer can retry. If apply had already consumed the import,
      // the retry gets NOT_FOUND and this same message.
      setError(err instanceof UnsavedChangesError ? t.errors.importLibraryUnsaved : t.errors.importLibraryFailed)
      setPhase('choose')
    }
  }

  const renderRow = (row: ImportStoryPreview): JSX.Element => {
    const options = allowedDecisions(row.status)
    const decision = decisions[row.id] ?? options[0]
    return (
      <li key={row.id} className="import-library-row">
        <span className="import-library-title">{row.incoming.title || row.id}</span>
        <span className={`import-library-badge import-library-badge--${row.status}`}>
          {statusLabel(t)[row.status]}
        </span>
        <select
          className="import-library-select"
          aria-label={`${t.importLibrary.decisionLabel}: ${row.incoming.title || row.id}`}
          value={decision}
          // One choice (Identical, Invalid) is a locked row, not a menu.
          disabled={busy || options.length < 2}
          onChange={(e) => {
            const next = e.target.value as ImportDecision
            setDecisions((d) => ({ ...d, [row.id]: next }))
          }}
        >
          {options.map((o) => (
            <option key={o} value={o}>
              {decisionLabel(t)[o]}
            </option>
          ))}
        </select>
        <div className="import-library-side">
          {t.importLibrary.incoming}: {sideMeta(row.incoming, t, language)}
        </div>
        {row.local && (
          <div className="import-library-side">
            {t.importLibrary.local}
            {row.local.title !== row.incoming.title ? ` «${row.local.title}»` : ''}:{' '}
            {sideMeta(row.local, t, language)}
          </div>
        )}
        {row.invalidReason && (
          <div className="import-warn import-warn--error">{invalidLabel(t)[row.invalidReason]}</div>
        )}
        {row.warnings.map((w) => (
          <div key={`${w.kind}-${w.chapterId}`} className="import-warn">
            {format(t.importLibrary.missingChapter, { id: w.chapterId })}
          </div>
        ))}
        {decision === 'replace' && (
          <div className="import-warn import-warn--error">
            {t.importLibrary.replaceWarning}
            {localIsNewer(row) && ` ${t.importLibrary.replaceLocalNewer}`}
          </div>
        )}
      </li>
    )
  }

  if (phase === 'done' && outcome) {
    const { result } = outcome
    // A partial failure must never read as success: its own title, and every failure listed.
    const partial = result.failed.length > 0
    return (
      <div className="modal-backdrop" onClick={close}>
        <div
          className="modal import-library"
          ref={modalRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          tabIndex={-1}
          onClick={(e) => e.stopPropagation()}
        >
          <h2 className="modal-title" id={titleId}>
            <IconFileImport size={20} />{' '}
            {partial ? t.importLibrary.resultTitlePartial : t.importLibrary.resultTitle}
          </h2>
          <div className={partial ? 'import-warn import-warn--error' : 'import-library-foot'}>
            {format(t.importLibrary.resultCounts, {
              imported: String(result.imported.length),
              skipped: String(result.skipped.length),
              failed: String(result.failed.length)
            })}
          </div>
          {partial && (
            <ul className="import-library-failed">
              {result.failed.map((f) => (
                <li key={f.id}>
                  {format(t.importLibrary.resultFailedItem, { title: titleOf(f.id) })}
                  <div className="import-library-side">
                    {format(t.importLibrary.resultFailedDetail, { reason: f.reason })}
                  </div>
                </li>
              ))}
            </ul>
          )}
          <div className="modal-actions">
            <button className="linkish" onClick={close}>
              {t.importLibrary.close}
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="modal-backdrop" onClick={() => !busy && close()}>
      <div
        className="modal import-library"
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="modal-title" id={titleId}>
          <IconFileImport size={20} /> {t.importLibrary.title}
        </h2>
        <div className="import-library-head">
          {format(t.importLibrary.fromFile, { name: preview.fileName })}
          {preview.manifest === null && <div>{t.importLibrary.legacyArchive}</div>}
        </div>

        {preview.stories.length > 0 ? (
          <ul className="import-library-list">{preview.stories.map(renderRow)}</ul>
        ) : (
          <div className="import-warn">{t.importLibrary.empty}</div>
        )}

        <div className="import-library-foot">
          {format(t.importLibrary.summary, {
            new: String(counts.new),
            conflict: String(counts.conflict),
            identical: String(counts.identical),
            invalid: String(counts.invalid)
          })}
          {preview.ignoredEntries > 0 && (
            <div>{format(t.importLibrary.ignored, { count: String(preview.ignoredEntries) })}</div>
          )}
        </div>
        {error && <div className="import-warn import-warn--error">{error}</div>}

        <div className="modal-actions">
          <button className="linkish" disabled={busy} onClick={close}>
            {t.importLibrary.cancel}
          </button>
          <button className="linkish" disabled={busy || !wouldChange(decisions)} onClick={() => void confirm()}>
            {busy
              ? t.importLibrary.applying
              : replaces > 0
                ? format(t.importLibrary.confirmWithReplace, {
                    count: String(replaces),
                    stories: plural(replaces, t.plurals.storiesAcc, language)
                  })
                : t.importLibrary.confirm}
          </button>
        </div>
      </div>
    </div>
  )
}
