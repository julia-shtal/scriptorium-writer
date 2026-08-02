// src/renderer/editor/cleanup/WandActionBar.tsx
//
// Fixed action bar shown while the wand preview is active (NOT a modal). Confirms or
// cancels the whole diff. Enter = Confirm, Esc = Cancel while it's on screen.

import { useEffect } from 'react'
import { useSettingsStore } from '@renderer/store/settingsStore'
import { useT } from '@renderer/i18n/useT'
import { format } from '@renderer/i18n/strings'
import { plural } from '@renderer/i18n/plural'
import type { WandController } from './useWand'

export function WandActionBar({ wand }: { wand: WandController }): JSX.Element | null {
  const { spans, confirm, cancel } = wand
  const active = spans.length > 0
  const t = useT()
  const language = useSettingsStore((s) => s.settings?.language ?? 'ru')

  useEffect(() => {
    if (!active) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Enter') {
        e.preventDefault()
        confirm()
      } else if (e.key === 'Escape') {
        e.preventDefault()
        cancel()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [active, confirm, cancel])

  if (!active) return null

  return (
    <div className="action-bar action-bar--wand" role="dialog" aria-label={t.editor.wandPreview}>
      <span className="action-bar-count">
        {format(t.editor.wandFound, {
          label: `${spans.length} ${plural(spans.length, t.plurals.fixes, language)}`
        })}
      </span>
      <span className="action-bar-spacer" />
      <button className="action-bar-btn ghost" onClick={cancel} title={t.editor.wandCancelTitle}>
        {t.editor.wandCancel}
      </button>
      <button className="action-bar-btn primary" onClick={confirm} title={t.editor.wandApplyTitle}>
        {t.editor.wandApply}
      </button>
    </div>
  )
}
