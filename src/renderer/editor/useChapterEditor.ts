import { useEffect } from 'react'
import { useEditor, type Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import TextAlign from '@tiptap/extension-text-align'
import { SceneDivider } from './extensions/SceneDivider'
import { useEditorStore } from '@renderer/store/editorStore'

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

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,
        bulletList: false,
        orderedList: false,
        listItem: false,
        blockquote: false,
        codeBlock: false,
        code: false,
        horizontalRule: false
      }),
      TextAlign.configure({ types: ['paragraph'], alignments: ['left', 'center', 'right'] }),
      SceneDivider
    ],
    content: useEditorStore.getState().doc ?? EMPTY_DOC,
    editorProps: {
      attributes: { class: 'editor-surface', spellcheck: 'true' }
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

  return editor
}
