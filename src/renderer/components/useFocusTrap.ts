/**
 * Minimal focus trap for modal dialogs (M31 ImportLibraryDialog; reusable by the others).
 * On mount it moves focus into the dialog, Tab / Shift+Tab cycle inside it, and on unmount
 * focus returns to whatever had it before (usually the button that opened the dialog).
 * The listener sits on `document`, not the dialog, so focus that fell to <body> (e.g. the
 * focused button just became disabled) is pulled back on the next Tab too.
 */
import { useEffect, type RefObject } from 'react'

const FOCUSABLE =
  'button:not([disabled]), select:not([disabled]), input:not([disabled]), ' +
  'textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'

/**
 * Where Tab should go, given `count` focusable elements and the focused one's `index`
 * (-1 when focus is outside the dialog). null means the browser's own move is fine.
 */
export function trapTarget(count: number, index: number, backwards: boolean): number | null {
  if (count === 0) return null
  if (index === -1) return backwards ? count - 1 : 0
  if (!backwards && index === count - 1) return 0
  if (backwards && index === 0) return count - 1
  return null
}

/**
 * `ref` is the dialog element; give it `tabIndex={-1}` so it can take the initial focus.
 * `resetKey` re-runs the initial focus when the dialog swaps its content (a new view).
 */
export function useFocusTrap(ref: RefObject<HTMLElement>, resetKey?: unknown): void {
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    return () => previous?.focus()
  }, [])

  useEffect(() => {
    const root = ref.current
    if (root && !root.contains(document.activeElement)) root.focus()

    const onKeyDown = (e: KeyboardEvent): void => {
      const el = ref.current
      if (e.key !== 'Tab' || !el) return
      const items = Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE))
      // -1 for focus outside the dialog, or on the dialog element itself.
      const index = items.findIndex((x) => x === document.activeElement)
      const target = trapTarget(items.length, index, e.shiftKey)
      if (items.length === 0) {
        // Nothing to move to (every button disabled mid-apply): keep focus on the dialog.
        e.preventDefault()
        el.focus()
      } else if (target !== null) {
        e.preventDefault()
        items[target]?.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [ref, resetKey])
}
