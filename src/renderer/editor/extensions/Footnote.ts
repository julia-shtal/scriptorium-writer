import { Node, mergeAttributes } from '@tiptap/core'
import { ReactNodeViewRenderer } from '@tiptap/react'
import { FootnoteView } from './FootnoteView'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    footnote: {
      /** Insert a footnote at the current selection with optional initial text. */
      insertFootnote: (text?: string) => ReturnType
    }
  }
}

/**
 * A footnote reference. Inline atom node (no editable children) whose text lives in
 * the `text` attribute so the JSON canon is lossless. The visible `[N]` number is
 * derived at render (see footnote-numbering.ts), never stored. Hover/edit UI is in
 * FootnoteView. TODO(M7): map to Markdown `[^n]` via shared/footnote-markdown.ts.
 */
export const Footnote = Node.create({
  name: 'footnote',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      text: {
        default: '',
        parseHTML: (element) => element.getAttribute('data-text') ?? '',
        renderHTML: (attributes) => ({ 'data-text': (attributes.text as string) ?? '' })
      }
    }
  },

  parseHTML() {
    return [{ tag: 'span[data-footnote]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes, { 'data-footnote': '', class: 'footnote-marker' })]
  },

  addNodeView() {
    return ReactNodeViewRenderer(FootnoteView)
  },

  addCommands() {
    return {
      insertFootnote:
        (text = '') =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs: { text } })
    }
  }
})
