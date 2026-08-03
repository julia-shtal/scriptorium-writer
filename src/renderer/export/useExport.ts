import { useCallback, useState } from 'react'
import type { ExportFormat } from '@shared/types'
import { useStoryStore } from '@renderer/store/storyStore'
import { useT } from '@renderer/i18n/useT'
import { format } from '@renderer/i18n/strings'
import { api } from '@renderer/platform'

/**
 * Shared export controller for the editor export menu and the chapters list.
 *
 * Owns the single `busy` flag (true across the WHOLE round trip, including the OS
 * save dialog) and the localized error strings (via useT), parameterized by format so
 * call sites don't duplicate them. The story id is read from the story store — story export
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
  const t = useT()
  const storyId = useStoryStore((s) => s.story?.id)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const clearError = useCallback(() => setError(null), [])

  const exportChapter = useCallback(
    async (chapterId: string, fmt: ExportFormat): Promise<boolean> => {
      if (busy || !storyId) return false
      setBusy(true)
      try {
        const res = await api().exportChapter(storyId, chapterId, fmt)
        // Canceled dialog is not an error and not a success — leave state as-is.
        return res.canceled === false
      } catch {
        setError(format(t.errors.exportChapterFailed, { ext: ext(fmt) }))
        return false
      } finally {
        setBusy(false)
      }
    },
    [busy, storyId, t]
  )

  const exportStory = useCallback(
    async (fmt: ExportFormat): Promise<boolean> => {
      if (busy || !storyId) return false
      setBusy(true)
      try {
        const res = await api().exportStory(storyId, fmt)
        return res.canceled === false
      } catch {
        setError(format(t.errors.exportStoryFailed, { ext: ext(fmt) }))
        return false
      } finally {
        setBusy(false)
      }
    },
    [busy, storyId, t]
  )

  return { exportChapter, exportStory, busy, error, clearError }
}
