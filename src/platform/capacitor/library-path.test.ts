/**
 * `isNativeLibraryPathUsable` (MC3 §6) — the accept/reject table.
 *
 * The case this predicate exists for is a settings.json written on Windows arriving on the
 * tablet (the library is meant to travel by USB and through exportLibrary). Handing
 * `C:\Users\…` to the Capacitor filesystem plugin does not fail loudly; it fails later and
 * elsewhere, as an unexplained ENOENT on the first read. Rejecting the shape up front turns
 * that into a silent, correct fallback to the platform default.
 */
import { describe, expect, it } from 'vitest'
import { isNativeLibraryPathUsable } from './library-path'

describe('isNativeLibraryPathUsable — accepts', () => {
  it.each([
    // What resolveCapacitorRoots() actually hands back on device.
    '/storage/emulated/0/Documents/Scriptorium-Writer',
    // A user-relocated library elsewhere on the device.
    '/storage/emulated/0/Documents/Книги/Scriptorium-Writer',
    // Spaces are ordinary in a folder name and must not be mistaken for a malformed path.
    '/storage/emulated/0/Documents/My Library',
    // Minimal absolute path; nothing about the depth matters, only the shape.
    '/'
  ])('accepts the POSIX absolute path %o', (path) => {
    expect(isNativeLibraryPathUsable(path)).toBe(true)
  })
})

describe('isNativeLibraryPathUsable — rejects', () => {
  it.each([
    // No override recorded. FileService also short-circuits on falsy, but the predicate must
    // not claim a blank string is usable if it is ever called directly.
    ['', 'the empty string'],
    ['   ', 'a whitespace-only string'],
    // The whole reason this file exists: desktop-written settings on Android.
    ['C:\\Users\\julia\\Documents\\Scriptorium-Writer', 'a Windows drive letter'],
    ['c:/Users/julia/Documents/Scriptorium-Writer', 'a lowercase drive letter with forward slashes'],
    ['\\\\server\\share\\Scriptorium-Writer', 'a UNC path'],
    // A backslash anywhere means the value came from a Windows path-joiner, whatever its head
    // looks like — and Android would treat the backslash as a literal filename character.
    ['/storage/emulated/0/Documents\\Scriptorium-Writer', 'an embedded backslash'],
    // URI forms: roots.ts strips file:// precisely because joinPath mangles a scheme, and a
    // content:// URI is not a path FsPort can join onto at all.
    ['file:///storage/emulated/0/Documents/Scriptorium-Writer', 'a file:// URI'],
    ['content://com.android.externalstorage.documents/tree/primary%3ADocuments', 'a content:// URI'],
    // Relative: there is no defensible base to resolve against, and guessing one would point
    // the library at a directory the user never chose.
    ['Documents/Scriptorium-Writer', 'a relative path'],
    ['./Scriptorium-Writer', 'an explicitly relative path'],
    ['Scriptorium-Writer', 'a bare folder name']
  ])('rejects %o — %s', (path) => {
    expect(isNativeLibraryPathUsable(path)).toBe(false)
  })
})
