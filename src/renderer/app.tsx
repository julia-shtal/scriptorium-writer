import { useEffect, useRef, useState } from 'react'
import { AppFrame } from '@renderer/components/AppFrame'
import { EditorView } from '@renderer/views/EditorView'
import { VersionHistoryView } from '@renderer/views/VersionHistoryView'
import { LibraryView } from '@renderer/views/LibraryView'
import { ChaptersView } from '@renderer/views/ChaptersView'
import { StoryInfoView } from '@renderer/views/StoryInfoView'
import { NotesView } from '@renderer/views/NotesView'
import { StatisticsView } from '@renderer/views/StatisticsView'
import { SearchView } from '@renderer/views/SearchView'
import { SettingsView } from '@renderer/views/SettingsView'
import { RecoveryDialog } from '@renderer/components/RecoveryDialog'
import { UpdateNotice } from '@renderer/components/UpdateNotice'
import { bootstrapLibrary } from '@renderer/store/bootstrap'
import { useEditorStore } from '@renderer/store/editorStore'
import { useUiStore } from '@renderer/store/uiStore'
import { useStoryStore } from '@renderer/store/storyStore'
import { useSettingsStore } from '@renderer/store/settingsStore'
import { useAutosaveLifecycle } from '@renderer/editor/useAutosaveLifecycle'
import { useT } from '@renderer/i18n/useT'
import { format } from '@renderer/i18n/strings'
import { api } from '@renderer/platform'
import type { ChapterRecovery } from '@shared/types'

export default function App(): JSX.Element {
  const t = useT()
  const openChapter = useEditorStore((s) => s.openChapter)
  const activeView = useUiStore((s) => s.activeView)
  const [error, setError] = useState<string | null>(null)
  const [recoveries, setRecoveries] = useState<ChapterRecovery[]>([])
  const [booting, setBooting] = useState(true)

  // The boot effect must run exactly once, so it can't depend on the reactive `t`
  // (a live language switch would otherwise re-scan + re-open the library). Read the
  // current dictionary through a ref instead — only the rare non-Error fallback uses it.
  const tRef = useRef(t)
  tRef.current = t

  useAutosaveLifecycle()

  // Boot exactly once. React 18 StrictMode intentionally double-invokes effects in dev;
  // without this guard the two runs boot concurrently and race on the same files — most
  // visibly, first-run demo seeding writes `story.json` while the second boot reads it
  // mid-`rename`, surfacing as "failed to read story «демо»". The boot is genuinely a
  // once-per-load operation (seed / open last chapter), so guarding it is correct, not a
  // workaround for a non-idempotent effect.
  const bootedRef = useRef(false)
  useEffect(() => {
    if (bootedRef.current) return
    bootedRef.current = true
    void (async () => {
      try {
        const found = await api().scanLibrary()
        if (found.length > 0) setRecoveries(found)
        const { storyId, chapterId } = await bootstrapLibrary()
        if (storyId && chapterId) {
          await openChapter(storyId, chapterId)
          await useStoryStore.getState().load(storyId)
        } else {
          // Empty library (nothing seeded): land on the Library view.
          useUiStore.getState().setActiveView('library')
        }
        await useSettingsStore.getState().load()
      } catch (err) {
        setError(err instanceof Error ? err.message : tRef.current.errors.openLibraryFailed)
      } finally {
        setBooting(false)
      }
    })()
  }, [openChapter])

  const handleResolved = async (r: ChapterRecovery): Promise<void> => {
    setRecoveries((rs) => rs.filter((x) => x.chapterId !== r.chapterId))
    try {
      setError(null)
      await openChapter(r.storyId, r.chapterId)
    } catch (err) {
      setError(err instanceof Error ? err.message : t.errors.openRecoveredChapterFailed)
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
      case 'search': return <SearchView />
      case 'versions': return <VersionHistoryView />
      case 'editor':
      default: return <EditorView />
    }
  }

  return (
    <AppFrame>
      {error ? (
        <div style={{ padding: 34 }}>{format(t.errors.fatalPrefix, { message: error })}</div>
      ) : booting ? (
        <div style={{ padding: 34 }}>{t.errors.booting}</div>
      ) : (
        renderView()
      )}
      {recoveries.length > 0 && (
        <RecoveryDialog
          recoveries={recoveries}
          onResolved={handleResolved}
          onClose={() => setRecoveries([])}
        />
      )}
      <UpdateNotice />
    </AppFrame>
  )
}
