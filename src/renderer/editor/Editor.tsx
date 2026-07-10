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

  return <EditorContent editor={editor} />
}
