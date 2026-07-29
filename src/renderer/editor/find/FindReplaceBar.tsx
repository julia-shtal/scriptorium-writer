// src/renderer/editor/find/FindReplaceBar.tsx
//
// M15 Find & Replace bar — a full-width action bar rendered below the editor surface
// (sibling of WandActionBar), never a modal/overlay, so it shrinks the surface instead
// of covering matches. Panel-local Enter/Shift+Enter/Ctrl+Alt+Enter/Esc are installed
// only while open; global Ctrl+F/Ctrl+H/F3 live in EditorView. The wand ⇄ find mutual
// exclusion (useWand/useFind) guarantees only one Enter/Esc owner is ever mounted.

import { useEffect, useRef } from 'react'
import { IconChevronUp, IconChevronDown, IconX } from '@tabler/icons-react'
import type { FindController } from './useFind'

const ICON = 16

export function FindReplaceBar({ find }: { find: FindController }): JSX.Element | null {
  const {
    open, query, replacement, options, matches, activeIndex, replacedNote, focusTarget,
    closePanel, setQuery, setReplacement, setOptions, next, prev, replaceCurrent, replaceAll
  } = find

  const findRef = useRef<HTMLInputElement>(null)
  const replaceRef = useRef<HTMLInputElement>(null)

  // Autofocus + select the requested field on open.
  useEffect(() => {
    if (!open) return
    const el = focusTarget === 'replace' ? replaceRef.current : findRef.current
    el?.focus()
    el?.select()
  }, [open, focusTarget])

  // Panel-local keyboard, installed only while open.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        closePanel()
      } else if (e.key === 'Enter' && e.ctrlKey && e.altKey) {
        e.preventDefault()
        replaceAll()
      } else if (e.key === 'Enter' && e.shiftKey) {
        e.preventDefault()
        prev()
      } else if (e.key === 'Enter') {
        e.preventDefault()
        next()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, closePanel, next, prev, replaceAll])

  if (!open) return null

  const hasQuery = query.trim().length > 0
  const noMatches = hasQuery && matches.length === 0
  const navDisabled = matches.length === 0

  return (
    <div className="action-bar action-bar--find" role="dialog" aria-label="Найти и заменить">
      <input
        ref={findRef}
        className="find-input"
        placeholder="Найти"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <input
        ref={replaceRef}
        className="find-input"
        placeholder="Заменить на"
        value={replacement}
        onChange={(e) => setReplacement(e.target.value)}
      />
      <button
        className={`action-bar-btn ghost${options.caseSensitive ? ' active' : ''}`}
        title="Учитывать регистр"
        onClick={() => setOptions({ caseSensitive: !options.caseSensitive })}
      >Аа</button>
      <button
        className={`action-bar-btn ghost${options.wholeWord ? ' active' : ''}`}
        title="Слово целиком"
        onClick={() => setOptions({ wholeWord: !options.wholeWord })}
      >|Слово|</button>

      <span className="action-bar-count">
        {replacedNote !== null
          ? `Заменено: ${replacedNote}`
          : noMatches
            ? <span className="action-bar-count--muted">Нет совпадений</span>
            : hasQuery
              ? `${activeIndex + 1} / ${matches.length}`
              : ''}
      </span>

      <button className="action-bar-btn ghost" title="Предыдущее (Shift+Enter / Shift+F3)"
        disabled={navDisabled} onClick={prev}><IconChevronUp size={ICON} /></button>
      <button className="action-bar-btn ghost" title="Следующее (Enter / F3)"
        disabled={navDisabled} onClick={next}><IconChevronDown size={ICON} /></button>

      <button className="action-bar-btn ghost" title="Заменить"
        disabled={navDisabled} onClick={replaceCurrent}>Заменить</button>
      <button className="action-bar-btn ghost" title="Заменить всё (Ctrl+Alt+Enter)"
        disabled={navDisabled} onClick={replaceAll}>Заменить всё</button>

      <span className="action-bar-spacer" />
      <button className="action-bar-btn ghost" title="Закрыть (Esc)" onClick={closePanel}>
        <IconX size={ICON} />
      </button>
    </div>
  )
}
