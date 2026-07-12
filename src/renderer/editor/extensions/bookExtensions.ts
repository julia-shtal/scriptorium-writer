import StarterKit from '@tiptap/starter-kit'
import TextAlign from '@tiptap/extension-text-align'
import type { Extensions } from '@tiptap/react'
import { SceneDivider } from './SceneDivider'

/**
 * The single source of truth for the editor's node/mark set. Used by the live
 * editor (useChapterEditor) and the read-only Version History preview so both
 * render identical content. StarterKit is trimmed to the supported nodes;
 * horizontalRule is replaced by SceneDivider.
 */
export const bookExtensions: Extensions = [
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
]
