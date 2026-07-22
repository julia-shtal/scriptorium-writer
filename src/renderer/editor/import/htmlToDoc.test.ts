import { describe, it, expect } from 'vitest'
import { splitHtmlByHeading, flattenHeadings } from './htmlToDoc'

describe('flattenHeadings', () => {
  it('rewrites heading tags to paragraphs so text is never lost', () => {
    expect(flattenHeadings('<h1>Title</h1><p>body</p>')).toBe('<p>Title</p><p>body</p>')
    expect(flattenHeadings('<h3>Sub</h3>')).toBe('<p>Sub</p>')
  })

  it('leaves non-heading html untouched', () => {
    expect(flattenHeadings('<p><strong>x</strong></p>')).toBe('<p><strong>x</strong></p>')
  })
})

describe('splitHtmlByHeading', () => {
  it('splits at <h1>, heading text becomes the title, body keeps its markup', () => {
    const parts = splitHtmlByHeading('<h1>One</h1><p>a</p><h1>Two</h1><p>b</p>')
    expect(parts).toEqual([
      { title: 'One', html: '<p>a</p>' },
      { title: 'Two', html: '<p>b</p>' }
    ])
  })

  it('content before the first <h1> becomes an empty-title leading section', () => {
    const parts = splitHtmlByHeading('<p>intro</p><h1>One</h1><p>a</p>')
    expect(parts).toEqual([
      { title: '', html: '<p>intro</p>' },
      { title: 'One', html: '<p>a</p>' }
    ])
  })

  it('drops an empty leading section', () => {
    const parts = splitHtmlByHeading('<h1>One</h1><p>a</p>')
    expect(parts).toEqual([{ title: 'One', html: '<p>a</p>' }])
  })
})
