import { useEffect, useState } from 'react'
import { IconHistory, IconMaximize } from '@tabler/icons-react'
import { useChapterEditor } from '@renderer/editor/useChapterEditor'
import { EditorSurface } from '@renderer/editor/Editor'
import { Toolbar } from '@renderer/editor/toolbar/Toolbar'
import { EditorFooter } from '@renderer/editor/EditorFooter'
import { ExportMenu } from '@renderer/editor/ExportMenu'
import { WandActionBar } from '@renderer/editor/cleanup/WandActionBar'
import { useWand } from '@renderer/editor/cleanup/useWand'
import { FindReplaceBar } from '@renderer/editor/find/FindReplaceBar'
import { useFind } from '@renderer/editor/find/useFind'
import { useEditorStore } from '@renderer/store/editorStore'
import { useUiStore } from '@renderer/store/uiStore'
import type { Story } from '@shared/types'

export function EditorView(): JSX.Element {
  const editor = useChapterEditor()
  const wand = useWand(editor)
  const find = useFind(editor)
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

  // Global Find/Replace shortcuts: Ctrl+F opens find, Ctrl+H opens replace, F3/Shift+F3
  // navigate (opening find first if needed).
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (!e.ctrlKey && e.key !== 'F3') return
      if (e.ctrlKey && (e.key === 'f' || e.key === 'F') && !e.altKey && !e.shiftKey) {
        e.preventDefault()
        find.openPanel('find')
      } else if (e.ctrlKey && (e.key === 'h' || e.key === 'H') && !e.altKey && !e.shiftKey) {
        e.preventDefault()
        find.openPanel('replace')
      } else if (e.key === 'F3') {
        e.preventDefault()
        if (!find.open) find.openPanel('find')
        if (e.shiftKey) find.prev()
        else find.next()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [find])

  // No open work (e.g. the library is empty after deleting everything). Don't offer an
  // editable surface that can never save — point the writer to create a work first.
  if (!chapterId) {
    return (
      <div className="editor-empty">
        <p>Нет открытой работы.</p>
        <p>
          Создайте новую работу в{' '}
          <button className="linkish" onClick={() => setActiveView('library')}>
            Библиотеке
          </button>
          , затем начните писать.
        </p>
      </div>
    )
  }

  return (
    <>
      <Toolbar editor={editor} wand={wand} onFind={() => find.openPanel('find')} />
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
        <IconMaximize size={18} title="Режим фокуса" style={{ cursor: 'pointer' }} onClick={toggleFocus} />
        <ExportMenu chapterId={chapterId} triggerLabel="Экспорт" />
      </div>
      <EditorSurface editor={editor} />
      <FindReplaceBar find={find} />
      <WandActionBar wand={wand} />
      <EditorFooter />
    </>
  )
}
