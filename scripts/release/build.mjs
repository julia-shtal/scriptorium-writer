// scripts/release/build.mjs
// Stage 3 of a release: build and verify all three targets into release-out/X.Y.Z/, from the
// bump commit (or, in a dry run, the bumped working tree). Nothing here publishes anything.
//
//   build.web      npm run build:web -> verify-web-build -> version.json == X.Y.Z -> freeze
//                  dist-web/ as release-out/X.Y.Z/web/ and record its digest.
//   build.android  dist-web/ must equal the frozen bundle (restored from it if not — NEVER
//                  rebuilt) -> npx cap sync android -> gradlew assembleRelease -> verify-apk ->
//                  Scriptorium-Writer-X.Y.Z.apk.
//   build.windows  npm run build -> electron-builder --win --publish never -> latest.yml must
//                  describe exactly Scriptorium-Writer-Setup-X.Y.Z.exe -> copy exe, blockmap,
//                  latest.yml.
//   build.sums     SHA256SUMS.txt for the .exe and .apk, and release-notes.md.
//
// Each step records what it produced (names, sizes, sha256) in state.json. On --resume a done
// step is skipped by the orchestrator; the later steps re-check the recorded hashes against the
// files, so an artifact that changed in between is caught rather than published.
import { copyFileSync, existsSync, readFileSync, rmSync } from 'node:fs'
import { join, relative } from 'node:path'
import {
  LATEST_YML,
  NOTES_FILE,
  SUMS_FILE,
  WEB_DIR,
  apkName,
  blockmapName,
  checkLatestYml,
  describeFile,
  dirDigest,
  exeName,
  isDir,
  readFingerprint,
  releaseNotesText,
  replaceDir,
  sha256SumsText,
  sha512Base64,
  verifyRecorded
} from './artifacts.mjs'
import { releaseNotes } from './changelog.mjs'
import { ReleaseError } from './errors.mjs'
import { runChecked } from './exec.mjs'
import { releaseDir, writeFileAtomic } from './state.mjs'

const STREAM = { capture: false }
const outDir = (ctx) => releaseDir(ctx.root, ctx.version)
const rel = (ctx, p) => relative(ctx.root, p).split('\\').join('/')

const ABORT_HINT = '--abort and start the release over.'

/**
 * The recorded data of a finished step; a missing one means state.json cannot be continued.
 * `hint` is what to do about it, which depends on the caller: before anything is pushed,
 * --abort and start over; in the publish stage (publish.mjs) --abort is no longer possible.
 */
export function stepData(ctx, id, hint = `the release cannot continue past it; ${ABORT_HINT}`) {
  const data = ctx.state.steps[id]
  if (!data?.done) throw new ReleaseError(`state.json has no finished ${id} step — ${hint}`, { final: true })
  return data
}

// --------------------------------------------------------------------------- web

/** Step build.web. */
export function buildWeb(ctx) {
  const distWeb = join(ctx.root, 'dist-web')
  runChecked(ctx, 'npm', ['run', 'build:web'], { ...STREAM, hint: 'fix the web build, then run the release again.' })
  runChecked(ctx, 'node', ['scripts/verify-web-build.mjs'], { ...STREAM, hint: 'the web bundle failed verification (see above); fix it, then run the release again.' })

  // verify-web-build already compares version.json with package.json; this compares it with the
  // version being released, which is what the post-publish smoke check will look for.
  let built
  try {
    built = JSON.parse(readFileSync(join(distWeb, 'version.json'), 'utf8')).version
  } catch (err) {
    throw new ReleaseError(`dist-web/version.json could not be read (${err.message}) — check the version.json plugin in vite.web.config.ts.`)
  }
  if (built !== ctx.version) {
    throw new ReleaseError(`dist-web/version.json says ${built}, but this release is ${ctx.version} — was package.json bumped before the build?`)
  }

  const frozen = join(outDir(ctx), WEB_DIR)
  replaceDir(distWeb, frozen)
  const digest = dirDigest(frozen)
  if (digest.sha256 !== dirDigest(distWeb).sha256) {
    throw new ReleaseError(`the copy of dist-web/ in ${rel(ctx, frozen)} differs from the original — disk trouble? Run the release again.`)
  }
  ctx.log(`  froze ${digest.files} files (${digest.bytes} bytes) as ${rel(ctx, frozen)}/`)
  return { dir: WEB_DIR, version: built, ...digest }
}

// --------------------------------------------------------------------------- android

export const APK_BUILD_PATH = 'android/app/build/outputs/apk/release/app-release.apk'

/**
 * Makes dist-web/ the frozen bundle again if anything changed it since build.web (a stray
 * `npm run build:web`, an editor, an interrupted run resumed later). It is restored by copying,
 * never rebuilt: a rebuild would be a bundle nobody verified. Returns true if it had to restore.
 */
export function ensureFrozenWeb(ctx) {
  const web = stepData(ctx, 'build.web')
  const frozen = join(outDir(ctx), WEB_DIR)
  if (!isDir(frozen) || dirDigest(frozen).sha256 !== web.sha256) {
    throw new ReleaseError(
      `the frozen web bundle ${rel(ctx, frozen)}/ is missing or no longer matches what build.web verified — it cannot be trusted; --abort and start the release over.`
    )
  }
  const distWeb = join(ctx.root, 'dist-web')
  if (isDir(distWeb) && dirDigest(distWeb).sha256 === web.sha256) return false
  ctx.log('  dist-web/ differs from the frozen bundle — restoring it from the frozen copy (not rebuilding)')
  replaceDir(frozen, distWeb)
  if (dirDigest(distWeb).sha256 !== web.sha256) {
    throw new ReleaseError('dist-web/ still differs from the frozen bundle after restoring it — check the disk, then --resume.')
  }
  return true
}

