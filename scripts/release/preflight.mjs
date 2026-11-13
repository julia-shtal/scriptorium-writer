// scripts/release/preflight.mjs
// Stage 1 of a release: everything that can be known to be wrong before anything is changed.
// Each check either returns (with a little data for state.json) or throws a ReleaseError whose
// message says what to do. Nothing here writes to git, package.json or the CHANGELOG — the
// only side effects are `git fetch` (remote-tracking refs, which is what "up to date with
// origin" has to look at) and, in the last step, `npm ci` re-installing node_modules.
//
// The order is cheap-first on purpose: the git, tag, CHANGELOG and tooling checks take seconds,
// the test suites take minutes, and a forgotten CHANGELOG entry should not cost a full test run
// to discover.
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { buildToolVersions, findBuildTool, sdkRoot } from '../android-sdk.mjs'
import { REPO_SLUG } from './artifacts.mjs'
import { findSection } from './changelog.mjs'
import { ReleaseError } from './errors.mjs'
import { firstLine } from './exec.mjs'
import { checkPagesWorktree } from './pages.mjs'
import { parseProperties } from './properties.mjs'
import { releaseOnOrigin, remainingByHand } from './publish.mjs'
import { RESUME_CMD } from './resume.mjs'
import { isDone } from './state.mjs'

const git = (ctx, ...args) => ctx.run('git', args, { cwd: ctx.root, env: ctx.env })
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`
const short = (sha) => String(sha).slice(0, 7)
/** How a preflight message ends: a fresh run is started again, an interrupted one resumed. */
const again = (ctx) => (ctx.resume ? `\`${RESUME_CMD}\` again` : 'run the release again')

/** 1. On main, clean tree, and HEAD exactly equal to origin/main (on --resume past the bump: checkResumedHead). */
export function checkGit(ctx) {
  const branch = git(ctx, 'rev-parse', '--abbrev-ref', 'HEAD')
  if (branch.error) {
    throw new ReleaseError(`could not run git (${branch.error.message}) — is Git installed and on PATH?`)
  }
  if (branch.status !== 0) {
    throw new ReleaseError(`git could not read the current branch: ${firstLine(branch.stderr)}`)
  }
  const name = branch.stdout.trim()
  if (name !== 'main') {
    throw new ReleaseError(`releases are cut from main, but this checkout is on "${name}" — run \`git switch main\` first.`)
  }

  // --porcelain lists untracked files too, which is intended: an untracked file next to the
  // sources can change what the build picks up. release-out/ is gitignored, so it never shows.
  const status = git(ctx, 'status', '--porcelain')
  if (status.status !== 0) throw new ReleaseError(`git status failed: ${firstLine(status.stderr)}`)
  const dirty = status.stdout.split(/\r?\n/).filter((l) => l.trim())
  if (dirty.length) {
    throw new ReleaseError(
      `the working tree is not clean (${plural(dirty.length, 'changed file')}, first: ${dirty[0].trim()}) — commit or stash them, then ${again(ctx)}.`
    )
  }

  const fetch = git(ctx, 'fetch', 'origin', 'main')
  if (fetch.status !== 0) {
    throw new ReleaseError(`could not fetch origin/main (${firstLine(fetch.stderr) || 'no output'}) — check the network and try again.`)
  }
  const head = git(ctx, 'rev-parse', 'HEAD')
  const remote = git(ctx, 'rev-parse', 'origin/main')
  if (head.status !== 0 || remote.status !== 0) {
    throw new ReleaseError(`git could not resolve HEAD or origin/main: ${firstLine(head.stderr || remote.stderr)}`)
  }
  const headSha = head.stdout.trim()
  const remoteSha = remote.stdout.trim()
  const bump = ctx.resume ? ctx.state?.steps?.bump : undefined
  if (bump?.done) return checkResumedHead(ctx, headSha, remoteSha, bump)
  if (headSha === remoteSha) return { head: headSha }

  const counts = git(ctx, 'rev-list', '--left-right', '--count', 'HEAD...origin/main')
  const [ahead, behind] = counts.stdout.trim().split(/\s+/).map(Number)
  if (counts.status !== 0 || !Number.isInteger(ahead) || !Number.isInteger(behind)) {
    throw new ReleaseError('main and origin/main differ, and git could not count by how much — compare them by hand.')
  }
  // Ahead is refused too: the release commit goes on top of HEAD and is pushed in stage 4, so
  // unpushed work would ride along into the release without having been on origin first.
  if (ahead && behind) {
    throw new ReleaseError(
      `main has diverged from origin/main (${ahead} ahead, ${behind} behind) — reconcile them (git pull --rebase or a merge), then ${again(ctx)}.`
    )
  }
  if (behind) {
    throw new ReleaseError(`main is ${plural(behind, 'commit')} behind origin/main — run \`git pull\` first.`)
  }
  throw new ReleaseError(`main is ${plural(ahead, 'commit')} ahead of origin/main — push first (\`git push origin main\`), then ${again(ctx)}.`)
}

