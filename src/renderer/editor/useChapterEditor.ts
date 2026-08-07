import { useEffect } from 'react'
import { useEditor, type Editor } from '@tiptap/react'
import { bookExtensions } from './extensions/bookExtensions'
import { useEditorStore } from '@renderer/store/editorStore'
import { useSettingsStore } from '@renderer/store/settingsStore'

const EMPTY_DOC = { type: 'doc', content: [{ type: 'paragraph' }] }

/** Read the current selection as plain text (space-joined across nodes). */
function selectionText(editor: Editor): string {
  const { from, to } = editor.state.selection
  return editor.state.doc.textBetween(from, to, ' ')
}

/**
 * Create the book-scoped TipTap editor, wired to the editorStore. StarterKit is
 * trimmed to the node set the app actually supports; horizontalRule is replaced by
 * SceneDivider. First-line indent is CSS-only (see book.css), not a stored property.
 */
export function useChapterEditor(): Editor | null {
  const applyDocUpdate = useEditorStore((s) => s.applyDocUpdate)
  const setSelection = useEditorStore((s) => s.setSelection)
  const chapterId = useEditorStore((s) => s.chapterId)
  // `settings` can be null before bootstrap loads it, so read optionally.
  const spellLanguages = useSettingsStore((s) => s.settings?.spellLanguages)

  const editor = useEditor({
    extensions: bookExtensions,
    content: useEditorStore.getState().doc ?? EMPTY_DOC,
    editorProps: {
      attributes: { class: 'editor-surface' }
    },
    onUpdate: ({ editor }) => applyDocUpdate(editor.getJSON(), selectionText(editor)),
    onSelectionUpdate: ({ editor }) => setSelection(selectionText(editor))
  })

  // When the open chapter changes (openChapter loaded a new doc), push it into the
  // editor without emitting an update (so it doesn't re-mark the chapter dirty).
  useEffect(() => {
    if (!editor) return
    const doc = useEditorStore.getState().doc
    // TipTap v3: emitUpdate moved into an options object (was a positional boolean
    // in v2). false so re-seeding the loaded doc doesn't re-mark the chapter dirty.
    if (doc) editor.commands.setContent(doc, { emitUpdate: false })
  }, [editor, chapterId])

  // Spellcheck is the device's native checker on web and Chromium's configured
  // checker on desktop; either way, only turn the attribute on when the user has
  // at least one spellcheck language selected. Reactive so a Settings toggle
  // applies to the open chapter without reopening it (mirrors the indent-on
  // toggle in Editor.tsx). Desktop: with the default seeded language this stays
  // 'true' — visually identical to the previous static attribute.
  useEffect(() => {
    if (!editor) return
    const enabled = (spellLanguages?.length ?? 0) > 0
    editor.view.dom.setAttribute('spellcheck', String(enabled))
  }, [editor, spellLanguages])

  return editor
}
