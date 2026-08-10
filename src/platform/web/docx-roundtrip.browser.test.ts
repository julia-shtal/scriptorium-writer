import { describe, it, expect } from 'vitest'
import { chapterToDocxBlocks, blocksToDocxBytes } from '@data/docx-export'
import { convertDocxToHtml } from '@data/docx-import'
import { htmlToDoc } from '@renderer/editor/import/htmlToDoc'
import type { ProseMirrorJSON } from '@shared/types'

const doc = (content: unknown[]): ProseMirrorJSON => ({ type: 'doc', content })

describe('docx round-trip under the browser builds (MP6)', () => {
  it('packs with docx and reads back with mammoth, into a clean canon', async () => {
    const blocks = chapterToDocxBlocks(
      'Chapter One',
      doc([
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Привет ' },
            { type: 'text', text: 'bold', marks: [{ type: 'bold' }] }
          ]
        }
      ]),
      { withHeading: true }
    )
    const bytes = await blocksToDocxBytes([blocks])
    // Uint8Array view → exact ArrayBuffer of these bytes, as the File input path would give.
    const ab = bytes.slice().buffer
    const { html } = await convertDocxToHtml(ab)

    // mammoth (browser build) returns HTML; the heading style-maps to <h1>, bold to <strong>.
    expect(html).toContain('Привет')
    expect(html.toLowerCase()).toContain('<strong>')

    const canon = htmlToDoc(html)
    const serialized = JSON.stringify(canon)
    expect(serialized).toContain('Привет')
    // Boundary still holds on the web build's mammoth output.
    expect(serialized).not.toMatch(/"(href|src)"/)
  })
})