/**
 * preflight.git on --resume once the bump commit exists.
 *
 * Before publish.push is done, the release commit still has to be pushed as built: HEAD must be
 * exactly it (an extra commit on top would ride along untested; a reset would leave nothing to
 * tag), and origin/main must still be where the release left it — the pre-release HEAD
 * (bump.parent) — or already contain the release commit, when the run died between pushing main
 * and recording publish.push (someone may have pushed on top since; publish.push then skips
 * pushing main). Anything else means someone pushed to main before the release commit got there,
 * and the push would no longer be a fast-forward of what was built.
 *
 * Once publish.push is done, steps 12–15 never touch this checkout: they upload files from
 * release-out/, deploy the gh-pages worktree and talk to GitHub. So HEAD is not checked any more
 * (a fix committed and pushed meanwhile is fine; checkGit still wants main and a clean tree), and
 * the one thing that matters is that the release commit is still part of origin/main's history
 * (`git merge-base --is-ancestor`). If it is not, origin was force-pushed under the release: the
 * pushed tag marks a commit main no longer contains, and that is for a human to sort out — never
 * by force-pushing again.
 */
function checkResumedHead(ctx, head, remote, bump) {
  const tag = `v${ctx.version}`
  if (ctx.state.steps['publish.push']?.done === true) {
    if (releaseOnOrigin(ctx, bump.sha)) return { head }
    const todo = remainingByHand({ root: ctx.root, state: ctx.state, env: ctx.env })
    throw new ReleaseError(
      `the release commit ${short(bump.sha)} that publish.push pushed is no longer in origin/main's history — it was rewritten (force-pushed) mid-release. Do NOT force-push to put it back. The tag ${tag} still marks what was built; finish the remaining steps by hand: ${todo.join('; ') || 'none are left'}.`,
      { final: true }
    )
  }
  if (head !== bump.sha) {
    throw new ReleaseError(
      `HEAD is ${short(head)}, but this release was built from ${short(bump.sha)} ("release: ${tag}") — put main back on it (\`git switch main\`, move any extra commits to a branch, \`git reset --hard ${bump.sha}\`), then \`${RESUME_CMD}\`; to drop the release instead, get HEAD back on ${short(bump.sha)} first, then --abort.`
    )
  }
  if (remote === bump.parent) return { head }
  // publish.push may have pushed main and died before recording it — and someone may have
  // pushed on top since. The release commit is then on origin already: publish.push goes on
  // (it skips pushing main and tags the release commit), it is not a reason to start over.
  if (remote === bump.sha || releaseOnOrigin(ctx, bump.sha)) return { head }
  throw new ReleaseError(
    `origin/main moved to ${short(remote)} since the release started from ${short(bump.parent)} — the release commit can no longer be pushed as built; --abort, \`git pull\`, and start the release again.`
  )
}

