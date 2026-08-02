import { useEffect } from 'react'

interface ConfirmDialogProps {
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  onConfirm: () => void
  onCancel: () => void
}

/**
 * M25.4 shared destructive-action confirmation modal. Purely presentational/controlled:
 * it does not know what it's confirming (story delete, chapter delete, ...) — the caller
 * owns open/close state and performs the actual action. Replaces the old inline
 * "Удалить? да/нет" row spans for Library and Chapters with an explicit modal so a
 * misclick can't soft-delete something.
 */
export function ConfirmDialog({
  title,
  message,
  confirmLabel = 'Удалить',
  cancelLabel = 'Отмена',
  onConfirm,
  onCancel
}: ConfirmDialogProps): JSX.Element {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onCancel()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onCancel])

  return (
    <div className="modal-backdrop" onClick={() => onCancel()}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal-title">{title}</h2>
        <p>{message}</p>
        <div className="modal-actions">
          <button className="linkish" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button className="modal-danger" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
