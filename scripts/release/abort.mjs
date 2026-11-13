// scripts/release/abort.mjs
// `npm run release -- --abort`: drop an interrupted release while that can still be done
// without anyone noticing — i.e. before publish.push put anything on origin. It undoes the bump
// commit and deletes release-out/X.Y.Z/, and nothing else.
//
// The reset is guarded three ways, because `git reset --hard` is the one command in this script
// that can destroy work: it runs only when HEAD is exactly the recorded bump commit (anything on
// top of it would be lost), only on a clean tree (--hard discards uncommitted edits too), and
// only when the bump actually made a commit — with `committed: false` parent == sha == HEAD and
// there is nothing to undo. It resets to `bump.parent`, which the bump step recorded itself,
// never to preflight.git.head.
//
// Once publish.push is done the release is on origin and possibly public, so --abort refuses
// and prints the commands that withdraw it by hand, for exactly the steps that are done. The
// script never deletes a pushed tag or a GitHub release on its own.
import { rmSync } from 'node:fs'
import { dirname, relative } from 'node:path'
import { ReleaseError } from './errors.mjs'
import { firstLine } from './exec.mjs'
import { ghLine, pagesDir, releaseOnOrigin } from './publish.mjs'
import { FIRST_PUBLISH_STEP, RESUME_CMD } from './resume.mjs'
import { isDone, isStarted } from './state.mjs'

const short = (sha) => String(sha).slice(0, 7)

/** The manual commands that withdraw a release whose publish steps are (partly) done. */
export function withdrawCommands(state, env = {}) {
  const tag = `v${state.version}`
  const steps = state.steps
  const cmds = []
  if (isDone(state, 'publish.undraft')) {
    cmds.push(`the release is PUBLIC and clients may already have updated — prefer shipping a fixed higher version; to withdraw it anyway: \`${ghLine('delete', tag, '--yes')}\``)
  } else if (isDone(state, 'publish.draft') || isDone(state, FIRST_PUBLISH_STEP)) {
    cmds.push(`\`${ghLine('delete', tag, '--yes')}\` (the draft, if there is one)`)
  }
  cmds.push(`\`git push origin :refs/tags/${tag}\` and \`git tag -d ${tag}\``)
  if (isDone(state, 'publish.pages') || isStarted(state, 'publish.pages')) {
    const dir = pagesDir(env)
    const commit = steps['publish.pages']?.commit
    cmds.push(
      commit
        ? `\`git -C ${dir} revert --no-edit ${commit}\` and \`git -C ${dir} push origin gh-pages\` (the PWA deploy)`
        : `check \`git -C ${dir} log -1\` and \`git -C ${dir} status\` for a half-done PWA deploy`
    )
  }
  if (steps.bump?.committed) cmds.push(`the release commit ${short(steps.bump.sha)} stays on main (\`git revert ${steps.bump.sha}\` if it must go)`)
  cmds.push(`then delete release-out/${state.version}/`)
  return cmds
}

/**
 * Drops the release recorded in `state` (read from `file`). deps: { root, run, env, log }.
 * Throws a ReleaseError when it must not.
 */
