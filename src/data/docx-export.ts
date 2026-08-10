/**
 * ProseMirror JSON → .docx bytes (M14, moved to src/data in MP6 so the web build
 * reuses it). Two layers keep the doc-walking logic pure and isolate docx.js:
 *   1. `chapterToDocxBlocks` walks the canon into a small intermediate representation
 *      (`DocxBlock[]`) — same node set as `markdown.ts`, no docx.js involved.
 *   2. `blocksToDocxBytes` maps that representation onto docx.js and packs bytes.
 *
 * Platform-neutral: returns a `Uint8Array` (not a Node `Buffer`) via `Packer.toBase64String`
 * — the one Packer method available in both the Node and browser docx builds — so the
 * Electron and web paths call the same function. Pure of `fs`; the caller writes the bytes.
 */
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  FootnoteReferenceRun,
  AlignmentType,
  HeadingLevel
} from 'docx'
import type { ProseMirrorJSON } from '@shared/types'

type PMNode = {
  type?: string
  text?: string
  content?: PMNode[]
  marks?: { type?: string }[]
  attrs?: Record<string, unknown>
}

export type DocxRun =
  | { text: string; bold: boolean; italics: boolean; strike: boolean }
  | { footnoteText: string }
  | { break: true }

export type DocxBlock =
  | { kind: 'heading'; text: string }
  | { kind: 'paragraph'; runs: DocxRun[] }
  | { kind: 'divider' }

const hasMark = (node: PMNode, name: string): boolean =>
  (node.marks ?? []).some((m) => m.type === name)

function inlineToRuns(nodes: PMNode[] | undefined): DocxRun[] {
  const runs: DocxRun[] = []
  for (const node of nodes ?? []) {
    if (node.type === 'text') {
      runs.push({
        text: node.text ?? '',
        bold: hasMark(node, 'bold'),
        italics: hasMark(node, 'italic'),
        strike: hasMark(node, 'strike')
      })
    } else if (node.type === 'footnote') {
      const text = (node.attrs?.text as string | undefined) ?? ''
      runs.push({ footnoteText: text })
    } else if (node.type === 'hardBreak') {
      runs.push({ break: true })
    }
  }
  return runs
}

/** Walk a chapter's canon into the intermediate block list. Pure. */
export function chapterToDocxBlocks(
  title: string,
  doc: ProseMirrorJSON,
  opts: { withHeading: boolean }
): DocxBlock[] {
  const root = doc as PMNode
  const blocks: DocxBlock[] = []
  if (opts.withHeading) blocks.push({ kind: 'heading', text: title })
  for (const child of root.content ?? []) {
    if (child.type === 'sceneDivider') blocks.push({ kind: 'divider' })
    else blocks.push({ kind: 'paragraph', runs: inlineToRuns(child.content) })
  }
  return blocks
}

/** Map the intermediate blocks onto docx.js paragraphs, allocating footnotes by id. */
function blocksToParagraphs(
  blocks: DocxBlock[],
  footnotes: Record<number, { children: Paragraph[] }>,
  nextId: { n: number }
): Paragraph[] {
  const paras: Paragraph[] = []
  for (const block of blocks) {
    if (block.kind === 'heading') {
      paras.push(new Paragraph({ text: block.text, heading: HeadingLevel.HEADING_1 }))
    } else if (block.kind === 'divider') {
      paras.push(new Paragraph({ text: '* * *', alignment: AlignmentType.CENTER }))
    } else {
      const children = block.runs.map((run) => {
        if ('footnoteText' in run) {
          const id = (nextId.n += 1)
          footnotes[id] = { children: [new Paragraph({ text: run.footnoteText })] }
          return new FootnoteReferenceRun(id)
        }
        if ('break' in run) return new TextRun({ break: 1 })
        return new TextRun({
          text: run.text,
          bold: run.bold,
          italics: run.italics,
          strike: run.strike
        })
      })
      paras.push(new Paragraph({ children }))
    }
  }
  return paras
}

/** Decode a base64 string to raw bytes. `atob` is global in both Node (>=16) and browsers. */
function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

/** Build the final .docx bytes from one or more chapters' block lists. Platform-neutral. */
export async function blocksToDocxBytes(blockLists: DocxBlock[][]): Promise<Uint8Array> {
  const footnotes: Record<number, { children: Paragraph[] }> = {}
  const nextId = { n: 0 }
  const children = blockLists.flatMap((blocks) => blocksToParagraphs(blocks, footnotes, nextId))
  const doc = new Document({ footnotes, sections: [{ children }] })
  // toBase64String is the only Packer serializer present in BOTH the Node and browser
  // builds (toBuffer is Node-only, toBlob browser-only); decode it to bytes here.
  const base64 = await Packer.toBase64String(doc)
  return base64ToBytes(base64)
}
