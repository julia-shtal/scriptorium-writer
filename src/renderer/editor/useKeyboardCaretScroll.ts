import { useEffect } from 'react'
import type { Editor } from '@tiptap/react'

/**
 * True when the visual viewport height dropped meaningfully between two resize events —
 * i.e. the soft keyboard just opened. Pure + node-testable. The 120px floor ignores
 * minor jitter (URL-bar collapse, animation frames) that is not the keyboard.
 *
 * A delta (prev vs next) — not layout-vs-visual — is used because with
 * `interactive-widget=resizes-content` the layout viewport shrinks together with the
 * visual one, so their difference stays ~0 even while the keyboard is open.
 */
export function keyboardDidOpen(prevHeight: number, nextHeight: number): boolean {
  return prevHeight - nextHeight > 120
}

/**
 * After the soft keyboard opens on a touch device, re-scroll the caret into the (now
 * shorter) viewport once the keyboard animation has settled — ProseMirror's own
 * scrollIntoView can run before the container has resized and miss the real height.
 *
 * Desktop-inert: it only attaches where `visualViewport` exists, and only acts on a
 * genuine keyboard-sized shrink (keyboardDidOpen), which never happens without a soft
 * keyboard. Issues only a scroll — never a document change.
 */
export function useKeyboardCaretScroll(editor: Editor | null): void {
  useEffect(() => {
    const vv = typeof window !== 'undefined' ? window.visualViewport : null
    if (!vv || !editor) return

    let last = vv.height
    let timer: ReturnType<typeof setTimeout> | undefined

    const onResize = (): void => {
      const opened = keyboardDidOpen(last, vv.height)
      last = vv.height
      if (!opened) return
      // Debounce so the re-scroll runs once, after the keyboard finishes animating in.
      clearTimeout(timer)
      timer = setTimeout(() => {
        if (editor.isFocused) editor.commands.scrollIntoView()
      }, 250)
    }

    vv.addEventListener('resize', onResize)
    return () => {
      vv.removeEventListener('resize', onResize)
      clearTimeout(timer)
    }
  }, [editor])
}
