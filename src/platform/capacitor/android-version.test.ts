/**
 * MC4 guards for android/app/build.gradle.
 *
 * The Android version is derived from package.json at Gradle configure time rather than
 * typed into build.gradle, because two hand-maintained copies of the same semver drift:
 * the desktop release says 1.6.0 while the APK still claims 1.0, and nobody finds out
 * until an install is refused. These tests are the drift alarm — a well-meaning
 * "let me just bump versionCode here" edit puts a literal back into the file and fails
 * here, in `npm test`, rather than at the next release.
 *
 * The packing formula is also reimplemented below in TypeScript. That is deliberate
 * duplication: the README quotes a worked example (1.5.0 -> 10500), and a formula that
 * only lives in Groovy can be silently changed without the documentation noticing. It
 * also makes the rejection rules — which in Gradle are `throw new GradleException` and so
 * can only be reached by actually running a build — testable as plain functions.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const REPO_ROOT = resolve(__dirname, '../../..')
const BUILD_GRADLE = readFileSync(resolve(REPO_ROOT, 'android/app/build.gradle'), 'utf8')
const PACKAGE_VERSION = JSON.parse(
  readFileSync(resolve(REPO_ROOT, 'package.json'), 'utf8')
).version as string

/**
 * The packing used by `android/app/build.gradle`: `major * 10000 + minor * 100 + patch`.
 *
 * Each component gets exactly two decimal digits, which is what keeps the result both
 * monotonic in the semver and readable back by a human (10500 reads as 1.05.00). It also
 * forces the `< 100` bound: a minor of 100 would carry into the major's digits and let an
 * older build outrank a newer one — and on Android a higher versionCode installing over a
 * lower one is a downgrade the platform performs without complaint.
 *
 * Throws on anything the Gradle code would also refuse, so the two stay in step.
 */
export function androidVersionCode(version: string): number {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version)
  if (!match) {
    throw new Error(`Not a strict MAJOR.MINOR.PATCH semver: "${version}"`)
  }
  const parts = [match[1], match[2], match[3]].map(Number)
  if (parts.some((part) => part >= 100)) {
    throw new Error(`Version component >= 100 does not fit the two-digit packing: "${version}"`)
  }
  const [major, minor, patch] = parts
  return major * 10000 + minor * 100 + patch
}

/**
 * Matches `name <literal>` in every spelling Gradle's Groovy DSL accepts:
 *
 *   name value        space-call — what Capacitor's generated template uses
 *   name = value      property assignment — what AGP 8 and today's Studio templates emit,
 *                     and what the rest of this very build.gradle already uses
 *                     (`namespace = "…"`, `compileSdk = …`, `ignoreAssetsPattern = '…'`)
 *   name(value)       explicit method call
 *
 * `value` is the caller's pattern: a quote for string properties, a digit for numeric ones.
 *
 * Enumerating the three separators matters — the tempting shorthand `name\s*=?\s*value`
 * also matches ZERO characters between the name and the value, which in this file means
 * `['storeFile', 'storePassword', …]` and `getProperty('keyPassword')` match their own
 * closing quote. The guard would then fail permanently on correct code, get deleted, and
 * catch nothing. The bare space-call form is restricted to spaces and tabs for the same
 * reason: `\s+` would span a newline and let a comment line ending in "…versionCode"
 * pair up with whatever the next line starts with.
 *
 * A COMMENTED-OUT literal still matches, deliberately: `// versionCode 7` means somebody
 * was mid-edit toward hardcoding the version, and failing on it is the safe direction.
 */
function gradleLiteral(name: string, value: string): RegExp {
  return new RegExp(`${name}(?:[ \\t]*=\\s*|[ \\t]+|[ \\t]*\\()${value}`)
}

describe('android/app/build.gradle — version derived from package.json', () => {
  it('has no literal versionName left in the file', () => {
    expect(BUILD_GRADLE).not.toMatch(gradleLiteral('versionName', `["']`))
  })

  it('has no literal versionCode left in the file', () => {
    expect(BUILD_GRADLE).not.toMatch(gradleLiteral('versionCode', '\\d'))
  })

  it('reads package.json to source the version', () => {
    expect(BUILD_GRADLE).toContain('../../package.json')
    expect(BUILD_GRADLE).toContain('JsonSlurper')
  })

  it('applies the documented packing to the version package.json currently declares', () => {
    // Not a tautology: the right-hand side is what a human reads off build.gradle and the
    // README. If either the formula or package.json's version changes, this is where the
    // worked example gets caught being stale.
    expect(androidVersionCode(PACKAGE_VERSION)).toBe(10500)
    expect(PACKAGE_VERSION).toBe('1.5.0')
  })
})

describe('androidVersionCode', () => {
  const PACKING_CASES: [version: string, code: number][] = [
    ['1.5.0', 10500],
    ['0.0.1', 1],
    ['1.0.0', 10000],
    ['2.13.7', 21307],
    ['99.99.99', 999999]
  ]

  it.each(PACKING_CASES)('packs %s as %i', (version, expected) => {
    expect(androidVersionCode(version)).toBe(expected)
  })

  it('orders monotonically with the semver', () => {
    const ascending = ['0.9.9', '1.0.0', '1.0.1', '1.5.0', '1.6.0', '2.0.0']
    const codes = ascending.map(androidVersionCode)
    expect([...codes].sort((a, b) => a - b)).toEqual(codes)
  })

  it.each(['1.5', '1.5.0.1', 'v1.5.0', '1.5.0-beta.1', '1.5.x', '', '1.5.0 '])(
    'rejects the non-semver %o',
    (version) => {
      expect(() => androidVersionCode(version)).toThrow(/semver/)
    }
  )

  it.each(['100.0.0', '1.100.0', '1.0.100'])('rejects %s for a component >= 100', (version) => {
    expect(() => androidVersionCode(version)).toThrow(/>= 100/)
  })
})

describe('android/app/build.gradle — release signing', () => {
  it('reads credentials from keystore.properties', () => {
    expect(BUILD_GRADLE).toContain('keystore.properties')
    for (const key of ['storeFile', 'storePassword', 'keyAlias', 'keyPassword']) {
      expect(BUILD_GRADLE).toContain(key)
    }
  })

  it('guards on the properties file existing, so a keystore-less clone still configures', () => {
    expect(BUILD_GRADLE).toMatch(/keystorePropertiesFile\.exists\(\)/)
    expect(BUILD_GRADLE).toMatch(/if\s*\(hasReleaseKeystore\)\s*\{\s*signingConfig/)
  })

  it('warns rather than failing silently when the keystore is absent', () => {
    expect(BUILD_GRADLE).toMatch(/logger\.warn/)
  })

  it('never hardcodes a password', () => {
    // The only place a credential may appear is the gitignored properties file. This is the
    // guard with real blast radius, so it uses the same all-spellings matcher: a committed
    // `storePassword = "hunter2"` is a leaked signing key, and the key cannot be rotated
    // without breaking upgrades for every installed user.
    expect(BUILD_GRADLE).not.toMatch(gradleLiteral('storePassword', `["']`))
    expect(BUILD_GRADLE).not.toMatch(gradleLiteral('keyPassword', `["']`))
  })
})
