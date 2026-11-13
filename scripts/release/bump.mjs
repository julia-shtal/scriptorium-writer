// scripts/release/bump.mjs
// Stage 2 of a release (step `bump`): put the version into package.json / package-lock.json and
// the date into the CHANGELOG heading, then commit exactly those three files as
// `release: vX.Y.Z`. The commit is local; stage 4 pushes it together with the tag. Everything
// built in stage 3 is built from this commit, so the tag will point at what was really built.
//
// The version lives only in package.json (Gradle derives versionCode from it; electron-builder
// and the web build's version.json read it), so this is the one place a release writes it.
//
// Dry run: the same edits happen in the working tree — the builds must carry the target
// version, or the APK's versionCode and the installer's name would be the old ones — but there
// is no git write at all, and the three files are put back byte for byte through ctx.onFinally,
// whether the run succeeds or a later step throws.
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { isoDay, stampDate } from './changelog.mjs'
import { ReleaseError } from './errors.mjs'
import { runChecked } from './exec.mjs'

/** The files the bump step edits and commits — and nothing else, ever. */
export const BUMP_FILES = ['package.json', 'package-lock.json', 'docs/CHANGELOG.md']

const pathOf = (ctx, rel) => join(ctx.root, ...rel.split('/'))

/** The three files' bytes (null for a file that does not exist), for the dry-run restore. */
function snapshotFiles(ctx) {
  return BUMP_FILES.map((rel) => {
    const file = pathOf(ctx, rel)
    return { file, bytes: existsSync(file) ? readFileSync(file) : null }
  })
}

function restoreFiles(snapshot) {
  for (const { file, bytes } of snapshot) {
    if (bytes === null) rmSync(file, { force: true })
    else writeFileSync(file, bytes)
  }
}

const gitHead = (ctx) => runChecked(ctx, 'git', ['rev-parse', 'HEAD'], { hint: 'check the repository.' }).stdout.trim()

/** The working-tree edits shared by both modes. Returns what changed. */
function editFiles(ctx) {
  const versionChanged = ctx.version !== ctx.currentVersion
  if (versionChanged) {
    runChecked(ctx, 'npm', ['version', ctx.version, '--no-git-tag-version'], {
      hint: 'package.json may be half-edited; check `git status` before running the release again.'
    })
  }
  const written = JSON.parse(readFileSync(pathOf(ctx, 'package.json'), 'utf8')).version
  if (written !== ctx.version) {
    throw new ReleaseError(`package.json says ${written} after the bump, expected ${ctx.version} — check \`git status\` and the npm output above.`)
  }

  const changelogFile = pathOf(ctx, 'docs/CHANGELOG.md')
  const stamped = stampDate(readFileSync(changelogFile, 'utf8'), ctx.version, isoDay(ctx.now()))
  if (!stamped) throw new ReleaseError(`docs/CHANGELOG.md lost its "## ${ctx.version}" section since preflight — restore it from git.`)
  if (stamped.changed) writeFileSync(changelogFile, stamped.text)
  return { versionChanged, changelogStamped: stamped.changed, heading: stamped.heading }
}

/**
 * Step `bump`. Records, on a real run:
 *   parent — HEAD before the release commit; --abort resets to it (only while HEAD == sha).
 *   sha    — the release commit, which stage 4 pushes and tags.
 *   committed — false when there was nothing to commit: the target equals the current version
 *     AND the CHANGELOG heading was already dated. Then parent == sha == HEAD.
 *     --abort (abort.mjs) treats `committed: false` as "no commit to undo": it skips the
 *     `git reset --hard` (a reset to the same commit would still discard working-tree changes)
 *     and only deletes release-out/X.Y.Z/.
 */
export function bumpVersion(ctx) {
  if (ctx.dryRun) {
    // Registered BEFORE the first edit, so a failure halfway through (npm version done, the
    // CHANGELOG write failed) is put back too.
    const snapshot = snapshotFiles(ctx)
    ctx.onFinally(() => restoreFiles(snapshot))
    const edits = editFiles(ctx)
    ctx.log(`  package.json ${ctx.currentVersion} -> ${ctx.version}, CHANGELOG "${edits.heading}" (working tree only; restored when the dry run ends)`)
    return { dryRun: true, from: ctx.currentVersion, to: ctx.version, ...edits }
  }

  const parent = gitHead(ctx)
  const edits = editFiles(ctx)
  if (!edits.versionChanged && !edits.changelogStamped) {
    ctx.log(`  nothing to commit: package.json already ${ctx.version}, CHANGELOG already dated ("${edits.heading}")`)
    return { parent, sha: parent, committed: false, from: ctx.currentVersion, to: ctx.version, ...edits }
  }
  const undo = `\`git checkout -- ${BUMP_FILES.join(' ')}\` drops the edits`
  runChecked(ctx, 'git', ['add', ...BUMP_FILES], { hint: `${undo}; then run the release again.` })
  runChecked(ctx, 'git', ['commit', '-m', `release: v${ctx.version}`], { hint: `the edits are staged — ${undo} (after \`git reset\`); then run the release again.` })
  const sha = gitHead(ctx)
  ctx.log(`  committed release: v${ctx.version} (${sha.slice(0, 7)}) — local only until publish`)
  return { parent, sha, committed: true, from: ctx.currentVersion, to: ctx.version, ...edits }
}
