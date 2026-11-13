// scripts/release/pipeline.mjs
// The release as an ordered list of steps with stable ids. Order is the whole design: nothing
// becomes visible to users until every artifact is built and verified, so the list runs
// preflight -> bump -> build -> publish and never interleaves them. The ids are what
// release-out/X.Y.Z/state.json records, so they must never be renamed once a release has used
// them — a renamed id reads as "not done" and the step runs twice.
//
// Persistence rule: preflight results are kept in memory and written only once ALL of
// preflight has passed. A run that stops in preflight therefore leaves nothing behind — not even
// a release-out/X.Y.Z/ directory — which is the "fails fast, changes nothing" promise taken
// literally. From the first post-preflight step on, state is written after every step, so an
// interruption loses at most the step that was running.
//
// Everything outside this process is reached through `deps` (runner, env, platform, clock,
// fetch, sleep, output), which is how the tests run the real pipeline against a fake world.
//
// --resume and --abort take the release from release-out/*/state.json (resume.mjs picks it,
// abort.mjs drops it); --resume then runs the same STEPS with ctx.resume set, skipping every
// non-preflight step state.json records as done.
import { readFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { abortRelease } from './abort.mjs'
import { PWA_URL, publishAssets } from './artifacts.mjs'
import { buildAndroid, buildSums, buildWeb, buildWindows } from './build.mjs'
import { bumpVersion } from './bump.mjs'
import { USAGE, parseArgs } from './cli.mjs'
import { ReleaseError } from './errors.mjs'
import { checkChangelog, checkGit, checkSuites, checkTag, checkTools } from './preflight.mjs'
import { deployPages } from './pages.mjs'
import { draftRelease, publishPlan, pushRelease, releaseUrl, resumable, undraftRelease } from './publish.mjs'
import { FIRST_PUBLISH_STEP, LAST_STEP, checkResumable, pickState } from './resume.mjs'
import { smokeTest } from './smoke.mjs'
import { clearReleaseDir, isDone, markDone, newState, readState, releaseDir, statePath, writeState } from './state.mjs'
import { resolveTarget } from './version.mjs'

/** Every step id a release can record, in run order. */
export const STEP_IDS = [
  'preflight.git',
  'preflight.tag',
  'preflight.changelog',
  'preflight.tools',
  'preflight.checks',
  'bump',
  'build.web',
  'build.android',
  'build.windows',
  'build.sums',
  'publish.push',
  'publish.draft',
  'publish.pages',
  'publish.undraft',
  'publish.smoke'
]

/**
 * The release, step by step. Each is { id, stage, title, run(ctx) }; `run` returns data to
 * record in state.json (or nothing) and throws a ReleaseError to stop the release.
 * Preflight steps run on every invocation, even when state says they are done: they check the
 * world as it is now, and the world may have changed since the interrupted run. On --resume past
 * the bump they check it against the release instead of against a fresh start: HEAD must be the
 * bump commit, the tag may already exist as this release's own (preflight.mjs, checkResumedHead /
 * checkResumedTag), and preflight.checks is not re-run when the code it passed on is unchanged.
 * The publish steps never run in a dry run (main() leaves them out; resumable() refuses too).
 */
export const STEPS = [
  { id: 'preflight.git', stage: 'preflight', title: 'on main, clean, in sync with origin/main', run: checkGit },
  { id: 'preflight.tag', stage: 'preflight', title: 'release tag is not taken', run: checkTag },
  { id: 'preflight.changelog', stage: 'preflight', title: 'docs/CHANGELOG.md has this version', run: checkChangelog },
  { id: 'preflight.tools', stage: 'preflight', title: 'gh signed in, no release yet, keystore, apksigner, gh-pages worktree', run: checkTools },
  { id: 'preflight.checks', stage: 'preflight', title: 'npm ci, typecheck, lint, tests', run: checkSuites },
  { id: 'bump', stage: 'bump', title: 'version and CHANGELOG date, commit "release: vX.Y.Z"', run: bumpVersion },
  { id: 'build.web', stage: 'build', title: 'build:web, verify:web, freeze dist-web', run: buildWeb },
  { id: 'build.android', stage: 'build', title: 'cap sync from the frozen bundle, assembleRelease, verify:apk', run: buildAndroid },
  { id: 'build.windows', stage: 'build', title: 'electron-builder, latest.yml checked against the installer', run: buildWindows },
  { id: 'build.sums', stage: 'build', title: 'SHA256SUMS.txt and release notes', run: buildSums },
  { id: 'publish.push', stage: 'publish', title: 'git push origin main, tag vX.Y.Z, push the tag', run: resumable('publish.push', pushRelease) },
  { id: 'publish.draft', stage: 'publish', title: 'draft GitHub release with the five assets, listed back', run: resumable('publish.draft', draftRelease) },
  { id: 'publish.pages', stage: 'publish', title: 'frozen web bundle onto gh-pages', run: resumable('publish.pages', deployPages) },
  { id: 'publish.undraft', stage: 'publish', title: 'the draft becomes the latest release', run: resumable('publish.undraft', undraftRelease) },
  { id: 'publish.smoke', stage: 'publish', title: 'live version.json and latest.yml', run: resumable('publish.smoke', smokeTest) }
]

for (const step of STEPS) {
  if (!STEP_IDS.includes(step.id)) throw new Error(`step id ${step.id} is not listed in STEP_IDS`)
}
for (const id of [FIRST_PUBLISH_STEP, LAST_STEP]) {
  if (!STEP_IDS.includes(id)) throw new Error(`resume.mjs names step ${id}, which is not in STEP_IDS`)
}

/**
 * Runs `steps` in order. Non-preflight steps already done in ctx.state are skipped. A preflight
 * step that is already done is run again (it checks the world as it is now) but its FIRST
 * recorded data is kept: on a resume, preflight.git.head is no longer the pre-release HEAD —
 * the bump commit sits on top of it — and overwriting it would hand --abort the wrong SHA.
 */
export async function runSteps(steps, ctx, { persist }) {
  for (const step of steps) {
    const done = isDone(ctx.state, step.id)
    if (step.stage !== 'preflight' && done) {
      ctx.log(`= ${step.id}  already done, skipped`)
      continue
    }
    ctx.log(`- ${step.id}  ${step.title}`)
    const data = (await step.run(ctx)) ?? {}
    if (done) continue
    markDone(ctx.state, step.id, data, ctx.now())
    if (persist) writeState(ctx.stateFile, ctx.state)
  }
}

/**
 * Runs the whole release for an already-resolved version.
 *
 * Once preflight has passed, a fresh run (not --resume) empties release-out/X.Y.Z/ except
 * state.json, so an artifact left by an earlier run (typically a dry run) can never be taken
 * for one this run built and get published.
 *
 * Steps may register cleanup with ctx.onFinally(fn); the hooks run in reverse registration
 * order when the run ends, whether it succeeded or a later step threw. This is where a dry run
 * puts package.json, package-lock.json and docs/CHANGELOG.md back after the bump step edited them
 * in the working tree (bump.mjs registers that restore under ctx.dryRun).
 * Every hook runs even if an earlier one fails; a hook failure is reported as the run's error,
 * naming the step error it followed if there was one, because a dry run that leaves the bumped
 * version behind is a dirty tree the next real release would refuse.
 */
export async function runRelease(ctx, steps = STEPS) {
  const hooks = []
  ctx.onFinally = (fn) => hooks.push(fn)
  let failure = null
  try {
    const preflight = steps.filter((s) => s.stage === 'preflight')
    const rest = steps.filter((s) => s.stage !== 'preflight')
    await runSteps(preflight, ctx, { persist: false })
    if (!ctx.resume) {
      const removed = clearReleaseDir(dirname(ctx.stateFile))
      if (removed.length) ctx.log(`  cleared ${removed.length} leftover item(s) from an earlier run out of ${relative(ctx.root, dirname(ctx.stateFile))}`)
    }
    writeState(ctx.stateFile, ctx.state)
    await runSteps(rest, ctx, { persist: true })
  } catch (err) {
    failure = err
    throw err
  } finally {
    const hookErrors = []
    for (const hook of hooks.reverse()) {
      try {
        await hook()
      } catch (err) {
        hookErrors.push(err instanceof Error ? err.message : String(err))
      }
    }
    if (hookErrors.length) {
      const after = failure ? ` (after the run had already stopped: ${failure instanceof Error ? failure.message : failure})` : ''
      // A throw from finally replaces the step error on purpose: `after` carries its message.
      // eslint-disable-next-line no-unsafe-finally
      throw new ReleaseError(`cleanup failed: ${hookErrors.join('; ')}${after} — check \`git status\` and restore the files by hand.`)
    }
  }
}

function readPackageVersion(root) {
  try {
    return JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version
  } catch (err) {
    throw new ReleaseError(`could not read the version from package.json (${err.message}).`)
  }
}

/**
 * A fresh (non --resume) run must not trample a real release that got past preflight: that
 * state is the only record of a bump commit that may need resetting, or of assets already
 * uploaded. A dry-run state, or one that only ever finished preflight, is safe to start over.
 */
function refuseInProgress(existing, file, root) {
  if (!existing || existing.dryRun) return
  const started = Object.keys(existing.steps).filter((id) => !id.startsWith('preflight.') && isDone(existing, id))
  if (!started.length) return
  if (isDone(existing, LAST_STEP)) {
    throw new ReleaseError(`v${existing.version} has already been released (${relative(root, file)} records every step) — pick a higher version.`)
  }
  throw new ReleaseError(
    `a release of ${existing.version} is already in progress (${relative(root, file)} records ${started.join(', ')}) — continue it with --resume or drop it with --abort.`
  )
}

/**
 * `npm run release minor --dry-run` (no `--`) does not pass --dry-run to this script: npm takes
 * it as its own config flag, sets npm_config_dry_run=true, and hands over only ["minor"]. Run on,
 * that would be a REAL release where a dry run was asked for. So a flag npm swallowed is caught
 * through the variable it leaves behind, and the run stops before anything happens.
 */
const NPM_SWALLOWED = { npm_config_dry_run: '--dry-run', npm_config_resume: '--resume', npm_config_abort: '--abort' }

function refuseSwallowedFlags(argv, env) {
  for (const [name, flag] of Object.entries(NPM_SWALLOWED)) {
    const value = env[name]
    if (!value || value === 'false' || argv.includes(flag)) continue
    const example = flag === '--dry-run' ? `${argv.find((a) => !a.startsWith('-')) ?? 'minor'} ${flag}` : flag
    throw new ReleaseError(`npm kept ${flag} for itself — put flags after \`--\`: npm run release -- ${example}`)
  }
}

/** The ctx every step receives. `deps` may inject fetch, sleep and now (the smoke step's
 *  network, wait and clock); the defaults are the real ones. */
function makeCtx(deps, { version, currentVersion, dryRun, resume, stateFile, state }) {
  return {
    root: deps.root,
    version,
    currentVersion,
    dryRun,
    resume,
    run: deps.run,
    env: deps.env ?? {},
    platform: deps.platform ?? process.platform,
    now: deps.now ?? (() => new Date()),
    fetch: deps.fetch ?? ((...a) => globalThis.fetch(...a)),
    sleep: deps.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms))),
    log: deps.out,
    stateFile,
    state
  }
}

