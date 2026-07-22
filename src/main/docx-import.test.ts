/* eslint-disable @typescript-eslint/no-explicit-any --
 * The injected fake mammoth converters are deliberately loosely typed with `any`:
 * the test asserts runtime behavior (html passthrough, warning filtering, style-map
 * forwarding) and casts the fakes to the real converter signature at the call site. */
import { describe, it, expect } from 'vitest'
import { convertDocxToHtml, HEADING_STYLE_MAP } from './docx-import'

describe('convertDocxToHtml', () => {
  it('returns mammoth html and passes the heading style map', async () => {
    let seenOptions: any
    const fakeConvert = async (_input: any, options: any) => {
      seenOptions = options
      return { value: '<h1>T</h1><p>b</p>', messages: [] }
    }
    const out = await convertDocxToHtml(Buffer.from('x'), fakeConvert as any)
    expect(out.html).toBe('<h1>T</h1><p>b</p>')
    expect(out.warnings).toEqual([])
    expect(seenOptions.styleMap).toEqual(HEADING_STYLE_MAP)
  })

  it('collects warning-level messages into warnings', async () => {
    const fakeConvert = async () => ({
      value: '<p>b</p>',
      messages: [
        { type: 'warning', message: 'Unrecognised paragraph style: table' },
        { type: 'info', message: 'ignored' }
      ]
    })
    const out = await convertDocxToHtml(Buffer.from('x'), fakeConvert as any)
    expect(out.warnings).toEqual(['Unrecognised paragraph style: table'])
  })
})
