/**
 * android/keystore.properties is read by Gradle through java.util.Properties, so the release
 * preflight has to read storeFile with the same rules — above all the backslash escapes, which
 * make a Windows path mean something different from what it looks like.
 */
import { describe, it, expect } from 'vitest'
import { parseProperties } from './properties.mjs'

const props = (text: string) => Object.fromEntries(parseProperties(text))

describe('parseProperties', () => {
  it('reads the three separators and skips comments and blank lines', () => {
    expect(props('# c\n! c\n\n  a=1\nb : 2\nc 3\nd\n')).toEqual({ a: '1', b: '2', c: '3', d: '' })
  })
  it('splits at the first separator only, keeping the rest of the value', () => {
    expect(props('url=https://x.test/a=b')).toEqual({ url: 'https://x.test/a=b' })
  })
  it('treats backslashes as escapes, exactly like Java', () => {
    expect(props('storeFile=C:\\\\keys\\\\release.jks')).toEqual({ storeFile: 'C:\\keys\\release.jks' })
    // A single backslash is dropped (and \t is a tab) — the path Gradle sees, wrong as it is.
    expect(props('storeFile=C:\\keys\\temp.jks')).toEqual({ storeFile: 'C:keys\temp.jks' })
    expect(props('k=\\u0041\\=\\:')).toEqual({ k: 'A=:' })
    expect(props('a\\=b=c')).toEqual({ 'a=b': 'c' })
  })
  it('joins continuation lines, dropping their leading whitespace', () => {
    expect(props('storeFile=C:/keys/\\\n    release.jks\nnext=1')).toEqual({ storeFile: 'C:/keys/release.jks', next: '1' })
    // An even number of trailing backslashes is an escaped backslash, not a continuation.
    expect(props('a=x\\\\\nb=y')).toEqual({ a: 'x\\', b: 'y' })
  })
  it('handles CRLF and lets later keys win', () => {
    expect(props('a=1\r\na=2\r\n')).toEqual({ a: '2' })
  })
})
