/**
 * Version resolution for `npm run release -- <major|minor|patch|X.Y.Z>`. The rules mirror the
 * Android build (strict MAJOR.MINOR.PATCH, each component < 100) so a version Gradle would reject
 * is rejected before the release has touched anything; "equal to package.json" is allowed because
 * package.json is bumped when a milestone starts, long before its tag is cut.
 */
import { describe, it, expect } from 'vitest'
import { ReleaseError } from './errors.mjs'
import { compareSemver, parseSemver, resolveTarget } from './version.mjs'

describe('parseSemver', () => {
  it('accepts exactly three plain numbers', () => {
    expect(parseSemver('1.7.0')).toEqual([1, 7, 0])
    expect(parseSemver('10.0.12')).toEqual([10, 0, 12])
  })
  it('accepts zero components', () => {
    expect(parseSemver('0.0.0')).toEqual([0, 0, 0])
    expect(parseSemver('1.0.10')).toEqual([1, 0, 10])
  })
  it.each(['v1.7.0', '1.7', '1.7.0-beta.1', '1.7.0+build', ' 1.7.0', '1.7.0\n', '', 'minor', '01.7.0', '1.07.0', '1.7.00'])('rejects %j', (s) => {
    expect(parseSemver(s)).toBeNull()
  })
})

describe('compareSemver', () => {
  it('compares numerically, not as strings', () => {
    expect(compareSemver('1.10.0', '1.9.0')).toBeGreaterThan(0)
    expect(compareSemver('1.7.0', '1.7.0')).toBe(0)
    expect(compareSemver('1.7.0', '2.0.0')).toBeLessThan(0)
  })
})

describe('resolveTarget', () => {
  it('bumps major, minor and patch from the current version', () => {
    expect(resolveTarget('1.7.3', 'major')).toBe('2.0.0')
    expect(resolveTarget('1.7.3', 'minor')).toBe('1.8.0')
    expect(resolveTarget('1.7.3', 'patch')).toBe('1.7.4')
  })
  it('takes an explicit higher version as is', () => {
    expect(resolveTarget('1.7.0', '1.9.2')).toBe('1.9.2')
  })
  it('allows the target to equal the current version (package.json bumped before the tag)', () => {
    expect(resolveTarget('1.7.0', '1.7.0')).toBe('1.7.0')
  })
  it('refuses a lower version', () => {
    expect(() => resolveTarget('1.7.0', '1.6.9')).toThrow(ReleaseError)
    expect(() => resolveTarget('1.7.0', '1.6.9')).toThrow(/lower than the current version 1\.7\.0/)
  })
  it.each(['v1.8.0', '1.8', '1.8.0-beta.1', '1.08.0', 'next'])('refuses the non-strict spec %j', (spec) => {
    expect(() => resolveTarget('1.7.0', spec)).toThrow(/not major, minor, patch or a strict X\.Y\.Z/)
  })
  it('refuses a component the versionCode packing cannot hold', () => {
    expect(() => resolveTarget('1.99.0', 'minor')).toThrow(/100 or more/)
  })
  it('refuses to bump from a non-strict package.json version', () => {
    expect(() => resolveTarget('1.7.0-beta', 'patch')).toThrow(/package\.json version "1\.7\.0-beta"/)
  })
})
