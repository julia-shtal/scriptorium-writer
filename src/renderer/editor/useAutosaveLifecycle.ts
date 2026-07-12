// src/renderer/editor/useAutosaveLifecycle.ts
import { useEffect } from 'react'
import { useEditorStore } from '@renderer/store/editorStore'

/**
 * Registers the lifecycle flush triggers that don't originate from typing:
 *  - window `blur` → flush (leaving the app shouldn't strand unsaved edits);
 *  - the main-process quit handshake (window.lifecycle.onQuitFlush) → flush.
 * Mounted once at the app root.
 */
export function useAutosaveLifecycle(): void {
  useEffect(() => {
    const flush = (): Promise<void> => useEditorStore.getState().flush()

    const onBlur = (): void => {
      void flush()
    }
    window.addEventListener('blur', onBlur)

    // onQuitFlush registers a persistent listener in preload; register it once here.
    window.lifecycle.onQuitFlush(async () => {
      await flush()
    })

    return () => {
      window.removeEventListener('blur', onBlur)
      useEditorStore.getState().stopAutosave()
    }
  }, [])
}
