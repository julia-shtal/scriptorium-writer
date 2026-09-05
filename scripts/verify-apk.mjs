// scripts/verify-apk.mjs
// Pre-release check on a built release APK, run by hand before an APK is published to
// GitHub Releases. It answers four questions that nothing else in the build answers:
//   1. Is the APK signed at all?      An unsigned release build is only a *warning* in the
//      Gradle log (see docs/android.md, "Release signing"), and an unsigned APK looks
//      exactly like a signed one until a device refuses to install it.
//   2. Is it signed with v2/v3?       minSdk is 30, so a v1-only (JAR-signed) APK means the
//      signing config did not apply the way it was meant to.
//   3. Is it signed with *the* key?   The SHA-256 certificate fingerprint is printed, and —
//      once android/release-fingerprint.txt exists — compared against it. For a sideloaded
//      app that fingerprint is the only identity the user can check; see docs/android.md,
//      "Release signing".
//   4. Is it the APK the current source produces? versionCode/versionName are read back out
//      of the artifact, because android/app/build/outputs/ happily keeps a stale APK from a
//      previous build sitting next to a fresh one.
// Node built-ins only; the Android tooling (apksigner, aapt2) comes from the SDK named by
// ANDROID_HOME / ANDROID_SDK_ROOT. Nothing here reads or writes key material: the SHA-256
// fingerprint of a certificate is public, and is the whole point of check 3.
// Usage: `npm run verify:apk`, or `node scripts/verify-apk.mjs <path-to.apk>`.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..')
const PKG = join(ROOT, 'package.json')
const FINGERPRINT_FILE = join(ROOT, 'android', 'release-fingerprint.txt')
const DEFAULT_APK = 'android/app/build/outputs/apk/release/app-release.apk'

// This script is run once, by hand, on a machine that may not have the SDK where the script
// expects it — so every exit has to read as an instruction, not a stack trace. `fail` is for
// anything that stops the run; assertion failures are collected in `problems` instead, so one
// run reports every problem the APK has rather than only the first.
const problems = []
function fail(message, ...detail) {
  console.error(`verify-apk: ${message}`)
  for (const line of detail) console.error(line)
  process.exit(1)
}
// Last line of defence for the same reason: whatever goes wrong, the operator sees a sentence.
// The stack is still available behind VERIFY_APK_DEBUG=1 when the sentence isn't enough.
// (Both events, because a throw while an ES module is still evaluating surfaces as one or the
// other depending on the Node version.)
const onCrash = (err) => fail(
  `unexpected failure: ${err?.message ?? err}`,
  process.env.VERIFY_APK_DEBUG ? String(err?.stack ?? '') : 'Re-run with VERIFY_APK_DEBUG=1 for the stack trace.'
)
process.on('uncaughtException', onCrash)
process.on('unhandledRejection', onCrash)
const ok = (message) => console.log(`  ok    ${message}`)
const bad = (message) => { problems.push(message); console.log(`  FAIL  ${message}`) }
const note = (message) => console.log(`  --    ${message}`)

// ---------------------------------------------------------------- arguments
const apkArg = process.argv[2]
if (!apkArg) {
  fail(
    'no APK path given.',
    `Usage: node scripts/verify-apk.mjs <path-to.apk>`,
    `   or: npm run verify:apk   (checks ${DEFAULT_APK})`,
    '',
    'Build one first with: npm run sync:android && ./android/gradlew.bat -p android :app:assembleRelease'
  )
}
const apk = apkArg
if (!existsSync(apk) || !statSync(apk).isFile()) {
  fail(
    `no APK at "${apk}".`,
    'Check the path, or build a release APK with:',
    '  npm run sync:android && ./android/gradlew.bat -p android :app:assembleRelease'
  )
}

// ---------------------------------------------------------------- the SDK tools
// Both variable names are checked because both are in circulation: ANDROID_HOME is what
// Android Studio writes, ANDROID_SDK_ROOT is what a lot of CI and CLI docs still use.
const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT
if (!sdk) {
  fail(
    'neither ANDROID_HOME nor ANDROID_SDK_ROOT is set, so the Android SDK cannot be found.',
    'Set ANDROID_HOME to your SDK directory — Android Studio shows it under',
    'Settings > Languages & Frameworks > Android SDK ("Android SDK Location"). Typically:',
    '  Windows   %LOCALAPPDATA%\\Android\\Sdk',
    '  macOS     ~/Library/Android/sdk',
    '  Linux     ~/Android/Sdk',
    '',
    'PowerShell (this session only):  $env:ANDROID_HOME = "$env:LOCALAPPDATA\\Android\\Sdk"'
  )
}
if (!existsSync(sdk)) {
  fail(
    `the Android SDK directory "${sdk}" does not exist.`,
    'ANDROID_HOME / ANDROID_SDK_ROOT points somewhere that is not there — fix the variable.'
  )
}

