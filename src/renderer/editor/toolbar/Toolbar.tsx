import type { Editor } from '@tiptap/react'
import {
  IconAlignLeft,
  IconAlignCenter,
  IconAlignRight,
  IconArrowBackUp,
  IconArrowForwardUp,
  IconWand,
  IconSearch
} from '@tabler/icons-react'
import { useEditorStore } from '@renderer/store/editorStore'
import { useT } from '@renderer/i18n/useT'
import type { WandController } from '@renderer/editor/cleanup/useWand'

const ICON = 18

export function Toolbar({
  editor,
  wand,
  onFind
}: {
  editor: Editor | null
  wand: WandController
  onFind: () => void
}): JSX.Element | null {
  const indentOn = useEditorStore((s) => s.indentOn)
  const toggleIndent = useEditorStore((s) => s.toggleIndent)
  const wandActive = useEditorStore((s) => s.wandPreviewActive)
  const t = useT()
  if (!editor) return null

  const mark = (name: string): string => (editor.isActive(name) ? 'toolbar-btn active' : 'toolbar-btn')
  const align = (a: string): string =>
    editor.isActive({ textAlign: a }) ? 'toolbar-btn active' : 'toolbar-btn'

  return (
    <div className="toolbar">
      <button className={`${mark('italic')} italic`} title={t.toolbar.italic}
        onClick={() => editor.chain().focus().toggleItalic().run()}>I</button>
      <button className={`${mark('bold')} bold`} title={t.toolbar.bold}
        onClick={() => editor.chain().focus().toggleBold().run()}>B</button>
      <button className={`${mark('strike')} strike`} title={t.toolbar.strike}
        onClick={() => editor.chain().focus().toggleStrike().run()}>S</button>

      <span className="toolbar-sep" />
      <button className={align('left')} title={t.toolbar.alignLeft}
        onClick={() => editor.chain().focus().setTextAlign('left').run()}><IconAlignLeft size={ICON} /></button>
      <button className={align('center')} title={t.toolbar.alignCenter}
        onClick={() => editor.chain().focus().setTextAlign('center').run()}><IconAlignCenter size={ICON} /></button>
      <button className={align('right')} title={t.toolbar.alignRight}
        onClick={() => editor.chain().focus().setTextAlign('right').run()}><IconAlignRight size={ICON} /></button>

      <span className="toolbar-sep" />
      <button className="toolbar-btn" title={t.toolbar.undo} disabled={!editor.can().undo()}
        onClick={() => editor.chain().focus().undo().run()}><IconArrowBackUp size={ICON} /></button>
      <button className="toolbar-btn" title={t.toolbar.redo} disabled={!editor.can().redo()}
        onClick={() => editor.chain().focus().redo().run()}><IconArrowForwardUp size={ICON} /></button>

      <span className="toolbar-sep" />
      <button className={`toolbar-btn text ${indentOn ? 'active' : ''}`}
        title={t.toolbar.redLine} onClick={toggleIndent}>Tab</button>
      <button className="toolbar-btn text" title={t.toolbar.footnote}
        onClick={() => editor.chain().focus().insertFootnote().run()}>[?]</button>
      <button className="toolbar-btn text" title={t.toolbar.sceneDivider}
        onClick={() => editor.chain().focus().insertSceneDivider().run()}>✳✳✳</button>

      <span className="toolbar-sep" />
      <button className={`toolbar-btn${wandActive ? ' active' : ''}`}
        title={t.toolbar.cleanup}
        disabled={wandActive}
        onClick={wand.trigger}><IconWand size={ICON} /></button>
      {wand.emptyNote && <span className="wand-empty-note">{t.toolbar.cleanupEmpty}</span>}
      <button className="toolbar-btn" title={t.toolbar.findReplace} onClick={onFind}>
        <IconSearch size={ICON} />
      </button>
    </div>
  )
}
