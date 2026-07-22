/**
 * ProseMirror JSON → .docx for M14 export. Two layers keep the doc-walking logic pure and
 * testable and isolate the docx.js API:
 *   1. `chapterToDocxBlocks` walks the canon into a small intermediate representation
 *      (`DocxBlock[]`) — same node set as `markdown.ts`, no docx.js involved.
 *   2. `blocksToDocxBuffer` maps that representation onto docx.js and packs a Buffer.
 *
 * Marks → run flags, `sceneDivider` → a centered divider paragraph, `footnote` nodes →
 * native docx footnotes, `hardBreak` → a line break. Whole-story export sets a Heading-1
 * per chapter; per-chapter export omits it. Pure of `fs`; the caller writes the bytes.
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

/** Build the final .docx bytes from one or more chapters' block lists. */
export async function blocksToDocxBuffer(blockLists: DocxBlock[][]): Promise<Buffer> {
  const footnotes: Record<number, { children: Paragraph[] }> = {}
  const nextId = { n: 0 }
  const children = blockLists.flatMap((blocks) => blocksToParagraphs(blocks, footnotes, nextId))
  const doc = new Document({ footnotes, sections: [{ children }] })
  return Packer.toBuffer(doc)
}
