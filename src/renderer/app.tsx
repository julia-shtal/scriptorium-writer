import { useEffect, useState } from 'react'
import { AppFrame } from '@renderer/components/AppFrame'
import { EditorView } from '@renderer/views/EditorView'
import { VersionHistoryView } from '@renderer/views/VersionHistoryView'
import { RecoveryDialog } from '@renderer/components/RecoveryDialog'
import { bootstrapLibrary } from '@renderer/store/bootstrap'
import { useEditorStore } from '@renderer/store/editorStore'
import { useUiStore } from '@renderer/store/uiStore'
import { useAutosaveLifecycle } from '@renderer/editor/useAutosaveLifecycle'
import type { ChapterRecovery } from '@shared/types'

export default function App(): JSX.Element {
  const openChapter = useEditorStore((s) => s.openChapter)
  const configureAutosave = useEditorStore((s) => s.configureAutosave)
  const chapterId = useEditorStore((s) => s.chapterId)
  const activeView = useUiStore((s) => s.activeView)
  const [error, setError] = useState<string | null>(null)
  const [recoveries, setRecoveries] = useState<ChapterRecovery[]>([])

  useAutosaveLifecycle()

  useEffect(() => {
    void (async () => {
      try {
        const settings = await window.api.readSettings()
        configureAutosave({
          debounceMs: settings.autosaveDebounceMs,
          intervalMs: settings.autosaveIntervalMs
        })
        const found = await window.api.scanLibrary()
        if (found.length > 0) setRecoveries(found)
        const { storyId, chapterId } = await bootstrapLibrary()
        await openChapter(storyId, chapterId)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Не удалось открыть библиотеку')
      }
    })()
  }, [openChapter, configureAutosave])

  const handleResolved = async (r: ChapterRecovery): Promise<void> => {
    setRecoveries((rs) => rs.filter((x) => x.chapterId !== r.chapterId))
    try {
      setError(null)
      await openChapter(r.storyId, r.chapterId)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось открыть восстановлённую главу')
    }
  }

  return (
    <AppFrame>
      {error ? (
        <div style={{ padding: 34 }}>Ошибка: {error}</div>
      ) : chapterId ? (
        activeView === 'versions' ? <VersionHistoryView /> : <EditorView />
      ) : (
        <div style={{ padding: 34 }}>Загрузка…</div>
      )}
      {recoveries.length > 0 && (
        <RecoveryDialog
          recoveries={recoveries}
          onResolved={handleResolved}
          onClose={() => setRecoveries([])}
        />
      )}
    </AppFrame>
  )
}
