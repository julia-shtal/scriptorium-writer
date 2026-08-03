import { useEffect, useState } from 'react'
import { EditorContent, useEditor } from '@tiptap/react'
import { IconArrowBackUp, IconHistory, IconRestore } from '@tabler/icons-react'
import { bookExtensions } from '@renderer/editor/extensions/bookExtensions'
import { useEditorStore } from '@renderer/store/editorStore'
import { useUiStore } from '@renderer/store/uiStore'
import { useSettingsStore } from '@renderer/store/settingsStore'
import { useT } from '@renderer/i18n/useT'
import { format } from '@renderer/i18n/strings'
import { plural } from '@renderer/i18n/plural'
import { api } from '@renderer/platform'
import type { VersionSummary } from '@shared/types'
import { formatDateTime } from './format'

const EMPTY_DOC = { type: 'doc', content: [{ type: 'paragraph' }] }

export function VersionHistoryView(): JSX.Element {
  const storyId = useEditorStore((s) => s.storyId)
  const chapterId = useEditorStore((s) => s.chapterId)
  const openChapter = useEditorStore((s) => s.openChapter)
  const setActiveView = useUiStore((s) => s.setActiveView)
  const language = useSettingsStore((s) => s.settings?.language ?? 'ru')
  const t = useT()

  const [versions, setVersions] = useState<VersionSummary[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const previewEditor = useEditor({
    extensions: bookExtensions,
    editable: false,
    content: EMPTY_DOC,
    editorProps: { attributes: { class: 'editor-surface' } }
  })

  useEffect(() => {
    if (!storyId || !chapterId) return
    void api().listVersions(storyId, chapterId).then(setVersions)
  }, [storyId, chapterId])

  if (!storyId || !chapterId) {
    return <div style={{ padding: 34 }}>{t.versions.noChapter}</div>
  }

  const preview = async (versionId: string): Promise<void> => {
    const ch = await api().readVersion(storyId, chapterId, versionId)
    setSelected(versionId)
    previewEditor?.commands.setContent(ch.doc, { emitUpdate: false })
  }

  const restore = async (versionId: string): Promise<void> => {
    setBusy(true)
    try {
      await api().restoreVersion(storyId, chapterId, versionId)
      await openChapter(storyId, chapterId) // reload the new canon into the editor
      setActiveView('editor')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="history-view">
      <div className="history-head">
        <span className="history-title">
          <IconHistory size={18} /> {format(t.versions.heading, { count: String(versions.length) })}
        </span>
        <button className="linkish" onClick={() => setActiveView('editor')}>
          <IconArrowBackUp size={16} /> {t.versions.toEditor}
        </button>
      </div>
      <div className="history-body">
        <ul className="history-list">
          {versions.map((v) => (
            <li
              key={v.versionId}
              className={v.versionId === selected ? 'active' : ''}
              onClick={() => void preview(v.versionId)}
            >
              <span>{formatDateTime(v.savedAt, language)}</span>
              <span className="history-words">{v.wordCount} {plural(v.wordCount, t.plurals.words, language)}</span>
              <button
                className="linkish"
                disabled={busy}
                onClick={(e) => {
                  e.stopPropagation()
                  void restore(v.versionId)
                }}
              >
                <IconRestore size={15} /> {t.versions.restore}
              </button>
            </li>
          ))}
          {versions.length === 0 && <li className="history-empty">{t.versions.empty}</li>}
        </ul>
        <div className="history-preview">
          {selected ? <EditorContent editor={previewEditor} /> : <p>{t.versions.selectPrompt}</p>}
        </div>
      </div>
    </div>
  )
}
