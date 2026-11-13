/**
 * Finding a version's section in docs/CHANGELOG.md: preflight refuses a release without one, and
 * the GitHub release notes are its body.
 */
import { describe, it, expect } from 'vitest'
import { findSection, releaseNotes } from './changelog.mjs'

const SAMPLE = [
  '# Changelog',
  '',
  'Released versions, newest first.',
  '',
  '## 1.8.0 — unreleased',
  '',
  '- Nothing yet, but soon.',
  '',
  '## 1.7.0 — 2026-11-20',
  '',
  '- Import a library.',
  '  Second line of the same bullet.',
  '- Fixed: deleting a story in the web app.',
  '',
  '### Notes',
  '',
  'See architecture.md.',
  '',
  '## 1.7.01 — a decoy that only shares a prefix',
  '',
  '- decoy',
  '',
  '## 1.6.0 — 2026-09-05',
  '',
  'Prose only, no bullets here.',
  ''
].join('\n')

describe('findSection', () => {
  it('finds an "unreleased" heading', () => {
    expect(findSection(SAMPLE, '1.8.0')).toEqual({
      heading: '## 1.8.0 — unreleased',
      body: '- Nothing yet, but soon.',
      bullets: 1
    })
  })
  it('finds a dated heading and keeps ### subsections inside it', () => {
    const s = findSection(SAMPLE, '1.7.0')
    expect(s?.heading).toBe('## 1.7.0 — 2026-11-20')
    expect(s?.bullets).toBe(2)
    expect(s?.body).toContain('### Notes')
    expect(s?.body).not.toContain('decoy')
  })
  it('does not match a version that merely shares a prefix', () => {
    expect(findSection(SAMPLE, '1.7.0')?.heading).not.toContain('1.7.01')
    expect(findSection(SAMPLE, '1.7.01')?.body).toBe('- decoy')
  })
  it('returns null for a missing version', () => {
    expect(findSection(SAMPLE, '1.9.0')).toBeNull()
    expect(findSection(SAMPLE, '1.7')).toBeNull()
  })
  it('reports a heading with no bullets as zero bullets', () => {
    expect(findSection(SAMPLE, '1.6.0')).toMatchObject({ bullets: 0, body: 'Prose only, no bullets here.' })
  })
  it('accepts a bare heading and CRLF line endings', () => {
    const crlf = '## 2.0.0\r\n\r\n- One.\r\n'
    expect(findSection(crlf, '2.0.0')).toEqual({ heading: '## 2.0.0', body: '- One.', bullets: 1 })
  })
  it('parses a whole CRLF file the same as its LF original', () => {
    expect(findSection(SAMPLE.replace(/\n/g, '\r\n'), '1.7.0')).toEqual(findSection(SAMPLE, '1.7.0'))
    expect(findSection(SAMPLE.replace(/\n/g, '\r\n'), '1.6.0')).toMatchObject({ bullets: 0 })
  })
  it.each(['## 1.7.0—unreleased', '## 1.7.0 — unreleased', '## 1.7.0 - unreleased', '## 1.7.0 -', '## 1.7.0- 2026-11-20', '## 1.7.0–x', '##\t1.7.0'])(
    'accepts the heading %j',
    (heading) => {
      expect(findSection(`${heading}\r\n\r\n- One.\r\n`, '1.7.0')).toMatchObject({ heading, bullets: 1 })
    }
  )
  it.each(['## 1.7.01', '## 1.7.0.1', '## 1.7.0-beta', '## 1.7.0-1', '### 1.7.0', '## v1.7.0', '#1.7.0'])('rejects the heading %j', (heading) => {
    expect(findSection(`${heading}\n\n- One.\n`, '1.7.0')).toBeNull()
  })
})

describe('releaseNotes', () => {
  it('is the section body without its heading, LF line endings', () => {
    const notes = releaseNotes(SAMPLE.replace(/\n/g, '\r\n'), '1.7.0')
    expect(notes).toMatch(/^- Import a library\.\n {2}Second line/)
    expect(notes).toMatch(/See architecture\.md\.$/)
    expect(notes).not.toContain('\r')
    expect(notes).not.toContain('## 1.7.0')
  })
  it('is null for a missing version', () => {
    expect(releaseNotes(SAMPLE, '3.0.0')).toBeNull()
  })
})