const buildToolsRoot = join(sdk, 'build-tools')
if (!existsSync(buildToolsRoot)) {
  fail(
    `no build-tools directory under the SDK: "${buildToolsRoot}".`,
    'Install one via Android Studio > SDK Manager > SDK Tools > Android SDK Build-Tools.'
  )
}

// Build-tools directories are named by version ("36.0.0", "35.0.1", "34.0.0-rc3"), so a plain
// lexicographic sort puts "9.0.0" above "34.0.0". Compare the numeric components instead and
// take the highest — the newest apksigner reads every older APK, so newest is always right.
function compareVersions(a, b) {
  const parts = (s) => s.split(/[.\-]/).map((x) => (/^\d+$/.test(x) ? Number(x) : -1))
  const pa = parts(a)
  const pb = parts(b)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pb[i] ?? -1) - (pa[i] ?? -1)
    if (d !== 0) return d
  }
  return 0
}
const buildToolVersions = readdirSync(buildToolsRoot, { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => e.name)
  .sort(compareVersions)

// apksigner ships as a .bat wrapper on Windows and an extensionless shell script elsewhere;
// aapt2 is a real executable, hence the .exe.
const exeNames = (base, win) => (process.platform === 'win32' ? [`${base}${win}`, base] : [base])
function findTool(base, win) {
  for (const version of buildToolVersions) {
    for (const name of exeNames(base, win)) {
      const candidate = join(buildToolsRoot, version, name)
      if (existsSync(candidate)) return { path: candidate, version }
    }
  }
  return null
}

const apksigner = findTool('apksigner', '.bat')
if (!apksigner) {
  fail(
    `no apksigner found under "${buildToolsRoot}".`,
    buildToolVersions.length
      ? `Looked in build-tools: ${buildToolVersions.join(', ')}`
      : 'That directory contains no build-tools versions at all.',
    'Install Android SDK Build-Tools via Android Studio > SDK Manager > SDK Tools.'
  )
}

// Node refuses to spawn a .bat/.cmd without a shell, so on Windows the command is assembled as
// one quoted string; SDK paths routinely contain spaces ("C:\Program Files\..."), and quoting
// each argument is what keeps that from splitting. No user input reaches this — the only
// variables are a path from the environment and the APK path from argv.
const quote = (s) => `"${s}"`
function run(tool, args) {
  const useShell = process.platform === 'win32' && tool.toLowerCase().endsWith('.bat')
  const options = { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }
  const res = useShell
    ? spawnSync([tool, ...args].map(quote).join(' '), { ...options, shell: true })
    : spawnSync(tool, args, options)
  if (res.error) {
    fail(`could not run ${tool}: ${res.error.message}`)
  }
  return { status: res.status, out: `${res.stdout ?? ''}${res.stderr ?? ''}` }
}

console.log(`APK        ${apk}`)
console.log(`SDK        ${sdk}`)
console.log(`tools      build-tools ${apksigner.version}`)
console.log('')

// ---------------------------------------------------------------- signature
// One invocation covers checks 1–3: `verify` exits non-zero on an unsigned or broken APK,
// `-v` prints the per-scheme lines, and `--print-certs` prints the certificate digests.
const verify = run(apksigner.path, ['verify', '-v', '--print-certs', apk])
if (verify.status !== 0) {
  console.log('  FAIL  apksigner verify rejected the APK')
  console.log('')
  console.log(verify.out.trim())
  console.log('')
  fail(
    'the APK is not validly signed.',
    'A release build produces an unsigned APK — with only a warning in the Gradle log — when',
    'android/keystore.properties is missing or incomplete. Copy android/keystore.properties.example',
    'to android/keystore.properties, fill it in, and rebuild.'
  )
}
ok('apksigner verify passed (the APK is signed)')

const schemes = new Map()
for (const m of verify.out.matchAll(/Verified using v(\d+) scheme[^:]*:\s*(true|false)/g)) {
  schemes.set(Number(m[1]), m[2] === 'true')
}
const modern = [2, 3].filter((v) => schemes.get(v))
if (modern.length) {
  ok(`signed with APK Signature Scheme v${modern.join(' + v')}`)
} else if (schemes.size) {
  const listed = [...schemes].map(([v, on]) => `v${v}=${on}`).join(' ')
  bad(`no v2 or v3 signature (${listed}) — minSdk is 30, so a v1-only APK means the signing config did not apply`)
} else {
  bad('apksigner printed no "Verified using vN scheme" lines — cannot tell which schemes signed this APK')
}

const digests = [...verify.out.matchAll(/Signer #(\d+) certificate SHA-256 digest:\s*([0-9a-fA-F:\s]+)/g)]
let fingerprint = null
if (!digests.length) {
  bad('apksigner --print-certs printed no SHA-256 certificate digest')
} else {
  for (const [, signer, digest] of digests) {
    console.log(`  cert  signer #${signer} SHA-256  ${digest.trim()}`)
  }
  fingerprint = digests[0][2]
  if (digests.length > 1) {
    note(`${digests.length} signers; the first is compared against android/release-fingerprint.txt`)
  }
}

// ---------------------------------------------------------------- the pinned fingerprint
// Normalisation before comparing: strip every colon and every run of whitespace, then
// lowercase. apksigner prints the digest as unseparated lowercase hex, while keytool and most
// documentation print it as uppercase colon-separated byte pairs — and release-fingerprint.txt
// is a hand-committed file that may hold either form, possibly with a trailing newline or a
// wrapped line. All of those are the same certificate, so none of them should read as a
// mismatch; anything that survives the stripping is a genuinely different key.
const normalize = (s) => s.replace(/[:\s]/g, '').toLowerCase()

if (!existsSync(FINGERPRINT_FILE)) {
  note('android/release-fingerprint.txt does not exist yet — nothing to compare against.')
  note('That is the expected state before the first release. After it, commit the digest above')
  note('to that file (and publish it in docs/android.md) so this check can pin the key.')
} else if (fingerprint === null) {
  note('android/release-fingerprint.txt exists, but no digest was read from the APK to compare it with')
} else {
  const expected = readFileSync(FINGERPRINT_FILE, 'utf8')
  if (normalize(expected) === normalize(fingerprint)) {
    ok('certificate matches android/release-fingerprint.txt')
  } else {
    bad('certificate does NOT match android/release-fingerprint.txt')
    console.log(`        expected  ${expected.trim()}`)
    console.log(`        got       ${fingerprint.trim()}`)
    console.log('        A different signing key means devices will refuse this as an update to an')
    console.log('        existing install. Do not publish it: find the right keystore first.')
  }
}

// ---------------------------------------------------------------- version, out of the APK
// The packing lives in android/app/build.gradle and is re-implemented in
// src/platform/capacitor/android-version.test.ts; repeated here only to read the built
// artifact back. The point is not the arithmetic — it is catching a stale APK left in
// android/app/build/outputs/ by a previous build.
const pkg = JSON.parse(readFileSync(PKG, 'utf8'))
const semver = /^(\d+)\.(\d+)\.(\d+)$/.exec(pkg.version)
const aapt2 = findTool('aapt2', '.exe')
if (!aapt2) {
  note(`aapt2 not found under "${buildToolsRoot}" — skipping the versionCode/versionName check`)
  note('(install Android SDK Build-Tools to enable it; the signature checks above still stand)')
} else if (!semver) {
  bad(`package.json version "${pkg.version}" is not MAJOR.MINOR.PATCH, so no versionCode can be derived (the Gradle build fails on this too)`)
} else {
  const badging = run(aapt2.path, ['dump', 'badging', apk])
  if (badging.status !== 0) {
    note(`aapt2 dump badging failed — skipping the version check:\n${badging.out.trim()}`)
  } else {
    const expectedName = pkg.version
    const expectedCode = String(Number(semver[1]) * 10000 + Number(semver[2]) * 100 + Number(semver[3]))
    const gotName = /versionName='([^']*)'/.exec(badging.out)?.[1]
    const gotCode = /versionCode='([^']*)'/.exec(badging.out)?.[1]
    const gotPackage = /package: name='([^']*)'/.exec(badging.out)?.[1]

    if (gotName === expectedName) ok(`versionName ${gotName} matches package.json`)
    else bad(`versionName is '${gotName}', package.json says '${expectedName}' — this APK is probably a stale build`)

    if (gotCode === expectedCode) ok(`versionCode ${gotCode} matches the packing of ${expectedName}`)
    else bad(`versionCode is '${gotCode}', ${expectedName} packs to '${expectedCode}'`)

    if (gotPackage) note(`applicationId ${gotPackage}`)
  }
}

// ---------------------------------------------------------------- verdict
console.log('')
if (problems.length) {
  console.error(`verify-apk: ${problems.length} problem${problems.length === 1 ? '' : 's'} — do not publish this APK:`)
  for (const p of problems) console.error(`  - ${p}`)
  process.exit(1)
}
console.log('verify-apk: all checks passed.')
