/* eslint-disable @typescript-eslint/no-explicit-any --
 * The injected fake mammoth converters are deliberately loosely typed with `any`. */
import { describe, it, expect } from 'vitest'
import { convertDocxToHtml, HEADING_STYLE_MAP } from './docx-import'
import { chapterToDocxBlocks, blocksToDocxBytes } from './docx-export'

const bytes = (): ArrayBuffer => new TextEncoder().encode('x').buffer

describe('convertDocxToHtml', () => {
  it('returns mammoth html and passes the heading style map', async () => {
    let seenInput: any
    let seenOptions: any
    const fakeConvert = async (input: any, options: any) => {
      seenInput = input
      seenOptions = options
      return { value: '<h1>T</h1><p>b</p>', messages: [] }
    }
    const out = await convertDocxToHtml(bytes(), fakeConvert as any)
    expect(out.html).toBe('<h1>T</h1><p>b</p>')
    expect(out.warnings).toEqual([])
    expect(seenOptions.styleMap).toEqual(HEADING_STYLE_MAP)
    // Node mammoth reads `buffer`; browser mammoth reads `arrayBuffer` — we pass both.
    expect(seenInput.arrayBuffer).toBeInstanceOf(ArrayBuffer)
    expect(seenInput.buffer).toBeInstanceOf(Uint8Array)
  })

  it('collects warning-level messages into warnings', async () => {
    const fakeConvert = async () => ({
      value: '<p>b</p>',
      messages: [
        { type: 'warning', message: 'Unrecognised paragraph style: table' },
        { type: 'info', message: 'ignored' }
      ]
    })
    const out = await convertDocxToHtml(bytes(), fakeConvert as any)
    expect(out.warnings).toEqual(['Unrecognised paragraph style: table'])
  })

  it('reads a real .docx via the actual mammoth Node build (guards the input-key contract)', async () => {
    const blocks = chapterToDocxBlocks(
      'T',
      { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Привет hi' }] }] } as any,
      { withHeading: false }
    )
    const bytes = await blocksToDocxBytes([blocks])
    const ab = new ArrayBuffer(bytes.byteLength)
    new Uint8Array(ab).set(bytes)
    const out = await convertDocxToHtml(ab) // real mammoth default — no fake
    expect(out.html).toContain('Привет hi')
  })
})