export function abortRelease({ root, run, env = {}, log = () => {} }, { file, state }) {
  const tag = `v${state.version}`
  const dir = dirname(file)
  const where = relative(root, dir).split('\\').join('/')
  const git = (...args) => run('git', args, { cwd: root, env })
  const gitOut = (...args) => {
    const res = git(...args)
    if (res.error) throw new ReleaseError(`could not run git (${res.error.message}) — is Git installed and on PATH? Nothing was changed.`)
    if (res.status !== 0) throw new ReleaseError(`\`git ${args.join(' ')}\` failed (${firstLine(res.stderr) || `exit ${res.status}`}) — nothing was changed.`)
    return res.stdout.trim()
  }

  if (!state.dryRun) {
    if (isDone(state, FIRST_PUBLISH_STEP)) {
      throw new ReleaseError(
        `v${state.version} was already pushed (publish.push is done), so --abort cannot undo it. Either finish it with \`${RESUME_CMD}\`, or withdraw it by hand: ${withdrawCommands(state, env).join('; ')}.`
      )
    }
    const bump = state.steps.bump
    if (bump?.done) {
      // publish.push may have been cut off after tagging: a local tag means it got that far, and
      // whether the tag also reached origin is not something to guess about before resetting.
      if (gitOut('tag', '-l', tag)) {
        throw new ReleaseError(
          `tag ${tag} exists, so the interrupted publish.push got as far as tagging — finish with \`${RESUME_CMD}\`, or remove it by hand (\`git push origin :refs/tags/${tag}\` if it reached origin, \`git tag -d ${tag}\`), then --abort again.`
        )
      }
      if (bump.committed) {
        // A reset moves whatever branch is checked out; the release commit only ever lives on main.
        const branch = gitOut('rev-parse', '--abbrev-ref', 'HEAD')
        if (branch !== 'main') {
          throw new ReleaseError(`this checkout is on "${branch}", and --abort resets main — \`git switch main\` first, then --abort again.`)
        }
        const head = gitOut('rev-parse', 'HEAD')
        if (head !== bump.sha) {
          throw new ReleaseError(
            `HEAD is ${short(head)}, not the release commit ${short(bump.sha)} — --abort only undoes the release commit while it is on top; reset by hand (\`git reset --hard ${bump.parent}\` drops it and everything after it), then delete ${where}/.`
          )
        }
        // The remote-tracking ref moves when `git push origin main` succeeds, so this needs no
        // network: if origin/main contains the release commit (as its tip, or under commits
        // someone pushed since), it was pushed and cannot be reset away.
        if (releaseOnOrigin({ root, run, env }, bump.sha)) {
          throw new ReleaseError(
            `the release commit ${short(bump.sha)} is already on origin/main (publish.push was interrupted after pushing main) — finish with \`${RESUME_CMD}\`, or \`git revert ${bump.sha}\` and push; then delete ${where}/.`
          )
        }
        const dirty = gitOut('status', '--porcelain')
        if (dirty) {
          throw new ReleaseError(
            `the working tree has uncommitted changes (first: ${dirty.split(/\r?\n/)[0].trim()}) and --abort runs \`git reset --hard\`, which would discard them — commit or stash them, then --abort again.`
          )
        }
        gitOut('reset', '--hard', bump.parent)
        log(`  reset main to ${short(bump.parent)}: the "release: ${tag}" commit is gone`)
      } else {
        log('  the bump made no commit, so there is nothing to reset')
      }
    } else {
      // The bump may have been cut off between `git commit` and state.json recording it: then
      // HEAD is a "release: vX.Y.Z" commit on top of what preflight checked, and nothing in
      // state.json says so. It is not reset automatically — the record that would justify a
      // reset is exactly what is missing — but the exact command is given.
      const checked = state.steps['preflight.git']?.head
      const head = gitOut('rev-parse', 'HEAD')
      if (checked && head !== checked && gitOut('log', '-1', '--format=%s') === `release: ${tag}`) {
        throw new ReleaseError(
          `HEAD ${short(head)} is a "release: ${tag}" commit that state.json never recorded — the bump was cut off right after committing. Check \`git log -2\` (its parent should be ${short(checked)}), drop it with \`git reset --hard ${checked}\`, then --abort again.`
        )
      }
      log(`  no bump commit was recorded; if the bump was cut off halfway, \`git status\` shows its edits (\`git checkout -- package.json package-lock.json docs/CHANGELOG.md\` drops them)`)
    }
  }

  rmSync(dir, { recursive: true, force: true })
  log(`  deleted ${where}/`)
  log(`release: v${state.version} ${state.dryRun ? '(dry run) ' : ''}is aborted — nothing of it was pushed or published.`)
}
