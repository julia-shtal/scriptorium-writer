import { describe, it, expect } from 'vitest'
import { htmlToDoc } from './htmlToDoc'

/**
 * Security regression (MP6): the docx-import path trusts `generateJSON` against the
 * editor schema to strip hostile HTML. Feed classic XSS payloads through htmlToDoc and
 * assert nothing dangerous survives into the canon: no script node, and no attribute
 * anywhere carrying a URL/handler (href/src/on*). If someone later adds a Link/Image
 * extension, these assertions fail — by design.
 */
const PAYLOADS = [
  '<p>ok</p><script>alert(1)</script>',
  '<p><img src="x" onerror="alert(1)"></p>',
  '<p><a href="javascript:alert(1)">click</a></p>',
  '<p><svg onload="alert(1)"></svg></p>'
]

const asString = (json: unknown): string => JSON.stringify(json)

describe('htmlToDoc XSS boundary', () => {
  for (const html of PAYLOADS) {
    it(`drops hostile markup from: ${html}`, () => {
      const json = htmlToDoc(html)
      const serialized = asString(json)
      // No script/handler/URL attributes leak into the canon.
      expect(serialized).not.toContain('script')
      expect(serialized).not.toContain('onerror')
      expect(serialized).not.toContain('onload')
      expect(serialized).not.toContain('javascript:')
      expect(serialized).not.toMatch(/"(href|src)"/)
    })
  }

  it('keeps benign text and emphasis', () => {
    const json = htmlToDoc('<p>hello <strong>bold</strong></p>')
    expect(asString(json)).toContain('bold')
  })
})