/**
 * preflight.tag on --resume once the bump commit exists. publish.push may have been cut off
 * after `git tag` or after the tag push, so the tag may exist — but only as this release's own:
 * locally on the release commit, and on origin as the very same tag object. Once publish.push is
 * recorded done, the tag must be on origin (gh release create --verify-tag relies on it).
 */
function checkResumedTag(ctx, tag, bump) {
  const run = (...args) => {
    const res = git(ctx, ...args)
    if (res.status !== 0) throw new ReleaseError(`\`git ${args.join(' ')}\` failed: ${firstLine(res.stderr) || `exit ${res.status}`}`)
    return res.stdout.trim()
  }
  const hasLocal = Boolean(run('tag', '-l', tag))
  if (hasLocal) {
    const commit = run('rev-parse', `${tag}^{commit}`)
    if (commit !== bump.sha) {
      throw new ReleaseError(
        `tag ${tag} points at ${short(commit)}, not the release commit ${short(bump.sha)} — it is not this release's tag; inspect it (\`git show ${tag}\`).`
      )
    }
  }
  const remote = git(ctx, 'ls-remote', '--tags', 'origin', `refs/tags/${tag}`)
  if (remote.status !== 0) {
    throw new ReleaseError(`could not list tags on origin (${firstLine(remote.stderr) || 'no output'}) — check the network and try again.`)
  }
  const remoteLine = remote.stdout.split(/\r?\n/).find((l) => l.trim().endsWith(`refs/tags/${tag}`))
  if (remoteLine) {
    const object = remoteLine.trim().split(/\s+/)[0]
    if (!hasLocal || run('rev-parse', `refs/tags/${tag}`) !== object) {
      throw new ReleaseError(
        `tag ${tag} on origin is not the one this release created${hasLocal ? '' : ' (there is no local tag at all)'} — inspect it (\`git fetch origin tag ${tag}\`, \`git show ${tag}\`) before going on.`
      )
    }
  } else if (ctx.state.steps['publish.push']?.done) {
    throw new ReleaseError(`state.json says publish.push is done, but origin has no tag ${tag} — push it (\`git push origin ${tag}\`), then --resume again.`)
  }
  return { tag, local: hasLocal, remote: Boolean(remoteLine) }
}

/** 2. Tag vX.Y.Z exists neither locally nor on origin (on --resume: or is this release's own). */
export function checkTag(ctx) {
  const tag = `v${ctx.version}`
  const bump = ctx.resume ? ctx.state?.steps?.bump : undefined
  if (bump?.done) return checkResumedTag(ctx, tag, bump)
  const local = git(ctx, 'tag', '-l', tag)
  if (local.status !== 0) throw new ReleaseError(`git tag -l failed: ${firstLine(local.stderr)}`)
  if (local.stdout.trim()) {
    throw new ReleaseError(`tag ${tag} already exists locally — ${ctx.version} has been released; pick a higher version.`)
  }
  const remote = git(ctx, 'ls-remote', '--tags', 'origin', `refs/tags/${tag}`)
  if (remote.status !== 0) {
    throw new ReleaseError(`could not list tags on origin (${firstLine(remote.stderr) || 'no output'}) — check the network and try again.`)
  }
  if (remote.stdout.trim()) {
    throw new ReleaseError(
      `tag ${tag} already exists on origin — ${ctx.version} has been released; pick a higher version (\`git fetch --tags\` to see it locally).`
    )
  }
  return { tag }
}

/** 3. docs/CHANGELOG.md has a `## X.Y.Z` section with at least one bullet. */
export function checkChangelog(ctx) {
  const file = join(ctx.root, 'docs', 'CHANGELOG.md')
  if (!existsSync(file)) throw new ReleaseError('docs/CHANGELOG.md does not exist — the release notes are taken from it.')
  const section = findSection(readFileSync(file, 'utf8'), ctx.version)
  if (!section) {
    throw new ReleaseError(
      `docs/CHANGELOG.md has no "## ${ctx.version}" section — add one ("## ${ctx.version} — unreleased" with at least one "- " bullet), commit it, then ${again(ctx)}.`
    )
  }
  if (!section.bullets) {
    throw new ReleaseError(
      `the "${section.heading}" section in docs/CHANGELOG.md has no "- " bullet — say what changed, commit it, then ${again(ctx)}.`
    )
  }
  return { heading: section.heading, bullets: section.bullets }
}

