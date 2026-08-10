import StarterKit from '@tiptap/starter-kit'
import TextAlign from '@tiptap/extension-text-align'
import type { Extensions } from '@tiptap/react'
import { SceneDivider } from './SceneDivider'
import { Footnote } from './Footnote'
import { WandPreview } from '../cleanup/wandPreviewPlugin'
import { FindHighlight } from '../find/findHighlightPlugin'

/**
 * The single source of truth for the editor's node/mark set. Used by the live
 * editor (useChapterEditor) and the read-only Version History preview so both
 * render identical content. StarterKit is trimmed to the supported nodes;
 * horizontalRule is replaced by SceneDivider; Footnote is the M3 inline node.
 *
 * SECURITY BOUNDARY (MP6): this schema is what sanitises untrusted `mammoth` HTML on
 * docx import — `htmlToDoc` runs `generateJSON(html, bookExtensions)` and drops every
 * tag/attribute the schema does not model. There is NO node or mark here that carries a
 * URL or raw HTML (no Link `href`, no Image `src`, no HTML passthrough), so a
 * `javascript:`/`onerror` payload has nothing to land in. Do NOT add Link, Image, or a
 * raw-HTML node without first restoring an explicit sanitiser on the docx-import path
 * (see htmlToDoc.ts) — otherwise imported `.docx` files become an XSS vector.
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
  SceneDivider,
  Footnote,
  WandPreview,
  FindHighlight
]
