import { useCallback, useState } from 'react'
import type { ExportFormat } from '@shared/types'
import { useStoryStore } from '@renderer/store/storyStore'

/**
 * Shared export controller for the editor export menu and the chapters list.
 *
 * Owns the single `busy` flag (true across the WHOLE round trip, including the OS
 * save dialog) and the Russian error strings, parameterized by format so call sites
 * don't duplicate them. The story id is read from the story store — story export
 * always targets the ambient open work.
 *
 * A canceled save dialog (`{ canceled: true }`) is silent: no error, and `busy`
 * simply clears. A thrown error sets the matching message. Re-entrant calls are
 * ignored while `busy` so repeated clicks never stack save dialogs.
 */
export interface UseExport {
  exportChapter: (chapterId: string, format: ExportFormat) => Promise<boolean>
  exportStory: (format: ExportFormat) => Promise<boolean>
  busy: boolean
  error: string | null
  clearError: () => void
}

function ext(format: ExportFormat): string {
  return format === 'docx' ? '.docx' : '.md'
}

export function useExport(): UseExport {
  const storyId = useStoryStore((s) => s.story?.id)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const clearError = useCallback(() => setError(null), [])

  const exportChapter = useCallback(
    async (chapterId: string, format: ExportFormat): Promise<boolean> => {
      if (busy || !storyId) return false
      setBusy(true)
      try {
        const res = await window.api.exportChapter(storyId, chapterId, format)
        // Canceled dialog is not an error and not a success — leave state as-is.
        return res.canceled === false
      } catch {
        setError(`Не удалось экспортировать главу в ${ext(format)}.`)
        return false
      } finally {
        setBusy(false)
      }
    },
    [busy, storyId]
  )

  const exportStory = useCallback(
    async (format: ExportFormat): Promise<boolean> => {
      if (busy || !storyId) return false
      setBusy(true)
      try {
        const res = await window.api.exportStory(storyId, format)
        return res.canceled === false
      } catch {
        setError(`Не удалось экспортировать работу в ${ext(format)}.`)
        return false
      } finally {
        setBusy(false)
      }
    },
    [busy, storyId]
  )

  return { exportChapter, exportStory, busy, error, clearError }
}