// The four variables android/app/build.gradle reads when android/keystore.properties is absent.
// Same names, same all-or-none rule, so preflight and Gradle can never disagree about whether
// the release APK will be signed.
export const KEYSTORE_ENV_VARS = [
  'SCRIPTORIUM_KEYSTORE_FILE',
  'SCRIPTORIUM_KEYSTORE_PASSWORD',
  'SCRIPTORIUM_KEY_ALIAS',
  'SCRIPTORIUM_KEY_PASSWORD'
]

/**
 * Where the release keystore comes from, and the path of the keystore file itself — resolved
 * exactly as android/app/build.gradle resolves it: rootProject.file(), i.e. relative to android/,
 * absolute paths unchanged. Only storeFile is looked at; the passwords are neither read into
 * anything that is logged nor written anywhere — Gradle reads them at build time.
 */
function locateKeystore(ctx) {
  const androidDir = join(ctx.root, 'android')
  const propsFile = join(androidDir, 'keystore.properties')
  if (existsSync(propsFile)) {
    const storeFile = parseProperties(readFileSync(propsFile, 'utf8')).get('storeFile')
    if (!storeFile) {
      throw new ReleaseError('android/keystore.properties has no storeFile — see android/keystore.properties.example.')
    }
    return { source: 'android/keystore.properties', keystoreFile: resolve(androidDir, storeFile) }
  }
  const missing = KEYSTORE_ENV_VARS.filter((name) => !ctx.env[name])
  if (missing.length === KEYSTORE_ENV_VARS.length) {
    throw new ReleaseError(
      'no release signing key: android/keystore.properties is missing and the SCRIPTORIUM_* signing variables are not set — see android/keystore.properties.example.'
    )
  }
  if (missing.length) {
    throw new ReleaseError(`the SCRIPTORIUM_* signing variables are only partly set (missing: ${missing.join(', ')}) — set all four or none.`)
  }
  return { source: 'SCRIPTORIUM_* environment variables', keystoreFile: resolve(androidDir, ctx.env.SCRIPTORIUM_KEYSTORE_FILE) }
}

/** 4. gh is authenticated and no GitHub release exists yet, a signing key is configured and its
 *  keystore file exists, apksigner is installed. */