const gradlew = (platform) => (platform === 'win32' ? 'android\\gradlew.bat' : 'android/gradlew')

/** Step build.android. The SCRIPTORIUM_* signing variables reach Gradle through ctx.env. */
export function buildAndroid(ctx) {
  const restored = ensureFrozenWeb(ctx)
  runChecked(ctx, 'npx', ['cap', 'sync', 'android'], { ...STREAM, hint: 'fix the Capacitor sync, then run the release again.' })

  // A stale APK from an earlier build must never be what gets copied below: remove it first, so
  // the file only exists if this Gradle run produced it.
  const built = join(ctx.root, ...APK_BUILD_PATH.split('/'))
  rmSync(built, { force: true })
  runChecked(ctx, gradlew(ctx.platform), ['-p', 'android', ':app:assembleRelease'], {
    ...STREAM,
    hint: 'fix the Android build, then run the release again.'
  })
  if (!existsSync(built)) throw new ReleaseError(`Gradle finished but ${APK_BUILD_PATH} does not exist — check the build output above.`)
  runChecked(ctx, 'node', ['scripts/verify-apk.mjs', APK_BUILD_PATH], {
    ...STREAM,
    hint: 'the APK failed verification (see above) — do NOT publish it; a wrong signing key cannot be fixed after release.'
  })

  const name = apkName(ctx.version)
  const target = join(outDir(ctx), name)
  copyFileSync(built, target)
  const apk = describeFile(target, name)
  if (apk.sha256 !== describeFile(built, name).sha256) throw new ReleaseError(`the copy ${rel(ctx, target)} differs from the built APK — run the release again.`)
  ctx.log(`  ${name} (${apk.size} bytes)`)
  return { apk, distWebRestored: restored }
}

// --------------------------------------------------------------------------- windows

/** Step build.windows. */
export function buildWindows(ctx) {
  const releaseFolder = join(ctx.root, 'release')
  const names = [exeName(ctx.version), blockmapName(ctx.version), LATEST_YML]
  // release/ keeps every installer ever built; drop this version's three files first so what is
  // checked and copied below can only be what this electron-builder run wrote.
  for (const name of names) rmSync(join(releaseFolder, name), { force: true })

  runChecked(ctx, 'npm', ['run', 'build'], { ...STREAM, hint: 'fix the desktop build, then run the release again.' })
  runChecked(ctx, 'npx', ['electron-builder', '--win', '--publish', 'never'], { ...STREAM, hint: 'fix the installer build, then run the release again.' })

  const missing = names.filter((n) => !existsSync(join(releaseFolder, n)))
  if (missing.length) {
    throw new ReleaseError(
      `electron-builder finished but release/ has no ${missing.join(', ')} — check artifactName in electron-builder.yml (expected ${exeName(ctx.version)}).`
    )
  }
  const exeBytes = readFileSync(join(releaseFolder, names[0]))
  checkLatestYml(readFileSync(join(releaseFolder, LATEST_YML), 'utf8'), {
    version: ctx.version,
    exe: { name: names[0], size: exeBytes.length, sha512: sha512Base64(exeBytes) }
  })

  const out = outDir(ctx)
  const recorded = {}
  for (const [key, name] of [
    ['exe', names[0]],
    ['blockmap', names[1]],
    ['latestYml', names[2]]
  ]) {
    copyFileSync(join(releaseFolder, name), join(out, name))
    recorded[key] = describeFile(join(out, name), name)
  }
  ctx.log(`  ${names[0]} (${recorded.exe.size} bytes), latest.yml checked against it`)
  return recorded
}

// --------------------------------------------------------------------------- sums + notes

/** Re-reads a recorded artifact and refuses it if it changed since the step that built it. */
const recheck = (ctx, recorded, step) =>
  verifyRecorded(outDir(ctx), recorded, { step, label: rel(ctx, join(outDir(ctx), recorded.name)), hint: ABORT_HINT })

/** Step build.sums: SHA256SUMS.txt for the installer and the APK, and release-notes.md. */
export function buildSums(ctx) {
  const exe = recheck(ctx, stepData(ctx, 'build.windows').exe, 'build.windows')
  const apk = recheck(ctx, stepData(ctx, 'build.android').apk, 'build.android')
  for (const key of ['blockmap', 'latestYml']) recheck(ctx, stepData(ctx, 'build.windows')[key], 'build.windows')

  const out = outDir(ctx)
  writeFileAtomic(join(out, SUMS_FILE), sha256SumsText([exe, apk]))

  const notes = releaseNotes(readFileSync(join(ctx.root, 'docs', 'CHANGELOG.md'), 'utf8'), ctx.version)
  if (!notes) throw new ReleaseError(`docs/CHANGELOG.md has no "## ${ctx.version}" section any more — restore it from git.`)
  writeFileAtomic(join(out, NOTES_FILE), releaseNotesText({ notes, version: ctx.version, fingerprint: readFingerprint(ctx.root) }))

  return { sums: describeFile(join(out, SUMS_FILE), SUMS_FILE), notes: describeFile(join(out, NOTES_FILE), NOTES_FILE) }
}
