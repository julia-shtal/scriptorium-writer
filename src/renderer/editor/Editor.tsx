import { useEffect } from 'react'
import { EditorContent, type Editor } from '@tiptap/react'
import { useEditorStore } from '@renderer/store/editorStore'

/** The parchment writing page. Applies the per-chapter indent view preference. */
export function EditorSurface({ editor }: { editor: Editor | null }): JSX.Element {
  const indentOn = useEditorStore((s) => s.indentOn)

  useEffect(() => {
    if (!editor) return
    editor.view.dom.classList.toggle('indent-on', indentOn)
  }, [editor, indentOn])

  // The wrapper div TipTap's EditorContent renders sits between .page's flex column
  // and the .editor-surface (the ProseMirror element). It must be a transparent
  // flex-column passthrough, otherwise it sizes to content and .editor-surface's
  // flex/overflow scroll region never engages (see .editor-scroll-host in book.css).
  return <EditorContent editor={editor} className="editor-scroll-host" />
}
