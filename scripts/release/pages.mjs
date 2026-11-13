// scripts/release/pages.mjs
// Step publish.pages: deploy the frozen PWA bundle (release-out/X.Y.Z/web/, the one build.web
// verified and Android was synced from) to GitHub Pages through the gh-pages worktree next to
// the repo. Never a rebuild — a rebuilt bundle is one nobody verified — and never robocopy /MIR,
// whose purge would happily follow a wrong path out of the worktree.
//
// Before anything is touched, the worktree must be:
//   - the top of its own git worktree (`git rev-parse --show-toplevel`), so `git rm -rf .` can
//     only ever empty that worktree — not a subfolder of the main repo a wrong path points into;
//   - on gh-pages;
//   - clean, because everything in it is replaced: a stray uncommitted edit there would
//     otherwise be deployed, or lost;
//   - level with origin/gh-pages (after a fetch), so the final push cannot be rejected as a
//     non-fast-forward halfway through the step.
// The exception to the last two is what this step itself leaves when it is interrupted: it marks
// itself started in state.json before touching anything, and on a resume it accepts a dirty tree
// and its own unpushed deploy commit (HEAD ahead of origin/gh-pages, which it then pushes).
//
// Files are added and committed with core.autocrlf=false: the bytes served must be the bytes
// that were verified, whatever the machine's git config says about line endings.
//
// Re-running is safe at every point: the tree is emptied and refilled from the same frozen
// bundle, a commit is made only if that changed anything, and the push always runs (pushing an
// already-pushed branch is a no-op, and a commit whose push failed gets pushed this time).
import { cpSync, existsSync, realpathSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { WEB_DIR, dirDigest, isDir } from './artifacts.mjs'
import { stepData } from './build.mjs'
import { ReleaseError } from './errors.mjs'
import { firstLine, runChecked } from './exec.mjs'
import { pagesDir, resumeHint } from './publish.mjs'
import { RESUME_CMD } from './resume.mjs'
import { isStarted, markStarted, releaseDir, writeState } from './state.mjs'

export const PAGES_BRANCH = 'gh-pages'
const STEP = 'publish.pages'
const NO_AUTOCRLF = ['-c', 'core.autocrlf=false']

/**
 * Whether two paths name the same directory: symlinks and Windows 8.3 short names resolved
 * (realpath.native), separators and a trailing slash ignored, case ignored on Windows — git
 * prints "C:/Users/…" where Node has "C:\Users\…".
 */
export function samePath(a, b, platform = process.platform) {
  const norm = (p) => {
    let s = existsSync(p) ? realpathSync.native(p) : p
    s = s.replace(/\\/g, '/').replace(/\/+$/, '')
    return platform === 'win32' ? s.toLowerCase() : s
  }
  return norm(a) === norm(b)
}

/**
 * The gh-pages worktree exists, is the top of its own git worktree (so `git rm -rf .` can only
 * empty that tree), and is on gh-pages. Cheap and read-only, so preflight.tools runs it too:
 * a missing worktree should stop the release before anything is committed or pushed, not at
 * step 13 after the tag is out. Clean and level-with-origin are NOT checked here — those belong
 * to the moment of deploying, and an interrupted deploy legitimately leaves a dirty tree.
 * `then` ends each message with what to do after fixing it (", then <command>").
 * Returns { dir } as configured (relative to the repo, or absolute).
 */
export function checkPagesWorktree(ctx, then) {
  const dirSetting = pagesDir(ctx.env)
  const dir = resolve(ctx.root, dirSetting)
  const create = `\`git worktree add ${dirSetting} ${PAGES_BRANCH}\` (or set SCRIPTORIUM_PAGES_DIR)`
  if (!isDir(dir)) {
    throw new ReleaseError(`the gh-pages worktree ${dir} does not exist — create it with ${create}${then}.`)
  }
  const show = ctx.run('git', ['rev-parse', '--show-toplevel'], { cwd: dir, env: ctx.env })
  if (show.error || show.status !== 0) {
    const reason = show.error ? show.error.message : firstLine(show.stderr) || `exit ${show.status}`
    throw new ReleaseError(`${dir} is not a git worktree (${reason}) — create the gh-pages worktree with ${create}${then}.`)
  }
  const top = show.stdout.trim()
  if (!samePath(top, dir, ctx.platform)) {
    throw new ReleaseError(
      `${dir} is not the top of a git worktree (git says the worktree is ${top}) — \`git rm -rf .\` there would empty the wrong tree; create the gh-pages worktree with ${create}${then}.`
    )
  }
  const branch = runChecked(ctx, 'git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: dir, hint: `check ${dir}${then}.` }).stdout.trim()
  if (branch !== PAGES_BRANCH) {
    throw new ReleaseError(
      `${dirSetting} is on "${branch}", not ${PAGES_BRANCH} — deploying there would publish the bundle on the wrong branch; \`git -C ${dirSetting} switch ${PAGES_BRANCH}\`, or point SCRIPTORIUM_PAGES_DIR at the gh-pages worktree (${create.split(' (')[0]})${then}.`
    )
  }
  return { dir: dirSetting }
}

/** Step publish.pages. Records { dir, commit, committed }. */
export function deployPages(ctx) {
  const tag = `v${ctx.version}`
  const dirSetting = pagesDir(ctx.env)
  const dir = resolve(ctx.root, dirSetting)
  const started = isStarted(ctx.state, STEP)
  // Every git command below runs in the worktree, and a manual command quoted in an error has to
  // say so: `git -C <dir> ...` is the copy-pasteable form of "in that directory".
  const inPages = (args) => `git -C ${dirSetting} ${args.join(' ')}`
  const git = (args, hint = resumeHint(inPages(args))) => runChecked(ctx, 'git', args, { cwd: dir, hint })
  const isAncestor = (a, b) => {
    const args = ['merge-base', '--is-ancestor', a, b]
    const res = ctx.run('git', args, { cwd: dir, env: ctx.env })
    if (res.error || (res.status !== 0 && res.status !== 1)) {
      throw new ReleaseError(`\`${inPages(args)}\` failed (${res.error ? res.error.message : firstLine(res.stderr) || `exit ${res.status}`}) — ${resumeHint(inPages(args))}`)
    }
    return res.status === 0
  }

  // Preflight checked this too, but the worktree may have changed since (a long build, a resume
  // days later), and `git rm -rf .` must never run anywhere else.
  checkPagesWorktree(ctx, `, then \`${RESUME_CMD}\``)
  const dirty = git(['status', '--porcelain']).stdout.split(/\r?\n/).filter((l) => l.trim())
  if (dirty.length && !started) {
    throw new ReleaseError(
      `the gh-pages worktree ${dirSetting} is not clean (first: ${dirty[0].trim()}) — everything in it is replaced by the deploy; commit or discard that change (\`${inPages(['status'])}\`), then \`${RESUME_CMD}\`.`
    )
  }

  // The bundle about to be served must be byte for byte the one build.web verified.
  const web = stepData(ctx, 'build.web', 'publishing cannot go on without it; inspect state.json — it is not what this script wrote.')
  const frozen = join(releaseDir(ctx.root, ctx.version), WEB_DIR)
  if (!isDir(frozen) || dirDigest(frozen).sha256 !== web.sha256) {
    throw new ReleaseError(
      `the frozen web bundle ${frozen} is missing or no longer matches what build.web verified — it must not be deployed; restore it, then \`${RESUME_CMD}\`.`
    )
  }

  // Level with origin, so the push at the end is a fast-forward. On a resume of this step HEAD
  // may be ahead by the deploy commit the interrupted run made but did not push.
  git(['fetch', 'origin', PAGES_BRANCH])
  const head = git(['rev-parse', 'HEAD']).stdout.trim()
  const remote = git(['rev-parse', `origin/${PAGES_BRANCH}`]).stdout.trim()
  if (head !== remote && !(started && isAncestor(`origin/${PAGES_BRANCH}`, 'HEAD'))) {
    const behind = isAncestor('HEAD', `origin/${PAGES_BRANCH}`)
    throw new ReleaseError(
      behind
        ? `${dirSetting} is behind origin/${PAGES_BRANCH} (someone deployed meanwhile) — \`${inPages(['pull', '--ff-only'])}\`${dirty.length ? ` (after \`${inPages(['reset', '--hard'])}\`, which only drops the interrupted deploy's changes)` : ''}, then \`${RESUME_CMD}\`.`
        : `${dirSetting} has commits origin/${PAGES_BRANCH} does not (${head.slice(0, 7)} vs ${remote.slice(0, 7)}) — push or drop them (\`${inPages(['log', `origin/${PAGES_BRANCH}..HEAD`])}\`), then \`${RESUME_CMD}\`.`
    )
  }
  if (dirty.length || head !== remote) ctx.log(`  ${dirSetting} has what the interrupted deploy left — redoing it from the frozen bundle`)

  markStarted(ctx.state, STEP, ctx.now())
  writeState(ctx.stateFile, ctx.state)

  git(['rm', '-rf', '.', '--quiet', '--ignore-unmatch'])
  cpSync(frozen, dir, { recursive: true, force: true })
  // Without it Pages runs Jekyll, which drops every file and folder starting with "_".
  writeFileSync(join(dir, '.nojekyll'), '')
  git([...NO_AUTOCRLF, 'add', '-A'])

  const staged = ctx.run('git', ['diff', '--cached', '--quiet'], { cwd: dir, env: ctx.env })
  if (staged.error || (staged.status !== 0 && staged.status !== 1)) {
    const reason = staged.error ? staged.error.message : firstLine(staged.stderr) || `exit ${staged.status}`
    throw new ReleaseError(`\`${inPages(['diff', '--cached', '--quiet'])}\` failed (${reason}) — ${resumeHint(inPages(['status']))}`)
  }
  const committed = staged.status === 1
  if (committed) {
    git([...NO_AUTOCRLF, 'commit', '-m', `deploy ${tag}`], resumeHint(inPages([...NO_AUTOCRLF, 'commit', '-m', `"deploy ${tag}"`])))
  } else {
    ctx.log(`  ${dirSetting} already holds this bundle — no commit`)
  }
  git(['push', 'origin', PAGES_BRANCH])
  const commit = git(['rev-parse', 'HEAD']).stdout.trim()
  ctx.log(`  deployed ${web.files} files to ${PAGES_BRANCH} (${commit.slice(0, 7)})`)
  return { dir: dirSetting, commit, committed }
}
