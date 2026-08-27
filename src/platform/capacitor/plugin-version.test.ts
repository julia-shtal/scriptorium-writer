/**
 * The port translates errors from `err.code` (OS-PLUG-FILE-####), which only exists from
 * @capacitor/filesystem 7.1.0. A downgrade below that floor would silently strip every code
 * and send the port down its message-matching fallback, where a permission error can read as
 * a missing file — so the floor is asserted mechanically rather than trusted.
 */
import { describe, it, expect } from 'vitest'
import { version } from '@capacitor/filesystem/package.json'

describe('@capacitor/filesystem version floor', () => {
  it('is at least 7.1.0, where OS-PLUG-FILE error codes were introduced', () => {
    const [major, minor] = version.split('.').map(Number)
    expect(major > 7 || (major === 7 && minor >= 1)).toBe(true)
  })
})
