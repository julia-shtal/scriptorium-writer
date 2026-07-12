import { useEffect, useRef, useState } from 'react'
import { NodeViewWrapper, type ReactNodeViewProps } from '@tiptap/react'
import { footnoteNumberAt } from './footnote-numbering'

/**
 * Node view for a footnote reference. Shows a `[N]` marker (N derived from document
 * order). Hover reveals the text in a popover (v1: read-only on hover). Clicking the
 * marker (or selecting it) opens a compact field to edit the `text` attribute, closed
 * with `×`, `Esc`, or blur.
 *
 * Editing is tracked in LOCAL state and the textarea is UNCONTROLLED (`defaultValue` +
 * ref), committing once on close — deliberately NOT `value={text}` + per-keystroke
 * `updateAttributes`. That earlier design dispatched a transaction per character; while
 * the atom is a ProseMirror NodeSelection, PM re-asserts the DOM selection onto the node
 * after each transaction (`selectNode`) and steals focus back from the textarea — the
 * "type one character, then it goes read-only" bug. No per-keystroke transactions means
 * nothing to steal focus.
 */
export function FootnoteView(props: ReactNodeViewProps): JSX.Element {
  const { editor, node, getPos, selected, updateAttributes } = props
  const [hovered, setHovered] = useState(false)
  const [editing, setEditing] = useState(false)
  // Bumped on every doc change to force a re-render (see effect below).
  const [, forceRender] = useState(0)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // A NodeView only re-renders when ITS OWN node changes, but the marker number is
  // derived from *other* footnotes' positions. Inserting/deleting a footnote elsewhere
  // shifts this one's number without changing its node, so we recompute on every doc
  // update. `update` fires after a doc-changing transaction, once positions are settled.
  useEffect(() => {
    const rerender = (): void => forceRender((n) => n + 1)
    editor.on('update', rerender)
    return () => {
      editor.off('update', rerender)
    }
  }, [editor])

  const pos = getPos()
  // `[1]` is a deliberate fallback for the transient `getPos() === undefined` state
  // (node momentarily detached mid-transaction), not an oversight.
  const num = pos == null ? 1 : footnoteNumberAt(editor.state.doc, pos)
  const text = (node.attrs.text as string) ?? ''

  // Open the editor when ProseMirror selects the marker (e.g. keyboard navigation).
  // Mouse clicks open it directly via the marker's onMouseDown below.
  useEffect(() => {
    if (selected) setEditing(true)
  }, [selected])

  // Focus the field (caret at end) whenever it opens; more reliable than `autoFocus`
  // for an element mounted into a React portal.
  useEffect(() => {
    if (!editing) return
    const el = inputRef.current
    if (!el) return
    el.focus()
    el.setSelectionRange(el.value.length, el.value.length)
  }, [editing])

  const close = (): void => {
    if (!editing) return
    const value = inputRef.current?.value ?? text
    setEditing(false)
    if (value !== text) updateAttributes({ text: value })
    // Move to a text position just past the atom so the NodeSelection is replaced by a
    // TextSelection — otherwise `focus()` alone would leave the atom selected.
    const p = getPos()
    if (typeof p === 'number') {
      editor.chain().focus().setTextSelection(p + node.nodeSize).run()
    } else {
      editor.commands.focus()
    }
  }

  return (
    <NodeViewWrapper
      as="span"
      className="footnote"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <span
        className="footnote-marker"
        contentEditable={false}
        onMouseDown={(e) => {
          // Open on click; preventDefault so PM doesn't also start a node drag/selection.
          e.preventDefault()
          setEditing(true)
        }}
      >
        [{num}]
      </span>

      {editing ? (
        <span className="footnote-editor" contentEditable={false}>
          <textarea
            ref={inputRef}
            className="footnote-input"
            defaultValue={text}
            placeholder="Текст сноски…"
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault()
                close()
              }
            }}
            onBlur={close}
          />
          <button
            className="footnote-close"
            title="Закрыть"
            // Keep the textarea focused through the click so onBlur doesn't double-fire.
            onMouseDown={(e) => e.preventDefault()}
            onClick={close}
          >
            ×
          </button>
        </span>
      ) : (
        hovered && (
          <span className="footnote-popover" contentEditable={false}>
            {text.trim() ? text : <span className="footnote-empty">(пустая сноска)</span>}
          </span>
        )
      )}
    </NodeViewWrapper>
  )
}
