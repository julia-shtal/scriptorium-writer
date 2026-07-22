import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { IconDots } from '@tabler/icons-react'
import { useExport } from '@renderer/export/useExport'

/**
 * Reusable export popover, backed by {@link useExport}.
 *
 * Prop contract (Task 3 consumes this):
 *  - `chapterId`  (required) — the chapter that "chapter export" items target. Story
 *                 export always uses the ambient storyId from the hook.
 *  - `variant`    'full' (default) shows four items under two captions:
 *                    «Экспорт главы» → Глава → .docx / .md
 *                    «Экспорт работы» → Работа → .docx / .md
 *                 'chapter' shows a compact two-item menu (.docx / .md, chapter only,
 *                 no captions, no story section).
 *  - `trigger`    optional custom trigger element rendered INSIDE the menu's own
 *                 <button>. When omitted the full variant uses a ⋯ (IconDots) icon.
 *                 (The button, aria wiring, and popover are always owned here — the
 *                 caller supplies only the inner visual.)
 *  - `triggerLabel` optional accessible label / tooltip for the trigger button.
  - `triggerClassName` optional extra class merged onto the trigger <button> (used by
                 the chapters list to style/hover-reveal the row export control).
 */
export interface ExportMenuProps {
  chapterId: string
  variant?: 'full' | 'chapter'
  trigger?: ReactNode
  triggerLabel?: string
  triggerClassName?: string
}

interface MenuAction {
  key: string
  label: string
  run: () => Promise<boolean>
}

export function ExportMenu({
  chapterId,
  variant = 'full',
  trigger,
  triggerLabel,
  triggerClassName
}: ExportMenuProps): JSX.Element {
  const { exportChapter, exportStory, busy, error, clearError } = useExport()
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([])

  const close = useCallback(
    (returnFocus: boolean) => {
      setOpen(false)
      clearError()
      if (returnFocus) triggerRef.current?.focus()
    },
    [clearError]
  )

  // User-initiated dismissal (Escape / outside-click / re-clicking the trigger). Blocked
  // while an export is in flight: closing mid-round-trip would hide a failure that lands
  // after dismissal, so the popover stays open to surface the error (spec: error renders
  // inside the popover). Success still closes via `close` directly.
  const dismiss = useCallback(
    (returnFocus: boolean) => {
      if (busy) return
      close(returnFocus)
    },
    [busy, close]
  )

  // Outside click (pointerdown) closes the popover.
  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: PointerEvent): void => {
      if (!containerRef.current?.contains(e.target as Node)) dismiss(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open, dismiss])

  // Move DOM focus onto the first item when the menu opens.
  useEffect(() => {
    if (open) itemRefs.current[0]?.focus()
  }, [open])

  const runAction = useCallback(
    async (run: () => Promise<boolean>): Promise<void> => {
      const ok = await run()
      // Success closes the popover (and clears any prior error); a canceled dialog
      // leaves it open so the writer can pick a different target.
      if (ok) close(true)
    },
    [close]
  )

  const focusableItems = (): HTMLButtonElement[] =>
    itemRefs.current.filter((el): el is HTMLButtonElement => el !== null && !el.disabled)

  const focusItem = (index: number): void => {
    const items = focusableItems()
    if (items.length === 0) return
    const wrapped = (index + items.length) % items.length
    items[wrapped]?.focus()
  }

  const onMenuKeyDown = (e: React.KeyboardEvent<HTMLDivElement>): void => {
    const items = focusableItems()
    const current = items.indexOf(document.activeElement as HTMLButtonElement)
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      focusItem(current + 1)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      focusItem(current - 1)
    } else if (e.key === 'Home') {
      e.preventDefault()
      focusItem(0)
    } else if (e.key === 'End') {
      e.preventDefault()
      focusItem(items.length - 1)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      dismiss(true)
    }
  }

  const chapterActions: MenuAction[] = [
    { key: 'ch-docx', label: 'Глава → .docx', run: () => exportChapter(chapterId, 'docx') },
    { key: 'ch-md', label: 'Глава → .md', run: () => exportChapter(chapterId, 'md') }
  ]
  const storyActions: MenuAction[] = [
    { key: 'st-docx', label: 'Работа → .docx', run: (): Promise<boolean> => exportStory('docx') },
    { key: 'st-md', label: 'Работа → .md', run: (): Promise<boolean> => exportStory('md') }
  ]
  const compactActions: MenuAction[] = [
    { key: 'c-docx', label: '.docx', run: () => exportChapter(chapterId, 'docx') },
    { key: 'c-md', label: '.md', run: () => exportChapter(chapterId, 'md') }
  ]

  // itemRefs is rebuilt each render; index counter keeps refs aligned with DOM order.
  itemRefs.current = []
  let itemIndex = 0
  const renderItem = (action: MenuAction): JSX.Element => {
    const idx = itemIndex++
    return (
      <button
        key={action.key}
        ref={(el) => {
          itemRefs.current[idx] = el
        }}
        type="button"
        role="menuitem"
        className="export-menu-item"
        disabled={busy}
        onClick={() => void runAction(action.run)}
      >
        {action.label}
      </button>
    )
  }

  const label = triggerLabel ?? 'Экспорт'

  return (
    <div className="export-menu" ref={containerRef}>
      <button
        ref={triggerRef}
        type="button"
        className={`export-menu-trigger${triggerClassName ? ` ${triggerClassName}` : ''}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        title={label}
        onClick={() => (open ? dismiss(true) : setOpen(true))}
      >
        {trigger ?? <IconDots size={18} />}
      </button>

      {open && (
        <div
          className={`export-menu-popover${variant === 'chapter' ? ' export-menu-popover--compact' : ''}`}
          role="menu"
          onKeyDown={onMenuKeyDown}
        >
          {variant === 'full' ? (
            <>
              <div className="export-menu-caption">Экспорт главы</div>
              {chapterActions.map(renderItem)}
              <div className="export-menu-caption">Экспорт работы</div>
              {storyActions.map(renderItem)}
            </>
          ) : (
            compactActions.map(renderItem)
          )}
          {error && <div className="export-menu-error">{error}</div>}
        </div>
      )}
    </div>
  )
}
