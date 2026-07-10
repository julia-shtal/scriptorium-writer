import { useEffect, useState } from 'react'
import { AppFrame } from '@renderer/components/AppFrame'
import { EditorView } from '@renderer/views/EditorView'
import { bootstrapLibrary } from '@renderer/store/bootstrap'
import { useEditorStore } from '@renderer/store/editorStore'

export default function App(): JSX.Element {
  const openChapter = useEditorStore((s) => s.openChapter)
  const chapterId = useEditorStore((s) => s.chapterId)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void (async () => {
      try {
        const { storyId, chapterId } = await bootstrapLibrary()
        await openChapter(storyId, chapterId)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Не удалось открыть библиотеку')
      }
    })()
  }, [openChapter])

  return (
    <AppFrame>
      {error ? (
        <div style={{ padding: 34 }}>Ошибка: {error}</div>
      ) : chapterId ? (
        <EditorView />
      ) : (
        <div style={{ padding: 34 }}>Загрузка…</div>
      )}
    </AppFrame>
  )
}