export function checkTools(ctx) {
  const gh = ctx.run('gh', ['auth', 'status'], { cwd: ctx.root, env: ctx.env })
  if (gh.error) {
    throw new ReleaseError(`could not run gh (${gh.error.message}) — install the GitHub CLI from https://cli.github.com and run \`gh auth login\`.`)
  }
  if (gh.status !== 0) {
    throw new ReleaseError(`gh is not signed in to GitHub — run \`gh auth login\`, then ${again(ctx)}.`)
  }

  // A release can exist without its tag (a draft created by hand, or left by a run whose tag
  // push was undone), and `gh release create` would then fail at the very end, after the push.
  // On --resume any release found is this script's own draft — publish.draft may have been cut
  // off after `gh release create` and before state.json recorded it — and publish.draft adopts
  // it (uploading only what is missing, refusing one that is already public), so the check must
  // not run there.
  if (!ctx.resume) {
    const tag = `v${ctx.version}`
    const view = ctx.run('gh', ['release', 'view', tag, '--json', 'tagName', '--repo', REPO_SLUG], { cwd: ctx.root, env: ctx.env })
    if (view.status === 0) {
      throw new ReleaseError(
        `a GitHub release ${tag} already exists (possibly a draft) — delete it on GitHub if it is a leftover, or pick a higher version.`
      )
    }
    if (!/release not found/i.test(`${view.stderr}${view.stdout}`)) {
      throw new ReleaseError(`could not check GitHub for a release ${tag} (${firstLine(view.stderr) || `exit ${view.status}`}) — check the network and try again.`)
    }
  }

  const { source: keystore, keystoreFile } = locateKeystore(ctx)
  if (!existsSync(keystoreFile)) {
    throw new ReleaseError(`the release keystore ${keystoreFile} (from ${keystore}) does not exist — fix the path; the APK cannot be signed without it.`)
  }

  const sdk = sdkRoot(ctx.env)
  if (!sdk) {
    throw new ReleaseError('ANDROID_HOME (or ANDROID_SDK_ROOT) is not set, so apksigner cannot be found — point it at your Android SDK.')
  }
  const buildTools = join(sdk, 'build-tools')
  const apksigner = findBuildTool(buildTools, buildToolVersions(buildTools), 'apksigner', '.bat', ctx.platform)
  if (!apksigner) {
    throw new ReleaseError(`no apksigner under ${buildTools} — install Android SDK Build-Tools (Android Studio > SDK Manager > SDK Tools).`)
  }
  // The gh-pages worktree is only used at step 13, after the tag is pushed and the draft exists;
  // a missing or misplaced one should stop the release here instead (dry runs included). Once
  // publish.pages is done on a resume, the worktree no longer matters.
  const pages = isDone(ctx.state, 'publish.pages') ? null : checkPagesWorktree(ctx, `, then ${again(ctx)}`).dir
  return { keystore, keystoreFile, apksigner: apksigner.path, pagesDir: pages }
}

// The gates every release has always been run through by hand (internal release procedure,
// step 1), in the same order. `npm ci` first so the checks run against the lockfile, not
// whatever happens to be in node_modules.
export const CHECK_COMMANDS = [
  ['ci'],
  ['run', 'typecheck'],
  ['run', 'lint'],
  ['test'],
  ['run', 'test:browser']
]

/**
 * 5. npm ci, typecheck, lint, the node suite and the browser suite, output streamed.
 *
 * Not re-run on --resume once state.json records it done, provided the code is still the code
 * it ran on. They take minutes, and they gate what gets BUILT: when bump is done, every artifact
 * already in release-out/ was built from the bump commit on top of the checked HEAD, and
 * preflight.git has just confirmed HEAD is still exactly that commit — re-running them would
 * prove nothing about the artifacts, which are never rebuilt. When the run stopped before the
 * bump commit, the skip only holds if HEAD is still the commit the checks ran on
 * (preflight.git.head); otherwise they run again.
 */
export function checkSuites(ctx) {
  if (ctx.resume && ctx.state?.steps?.['preflight.checks']?.done) {
    const checkedHead = ctx.state.steps['preflight.git']?.head
    const sameCode = ctx.state.steps.bump?.done || git(ctx, 'rev-parse', 'HEAD').stdout.trim() === checkedHead
    if (sameCode) {
      ctx.log(`  skipped on --resume: they passed on ${short(checkedHead)} and the code has not changed since`)
      return {}
    }
    ctx.log('  HEAD moved since they passed — running them again')
  }
  for (const args of CHECK_COMMANDS) {
    const label = `npm ${args.join(' ')}`
    ctx.log(`  > ${label}`)
    const res = ctx.run('npm', args, { cwd: ctx.root, env: ctx.env, capture: false })
    if (res.error) throw new ReleaseError(`could not run npm (${res.error.message}) — is Node.js on PATH?`)
    if (res.status !== 0) {
      throw new ReleaseError(`\`${label}\` failed (exit ${res.status ?? 'signal'}) — fix it on main, then ${again(ctx)}.`)
    }
  }
  return { commands: CHECK_COMMANDS.map((a) => `npm ${a.join(' ')}`) }
}
