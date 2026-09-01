/**
 * Focused coverage for {@link fileUriToPath}, the pure scheme-stripping helper in `roots.ts`.
 *
 * `resolveCapacitorRoots` itself is NOT covered here — it calls the native `@capacitor/filesystem`
 * plugin (`mkdir`/`getUri`) and needs a real device or a faked plugin, which this milestone
 * deliberately defers until after the on-device spike (see dev-fs-port-contract.ts header).
 * `fileUriToPath` is pure, so it is unit-testable on its own.
 *
 * The second describe block covers no code at all: it reads `android/app/src/main/res/xml/
 * file_paths.xml` and pins it against this module's exports constants (MC3). See its own
 * comment for why that cross-file agreement needs a test rather than the header note it had.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, it, expect, vi } from 'vitest'
import { Directory } from '@capacitor/filesystem'
import { joinPath } from '@data/path-utils'
import { EXPORTS_DIRECTORY, EXPORTS_FOLDER, fileUriToPath } from './roots'

describe('fileUriToPath', () => {
  it('strips a file:// scheme down to a plain absolute path', () => {
    expect(fileUriToPath('file:///a/b')).toBe('/a/b')
  })

  it('decodes percent-encoded segments (e.g. spaces)', () => {
    expect(fileUriToPath('file:///a/b%20c')).toBe('/a/b c')
  })

  it('passes an already-plain path through unchanged', () => {
    expect(fileUriToPath('/a/b')).toBe('/a/b')
  })

  it('falls back to the undecoded path on malformed percent-encoding rather than throwing', () => {
    expect(fileUriToPath('file:///a/b%')).toBe('/a/b%')
  })

  it('regression guard: the stripped path composes correctly under joinPath', () => {
    // Before the fix, joinPath('file:///a/b', 'c') collapsed to 'file:/a/b/c' — this is the
    // exact bug Fix 1 exists to prevent.
    expect(joinPath(fileUriToPath('file:///a/b'), 'c')).toBe('/a/b/c')
  })

  it('pins the CURRENT (silently-corrupting) behaviour for a file:// URI carrying an authority', () => {
    // 'file://localhost/a/b' has an authority component ('localhost') before the path. This
    // function only strips the literal 'file://' prefix, so the authority is NOT recognized
    // as separate from the path and 'localhost' is folded into the result — producing a
    // RELATIVE path ('localhost/a/b', no leading slash), not the absolute path a caller
    // would reasonably expect. This test pins today's actual behaviour; it does not claim
    // that behaviour is correct or desirable. Per the roots.ts header, Android's own
    // Filesystem.getUri() does not appear to emit an authority component in practice, which
    // is why this has not been observed to matter — but if that ever changes, this is the
    // silent-corruption path it would hit.
    expect(fileUriToPath('file://localhost/a/b')).toBe('localhost/a/b')
  })

  it('warns and passes a non-file:// scheme through unchanged (e.g. content://)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(fileUriToPath('content://com.example.provider/tree/abc')).toBe(
      'content://com.example.provider/tree/abc'
    )
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0][0]).toContain('content://com.example.provider/tree/abc')
    warn.mockRestore()
  })

  it('does not warn for an already-plain path (no scheme at all)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    fileUriToPath('/a/b')
    expect(warn).not.toHaveBeenCalled()
    warn.mockRestore()
  })

  it('pins the file:/// boundary (empty authority, absolute root path)', () => {
    expect(fileUriToPath('file:///')).toBe('/')
  })

  it('pins the empty-string boundary', () => {
    expect(fileUriToPath('')).toBe('')
  })
})

/**
 * Pins the coupling `roots.ts`'s header only asks for in prose: `file_paths.xml` must expose
 * the exports folder to Android's FileProvider, and the element type it uses is decided by
 * EXPORTS_DIRECTORY.
 *
 * Why this is worth a test rather than a comment: a mismatch is invisible at build time and at
 * boot. Exports keep writing fine — it is only the Share sheet that breaks, and only at the
 * moment the user taps the button, with an IllegalArgumentException from FileProvider about a
 * path outside the configured ones. So the failure lands on the user, in the one flow that is
 * her sole route to a backup off the device (MC2/MC3), long after the edit that caused it.
 * Deriving the expectation from the constants below means renaming EXPORTS_FOLDER *or* editing
 * the XML alone fails here instead.
 */
describe('file_paths.xml ↔ roots.ts exports coupling', () => {
  // Resolved from this file, not from the process CWD: vitest can be invoked from anywhere,
  // and a CWD-relative path would fail as "file missing" rather than as a real mismatch.
  const xmlPath = fileURLToPath(
    new URL('../../../android/app/src/main/res/xml/file_paths.xml', import.meta.url)
  )
  // Comments are stripped first. The XML documents this very coupling in a comment that spells
  // out `Directory.Documents/Scriptorium-Writer-exports`, so matching against the raw text
  // could keep passing on the prose after the real element was deleted.
  const body = readFileSync(xmlPath, 'utf8').replace(/<!--[\s\S]*?-->/g, '')

  const entries = [...body.matchAll(/<([\w-]+)\s+name="([^"]*)"\s+path="([^"]*)"\s*\/>/g)].map(
    ([, element, name, path]) => ({ element, name, path })
  )

  // A trailing slash is tolerated on purpose: FileProvider treats the `path` attribute as a
  // directory subpath, so `Documents/X` and `Documents/X/` name the same directory and the
  // difference cannot break sharing. Nothing else is tolerated — the `Documents/` prefix and
  // the folder segment itself are exactly what must agree with the constants.
  const normalise = (p: string): string => p.replace(/\/+$/, '')

  it('EXPORTS_DIRECTORY is still Directory.Documents (the XML element type depends on it)', () => {
    // <external-path> maps to external storage, which is where Directory.Documents lives.
    // Switching the constant to Directory.Data would move exports into app-private storage,
    // which FileProvider only reaches through <files-path> — the XML below would then be
    // pointing at a directory nothing writes to.
    expect(EXPORTS_DIRECTORY).toBe(Directory.Documents)
  })

  it('exposes the exports folder as an <external-path> matching EXPORTS_FOLDER', () => {
    const expected = `Documents/${EXPORTS_FOLDER}`
    const match = entries.find((e) => normalise(e.path) === expected)
    expect(
      match,
      `file_paths.xml has no entry for "${expected}". Found: ${JSON.stringify(entries)}`
    ).toBeDefined()
    expect(match?.element).toBe('external-path')
  })
})
