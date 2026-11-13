// scripts/android-sdk.mjs
// Where the Android SDK's build tools live, shared by the two scripts that need them:
// verify-apk.mjs (runs apksigner and aapt2 on a built APK) and the release preflight (M32),
// which only has to know apksigner is *there* before it spends ten minutes building.
// Keeping one copy means the two can never disagree about which apksigner "the" apksigner is.
// Node built-ins only. Every function takes what it reads as a parameter (env, platform), so
// the release tests can point it at a temp directory instead of the real SDK.
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

/** The SDK directory named by the environment, or null. Both names are checked because both
 *  are in circulation: ANDROID_HOME is what Android Studio writes, ANDROID_SDK_ROOT is what a
 *  lot of CI and CLI docs still use. An empty value counts as unset. */
export function sdkRoot(env = process.env) {
  return env.ANDROID_HOME || env.ANDROID_SDK_ROOT || null
}

// Build-tools directories are named by version ("36.0.0", "35.0.1", "34.0.0-rc3"), so a plain
// lexicographic sort puts "9.0.0" above "34.0.0". Compare the numeric components instead and
// take the highest — the newest apksigner reads every older APK, so newest is always right.
export function compareBuildToolVersions(a, b) {
  const parts = (s) => s.split(/[.\-]/).map((x) => (/^\d+$/.test(x) ? Number(x) : -1))
  const pa = parts(a)
  const pb = parts(b)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pb[i] ?? -1) - (pa[i] ?? -1)
    if (d !== 0) return d
  }
  return 0
}

/** The version directories under `<sdk>/build-tools`, newest first. [] if there are none. */
export function buildToolVersions(buildToolsRoot) {
  if (!existsSync(buildToolsRoot)) return []
  return readdirSync(buildToolsRoot, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort(compareBuildToolVersions)
}

/**
 * The newest copy of one build tool, as { path, version }, or null.
 * apksigner ships as a .bat wrapper on Windows and an extensionless shell script elsewhere;
 * aapt2 is a real executable, hence the `winExt` parameter ('.bat' vs '.exe').
 */
export function findBuildTool(buildToolsRoot, versions, base, winExt, platform = process.platform) {
  const names = platform === 'win32' ? [`${base}${winExt}`, base] : [base]
  for (const version of versions) {
    for (const name of names) {
      const candidate = join(buildToolsRoot, version, name)
      if (existsSync(candidate)) return { path: candidate, version }
    }
  }
  return null
}
