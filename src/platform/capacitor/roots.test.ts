/**
 * Focused coverage for {@link fileUriToPath}, the pure scheme-stripping helper in `roots.ts`.
 *
 * `resolveCapacitorRoots` itself is NOT covered here — it calls the native `@capacitor/filesystem`
 * plugin (`mkdir`/`getUri`) and needs a real device or a faked plugin, which this milestone
 * deliberately defers until after the on-device spike (see dev-fs-port-contract.ts header).
 * `fileUriToPath` is pure, so it is unit-testable on its own.
 */
import { describe, it, expect, vi } from 'vitest'
import { joinPath } from '@data/path-utils'
import { fileUriToPath } from './roots'

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