/** --resume: the state to continue (pickState), checked, and a ctx that skips its done steps. */
function resumeCtx(deps, spec) {
  const { file, state } = pickState(deps.root, spec, '--resume')
  checkResumable(deps.root, file, state)
  return makeCtx(deps, {
    version: state.version,
    currentVersion: readPackageVersion(deps.root),
    dryRun: false,
    resume: true,
    stateFile: file,
    state
  })
}

/**
 * The CLI, minus process globals. Returns the exit code. Every failure ends in exactly one line
 * on `err`, prefixed "release: " (plus a stack trace only when RELEASE_DEBUG is set).
 * deps: { root, run, env, platform, now?, fetch?, sleep?, out?, err?, steps? } — `steps`
 * (default STEPS) lets a test run a prefix of the release, e.g. preflight alone, or stop right
 * after publish.draft as if the process had been killed there.
 */
export async function main(argv, deps) {
  const out = deps.out ?? ((line) => console.log(line))
  const err = deps.err ?? ((line) => console.error(line))
  const env = deps.env ?? {}
  try {
    refuseSwallowedFlags(argv, env)
    const args = parseArgs(argv)
    if (args.help) {
      out(USAGE)
      return 0
    }
    if (args.abort) {
      const picked = pickState(deps.root, args.spec, '--abort')
      out(`release v${picked.state.version} — ABORT`)
      abortRelease({ root: deps.root, run: deps.run, env, log: out }, picked)
      return 0
    }

    let ctx
    if (args.resume) {
      ctx = resumeCtx({ ...deps, out }, args.spec)
      const next = STEP_IDS.find((id) => !isDone(ctx.state, id))
      out(`release v${ctx.version} — RESUMING from ${next} (the steps state.json records as done are skipped)`)
    } else {
      const current = readPackageVersion(deps.root)
      const version = resolveTarget(current, args.spec)
      const stateFile = statePath(deps.root, version)
      refuseInProgress(readState(stateFile), stateFile, deps.root)
      const now = deps.now ?? (() => new Date())
      ctx = makeCtx({ ...deps, out }, {
        version,
        currentVersion: current,
        dryRun: args.dryRun,
        resume: false,
        stateFile,
        state: newState({ version, dryRun: args.dryRun, now: now() })
      })
      out(`release v${version} (package.json: ${current})${args.dryRun ? ' — DRY RUN: nothing is committed or published' : ''}`)
      if (version === current) out('  package.json already has this version; the bump step will only date the CHANGELOG.')
    }

    // A dry run is stages 1–3 and then only prints stage 4.
    const steps = (deps.steps ?? STEPS).filter((s) => !(ctx.dryRun && s.stage === 'publish'))
    await runRelease(ctx, steps)

    const { version } = ctx
    const outRel = relative(deps.root, releaseDir(deps.root, version)).split('\\').join('/')
    const ran = steps.map((s) => s.id)
    if (ctx.dryRun && ran.includes('build.sums')) {
      out('')
      out(`DRY RUN complete: ${outRel}/ holds ${publishAssets(version).join(', ')}, release-notes.md and web/.`)
      out('package.json, package-lock.json and docs/CHANGELOG.md are restored; nothing was committed, tagged or published.')
      for (const line of publishPlan({ root: deps.root, version, env })) out(line)
    } else if (!ctx.dryRun && ran.includes(LAST_STEP)) {
      out('')
      out(`release: v${version} is out.`)
      out(`  GitHub release: ${releaseUrl(version)}`)
      out(`  PWA:            ${PWA_URL}`)
    } else {
      out(`release: the steps asked for passed for v${version} (${steps.at(-1)?.id ?? 'none'} was the last).`)
    }
    return 0
  } catch (e) {
    if (e instanceof ReleaseError) {
      err(`release: ${e.message}`)
      if (env.RELEASE_DEBUG && e.cause instanceof Error) err(String(e.cause.stack))
    } else {
      const reason = e instanceof Error ? e.message : String(e)
      err(`release: unexpected failure: ${reason.replace(/\s*\n\s*/g, ' ')}${env.RELEASE_DEBUG ? '' : ' (re-run with RELEASE_DEBUG=1 for the stack trace)'}`)
      if (env.RELEASE_DEBUG && e instanceof Error) err(String(e.stack))
    }
    return 1
  }
}
