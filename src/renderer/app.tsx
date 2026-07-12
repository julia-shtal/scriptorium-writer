import { useEffect, useState } from 'react'
import { AppFrame } from '@renderer/components/AppFrame'
import { EditorView } from '@renderer/views/EditorView'
import { VersionHistoryView } from '@renderer/views/VersionHistoryView'
import { LibraryView } from '@renderer/views/LibraryView'
import { ChaptersView } from '@renderer/views/ChaptersView'
import { StoryInfoView } from '@renderer/views/StoryInfoView'
import { NotesView } from '@renderer/views/NotesView'
import { StatisticsView } from '@renderer/views/StatisticsView'
import { SettingsView } from '@renderer/views/SettingsView'
import { RecoveryDialog } from '@renderer/components/RecoveryDialog'
import { bootstrapLibrary } from '@renderer/store/bootstrap'
import { useEditorStore } from '@renderer/store/editorStore'
import { useUiStore } from '@renderer/store/uiStore'
import { useStoryStore } from '@renderer/store/storyStore'
import { useSettingsStore } from '@renderer/store/settingsStore'
import { useAutosaveLifecycle } from '@renderer/editor/useAutosaveLifecycle'
import type { ChapterRecovery } from '@shared/types'

export default function App(): JSX.Element {
  const openChapter = useEditorStore((s) => s.openChapter)
  const chapterId = useEditorStore((s) => s.chapterId)
  const activeView = useUiStore((s) => s.activeView)
  const [error, setError] = useState<string | null>(null)
  const [recoveries, setRecoveries] = useState<ChapterRecovery[]>([])

  useAutosaveLifecycle()

  useEffect(() => {
    void (async () => {
      try {
        const found = await window.api.scanLibrary()
        if (found.length > 0) setRecoveries(found)
        const { storyId, chapterId } = await bootstrapLibrary()
        await openChapter(storyId, chapterId)
        await useStoryStore.getState().load(storyId)
        await useSettingsStore.getState().load()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Не удалось открыть библиотеку')
      }
    })()
  }, [openChapter])

  const handleResolved = async (r: ChapterRecovery): Promise<void> => {
    setRecoveries((rs) => rs.filter((x) => x.chapterId !== r.chapterId))
    try {
      setError(null)
      await openChapter(r.storyId, r.chapterId)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось открыть восстановлённую главу')
    }
  }

  const renderView = (): JSX.Element => {
    switch (activeView) {
      case 'library': return <LibraryView />
      case 'settings': return <SettingsView />
      case 'chapters': return <ChaptersView />
      case 'story': return <StoryInfoView />
      case 'notes': return <NotesView />
      case 'statistics': return <StatisticsView />
      case 'versions': return <VersionHistoryView />
      case 'editor':
      default: return <EditorView />
    }
  }

  return (
    <AppFrame>
      {error ? (
        <div style={{ padding: 34 }}>Ошибка: {error}</div>
      ) : chapterId ? (
        renderView()
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
