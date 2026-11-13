// scripts/release/version.mjs
// Turns `major | minor | patch | X.Y.Z` into the version being released, checked against the
// same rules the Android build enforces (android/app/build.gradle) — so a version Gradle would
// reject at minute eight of the build is rejected here, before anything has happened.
import { ReleaseError } from './errors.mjs'

// Three plain numbers, no "v", no "-beta.1", no "+build" — Gradle's rule — and, stricter than
// Gradle, no leading zeros (semver forbids them, and "1.07.0" would be tagged v1.07.0 while
// packing to the same versionCode as 1.7.0).
const STRICT = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/

export const BUMPS = ['major', 'minor', 'patch']

/** [major, minor, patch] for a strict X.Y.Z, or null. */
export function parseSemver(text) {
  const m = STRICT.exec(String(text ?? ''))
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null
}

/** <0, 0, >0 like a sort comparator. Both arguments must already be strict. */
export function compareSemver(a, b) {
  const pa = parseSemver(a)
  const pb = parseSemver(b)
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i] - pb[i]
  }
  return 0
}

/**
 * The target version for `spec`, given the current package.json version.
 *
 * The target may EQUAL the current version. That is not a typo guard being lax: package.json is
 * bumped at the start of a milestone (1.7.0 was set by M31) while the tag only appears when the
 * release is cut, so "release what package.json already says" is the normal first release of a
 * version. The tag preflight is what stops a version from being released twice. Lower is always
 * refused: Android will not install a lower versionCode over a higher one.
 */
export function resolveTarget(current, spec) {
  const cur = parseSemver(current)
  if (!cur) {
    throw new ReleaseError(
      `package.json version "${current}" is not a strict MAJOR.MINOR.PATCH — fix it by hand before releasing.`
    )
  }
  let target
  if (spec === 'major') target = `${cur[0] + 1}.0.0`
  else if (spec === 'minor') target = `${cur[0]}.${cur[1] + 1}.0`
  else if (spec === 'patch') target = `${cur[0]}.${cur[1]}.${cur[2] + 1}`
  else if (parseSemver(spec)) target = spec
  else {
    throw new ReleaseError(
      `"${spec}" is not major, minor, patch or a strict X.Y.Z version (no "v" prefix, no suffix like -beta.1).`
    )
  }
  if (compareSemver(target, current) < 0) {
    throw new ReleaseError(
      `${target} is lower than the current version ${current} — Android refuses to install a lower version over a higher one.`
    )
  }
  // The versionCode packing (major*10000 + minor*100 + patch) gives each component two digits.
  if (parseSemver(target).some((n) => n >= 100)) {
    throw new ReleaseError(
      `${target} has a component of 100 or more, which the Android versionCode packing cannot represent — see android/app/build.gradle.`
    )
  }
  return target
}
