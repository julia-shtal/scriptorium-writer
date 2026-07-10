import { Node, mergeAttributes } from '@tiptap/core'

/** Configurable glyph rendered for a scene break. */
export const SCENE_DIVIDER_GLYPH = '✳ ✳ ✳'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    sceneDivider: {
      /** Insert a scene-divider block at the current selection. */
      insertSceneDivider: () => ReturnType
    }
  }
}

/**
 * A centered scene break. Atomic block node (no editable children) so it behaves as a
 * single unit. Rendered as `✳ ✳ ✳` in accent color via the `.scene-divider` class
 * (styled in book.css). TODO(M7): serialize to a Markdown thematic break.
 */
export const SceneDivider = Node.create({
  name: 'sceneDivider',
  group: 'block',
  atom: true,
  selectable: true,

  parseHTML() {
    return [{ tag: 'div[data-scene-divider]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, { 'data-scene-divider': '', class: 'scene-divider' }),
      SCENE_DIVIDER_GLYPH
    ]
  },

  addCommands() {
    return {
      insertSceneDivider:
        () =>
        ({ commands }) =>
          commands.insertContent({ type: this.name })
    }
  }
})
