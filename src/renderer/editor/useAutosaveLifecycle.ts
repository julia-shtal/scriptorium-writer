// src/renderer/editor/useAutosaveLifecycle.ts
import { useEffect } from 'react'
import { useEditorStore } from '@renderer/store/editorStore'
import { useUiStore } from '@renderer/store/uiStore'

/**
 * Registers the lifecycle flush triggers that don't originate from typing:
 *  - window `blur` → flush (leaving the app shouldn't strand unsaved edits);
 *  - the main-process quit handshake (window.lifecycle.onQuitFlush) → flush.
 *  - the main-process update-downloaded push (M12) → surface the update notice.
 * Mounted once at the app root.
 */
export function useAutosaveLifecycle(): void {
  useEffect(() => {
    const flush = (): Promise<void> => useEditorStore.getState().flush()

    const onBlur = (): void => {
      // Don't flush a decoration-only wand preview to disk on window blur.
      if (useEditorStore.getState().wandPreviewActive) return
      void flush()
    }
    window.addEventListener('blur', onBlur)

    // onQuitFlush registers a persistent listener in preload; register it once here.
    window.lifecycle.onQuitFlush(async () => {
      await flush()
    })

    // Auto-update ready notice (M12): main pushes once a download completes.
    window.lifecycle.onUpdateDownloaded((info) => {
      useUiStore.getState().setUpdateReadyVersion(info.version)
    })

    return () => {
      window.removeEventListener('blur', onBlur)
      useEditorStore.getState().stopAutosave()
    }
  }, [])
}
