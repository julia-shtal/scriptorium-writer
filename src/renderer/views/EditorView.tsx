import { useEffect, useState } from 'react'
import { IconHistory, IconMaximize, IconLayoutBottombarCollapse } from '@tabler/icons-react'
import { useChapterEditor } from '@renderer/editor/useChapterEditor'
import { EditorSurface } from '@renderer/editor/Editor'
import { Toolbar } from '@renderer/editor/toolbar/Toolbar'
import { EditorFooter } from '@renderer/editor/EditorFooter'
import { ExportMenu } from '@renderer/editor/ExportMenu'
import { WandActionBar } from '@renderer/editor/cleanup/WandActionBar'
import { useWand } from '@renderer/editor/cleanup/useWand'
import { FindReplaceBar } from '@renderer/editor/find/FindReplaceBar'
import { useFind } from '@renderer/editor/find/useFind'
import { useKeyboardCaretScroll } from '@renderer/editor/useKeyboardCaretScroll'
import { useEditorStore } from '@renderer/store/editorStore'
import { useUiStore } from '@renderer/store/uiStore'
import { useSettingsStore } from '@renderer/store/settingsStore'
import { useT } from '@renderer/i18n/useT'
import { api } from '@renderer/platform'
import type { Story } from '@shared/types'

export function EditorView(): JSX.Element {
  const editor = useChapterEditor()
  const wand = useWand(editor)
  const find = useFind(editor)
  useKeyboardCaretScroll(editor)
  const storyId = useEditorStore((s) => s.storyId)
  const chapterId = useEditorStore((s) => s.chapterId)
  const title = useEditorStore((s) => s.title)
  const setTitle = useEditorStore((s) => s.setTitle)
  const openChapter = useEditorStore((s) => s.openChapter)
  const toggleFocus = useUiStore((s) => s.toggleFocus)
  const setActiveView = useUiStore((s) => s.setActiveView)
  const hideFooterInfo = useSettingsStore((s) => s.settings?.hideEditorFooterInfo ?? false)
  const updateSettings = useSettingsStore((s) => s.update)
  const t = useT()

  // Chapter switcher: list the open story's chapters (title-by-id).
  const [chapters, setChapters] = useState<{ id: string; title: string }[]>([])
  useEffect(() => {
    if (!storyId) return
    void api().readStory(storyId).then(async (story: Story) => {
      const rows = await Promise.all(
        story.chapterOrder.map(async (id) => {
          const ch = await api().readChapter(storyId, id)
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
        <p>{t.editor.emptyTitle}</p>
        <p>
          {t.editor.emptyBefore}
          <button className="linkish" onClick={() => setActiveView('library')}>
            {t.editor.emptyLink}
          </button>
          {t.editor.emptyAfter}
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
          title={t.editor.versionHistory}
          style={{ cursor: 'pointer' }}
          onClick={() => setActiveView('versions')}
        />
        <IconMaximize size={18} title={t.editor.focusMode} style={{ cursor: 'pointer' }} onClick={toggleFocus} />
        <IconLayoutBottombarCollapse
          size={18}
          title={t.editor.minimalFooter}
          style={{ cursor: 'pointer' }}
          onClick={() => void updateSettings({ hideEditorFooterInfo: !hideFooterInfo })}
        />
        <ExportMenu chapterId={chapterId} triggerLabel={t.editor.export} />
      </div>
      <EditorSurface editor={editor} />
      <FindReplaceBar find={find} />
      <WandActionBar wand={wand} />
      <EditorFooter />
    </>
  )
}
