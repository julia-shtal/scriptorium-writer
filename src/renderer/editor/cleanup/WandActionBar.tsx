// src/renderer/editor/cleanup/WandActionBar.tsx
//
// Fixed action bar shown while the wand preview is active (NOT a modal). Confirms or
// cancels the whole diff. Enter = Confirm, Esc = Cancel while it's on screen.

import { useEffect } from 'react'
import type { WandController } from './useWand'

/** Russian pluralization for "N исправлений". */
function fixLabel(n: number): string {
  const mod10 = n % 10
  const mod100 = n % 100
  let word = 'исправлений'
  if (mod10 === 1 && mod100 !== 11) word = 'исправление'
  else if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) word = 'исправления'
  return `${n} ${word}`
}

export function WandActionBar({ wand }: { wand: WandController }): JSX.Element | null {
  const { spans, confirm, cancel } = wand
  const active = spans.length > 0

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
    <div className="action-bar action-bar--wand" role="dialog" aria-label="Предпросмотр чистки текста">
      <span className="action-bar-count">Найдено {fixLabel(spans.length)}</span>
      <span className="action-bar-spacer" />
      <button className="action-bar-btn ghost" onClick={cancel} title="Отмена (Esc)">
        Отмена
      </button>
      <button className="action-bar-btn primary" onClick={confirm} title="Применить (Enter)">
        Применить
      </button>
    </div>
  )
}
