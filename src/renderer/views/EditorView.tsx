import { useEffect, useState } from 'react'
import { IconHistory, IconMaximize } from '@tabler/icons-react'
import { useChapterEditor } from '@renderer/editor/useChapterEditor'
import { EditorSurface } from '@renderer/editor/Editor'
import { Toolbar } from '@renderer/editor/toolbar/Toolbar'
import { EditorFooter } from '@renderer/editor/EditorFooter'
import { useEditorStore } from '@renderer/store/editorStore'
import { useUiStore } from '@renderer/store/uiStore'
import type { Story } from '@shared/types'

export function EditorView(): JSX.Element {
  const editor = useChapterEditor()
  const storyId = useEditorStore((s) => s.storyId)
  const chapterId = useEditorStore((s) => s.chapterId)
  const title = useEditorStore((s) => s.title)
  const setTitle = useEditorStore((s) => s.setTitle)
  const openChapter = useEditorStore((s) => s.openChapter)
  const toggleFocus = useUiStore((s) => s.toggleFocus)
  const setActiveView = useUiStore((s) => s.setActiveView)

  // Chapter switcher: list the open story's chapters (title-by-id).
  const [chapters, setChapters] = useState<{ id: string; title: string }[]>([])
  useEffect(() => {
    if (!storyId) return
    void window.api.readStory(storyId).then(async (story: Story) => {
      const rows = await Promise.all(
        story.chapterOrder.map(async (id) => {
          const ch = await window.api.readChapter(storyId, id)
          return { id: ch.id, title: ch.title }
        })
      )
      setChapters(rows)
    })
  }, [storyId, chapterId])

  return (
    <>
      <Toolbar editor={editor} />
      <div className="chapter-head">
        <input
          className="chapter-title-input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        {chapters.length > 1 && (
          <select
            className="chapter-switcher"
            value={chapterId ?? ''}
            onChange={(e) => storyId && void openChapter(storyId, e.target.value)}
          >
            {chapters.map((c) => (
              <option key={c.id} value={c.id}>{c.title}</option>
            ))}
          </select>
        )}
        <IconHistory
          size={18}
          title="История версий"
          style={{ cursor: 'pointer' }}
          onClick={() => setActiveView('versions')}
        />
        {/* TODO(M6): replaced by the sidebar Version-history entry + badge. */}
        <IconMaximize size={18} title="Режим фокуса" style={{ cursor: 'pointer' }} onClick={toggleFocus} />
      </div>
      <EditorSurface editor={editor} />
      <EditorFooter />
    </>
  )
}
