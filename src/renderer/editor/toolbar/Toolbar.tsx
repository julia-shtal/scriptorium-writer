import type { Editor } from '@tiptap/react'
import {
  IconAlignLeft,
  IconAlignCenter,
  IconAlignRight,
  IconArrowBackUp,
  IconArrowForwardUp,
  IconWand
} from '@tabler/icons-react'
import { useEditorStore } from '@renderer/store/editorStore'

const ICON = 18

export function Toolbar({ editor }: { editor: Editor | null }): JSX.Element | null {
  const indentOn = useEditorStore((s) => s.indentOn)
  const toggleIndent = useEditorStore((s) => s.toggleIndent)
  if (!editor) return null

  const mark = (name: string): string => (editor.isActive(name) ? 'toolbar-btn active' : 'toolbar-btn')
  const align = (a: string): string =>
    editor.isActive({ textAlign: a }) ? 'toolbar-btn active' : 'toolbar-btn'

  return (
    <div className="toolbar">
      <button className={`${mark('italic')} italic`} title="Курсив"
        onClick={() => editor.chain().focus().toggleItalic().run()}>I</button>
      <button className={`${mark('bold')} bold`} title="Полужирный"
        onClick={() => editor.chain().focus().toggleBold().run()}>B</button>
      <button className={`${mark('strike')} strike`} title="Зачёркнутый"
        onClick={() => editor.chain().focus().toggleStrike().run()}>S</button>

      <span className="toolbar-sep" />
      <button className={align('left')} title="По левому краю"
        onClick={() => editor.chain().focus().setTextAlign('left').run()}><IconAlignLeft size={ICON} /></button>
      <button className={align('center')} title="По центру"
        onClick={() => editor.chain().focus().setTextAlign('center').run()}><IconAlignCenter size={ICON} /></button>
      <button className={align('right')} title="По правому краю"
        onClick={() => editor.chain().focus().setTextAlign('right').run()}><IconAlignRight size={ICON} /></button>

      <span className="toolbar-sep" />
      <button className="toolbar-btn" title="Отменить" disabled={!editor.can().undo()}
        onClick={() => editor.chain().focus().undo().run()}><IconArrowBackUp size={ICON} /></button>
      <button className="toolbar-btn" title="Повторить" disabled={!editor.can().redo()}
        onClick={() => editor.chain().focus().redo().run()}><IconArrowForwardUp size={ICON} /></button>

      <span className="toolbar-sep" />
      <button className={`toolbar-btn text ${indentOn ? 'active' : ''}`}
        title="Красная строка" onClick={toggleIndent}>Tab</button>
      <button className="toolbar-btn text" title="Сноска"
        onClick={() => editor.chain().focus().insertFootnote().run()}>[?]</button>
      <button className="toolbar-btn text" title="Разделитель сцен"
        onClick={() => editor.chain().focus().insertSceneDivider().run()}>✳✳✳</button>

      <span className="toolbar-sep" />
      {/* TODO(M8): text-cleanup wand. Visible no-op with tooltip for now. */}
      <button className="toolbar-btn"
        title="Чистка текста: слипшиеся запятые, лишние пробелы, короткое тире → длинное (скоро)"
        onClick={() => {}}><IconWand size={ICON} color="var(--muted)" /></button>
    </div>
  )
}
