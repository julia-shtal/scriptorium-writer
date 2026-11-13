// scripts/release/publish.mjs
// Stage 4 of a release: publish, in a fixed order (steps 11–15). The order is what keeps
// installed clients safe — nothing a client can see changes until the last moment:
//
//   publish.push     git push origin main, then tag the release commit and push the tag.
//   publish.draft    a DRAFT GitHub release with the five assets. Drafts are invisible to
//                    electron-updater and to the "latest release" link, so a half-uploaded
//                    draft harms nobody. Its asset list is read back and compared (name, size,
//                    upload state, SHA-256) with the local files before the step counts as done.
//   publish.pages    the frozen PWA bundle onto gh-pages (pages.mjs).
//   publish.undraft  the draft becomes the latest release: Windows auto-update and the APK
//                    download go live here, after the assets were compared once more.
//   publish.smoke    the live PWA and latest.yml answer with this version (smoke.mjs).
//
// Every step is idempotent, because --resume re-runs the step that was interrupted from its
// start: a push of what origin already has is a no-op, an existing local tag is accepted when it
// points at the release commit, an existing draft only gets the assets it is missing or holds
// broken (never a second `gh release create`), and an edit to draft=false of a public release
// changes nothing. A failure says the exact command that failed and that
// `npm run release -- --resume` continues — unless --resume cannot help (ReleaseError `final`).
//
// Every `gh release` call names the repository (--repo): gh otherwise picks it from the git
// remotes, and a fork or a second remote would get the release.
//
// Nothing here rebuilds anything: the assets are the files stage 3 built and recorded, and they
// are re-hashed against state.json before they are uploaded or made public.
import { relative } from 'node:path'
import { NOTES_FILE, PWA_URL, REPO_SLUG, REPO_URL, WEB_DIR, publishAssets, verifyRecorded } from './artifacts.mjs'
import { stepData } from './build.mjs'
import { ReleaseError } from './errors.mjs'
import { firstLine, runChecked } from './exec.mjs'
import { RESUME_CMD } from './resume.mjs'
import { isDone, releaseDir } from './state.mjs'

/** The gh-pages worktree the PWA is deployed from (env SCRIPTORIUM_PAGES_DIR overrides it). */
export const pagesDir = (env) => env.SCRIPTORIUM_PAGES_DIR || '../scriptorium-pages'

export const releaseUrl = (version) => `${REPO_URL}/releases/tag/v${version}`
export const latestYmlUrl = (version) => `${REPO_URL}/releases/download/v${version}/latest.yml`

/** `gh release <sub> ...args --repo owner/name`, as an argv for the runner. */
export const ghRelease = (sub, ...args) => ['release', sub, ...args, '--repo', REPO_SLUG]
/** The same, as a command line to quote in a message. */
export const ghLine = (sub, ...args) => `gh ${ghRelease(sub, ...args).join(' ')}`

const posix = (root, p) => relative(root, p).split('\\').join('/')
const outRel = (ctx) => posix(ctx.root, releaseDir(ctx.root, ctx.version))
const short = (sha) => String(sha).slice(0, 7)

/** "— fix the cause or run `cmd` yourself, then `npm run release -- --resume`." */
export const resumeHint = (cmd) => `fix the cause or run \`${cmd}\` yourself, then \`${RESUME_CMD}\` continues from here.`

// What a publish step says when state.json lacks a stage-3 record: --abort is no option any more
// once something may be pushed, and --resume cannot conjure a record either.
const PUBLISH_STATE_HINT = 'publishing cannot go on without it; inspect state.json — it is not what this script wrote.'
const recorded = (ctx, id) => stepData(ctx, id, PUBLISH_STATE_HINT)

/** A publish step must never run in a dry run; main() leaves them out, this is the backstop. */
function assertReal(ctx, id) {
  if (ctx.dryRun) throw new Error(`${id} was asked to run in a dry run — publish steps are left out of a dry run`)
}

/**
 * Wraps a publish step so that whatever stops it ends with the resume instruction. The steps
 * word their own errors with resumeHint(); this catches the rest — a ReleaseError from a shared
 * helper, or a bug — because from step 11 on a release is half public, and "how do I go on"
 * matters more than which line threw. A `final` ReleaseError (one --resume cannot get past) is
 * passed on as it is. The original error stays reachable as `cause`.
 */
export function resumable(id, fn) {
  return async (ctx) => {
    assertReal(ctx, id)
    try {
      return await fn(ctx)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      if (err instanceof ReleaseError && (err.final || message.includes(RESUME_CMD))) throw err
      const wrapped = new ReleaseError(
        `${err instanceof ReleaseError ? message : `${id} failed unexpectedly: ${message}`} — ${id} is not done; once fixed, \`${RESUME_CMD}\` continues from it.`
      )
      wrapped.cause = err
      throw wrapped
    }
  }
}

const git = (ctx, args, cmd = `git ${args.join(' ')}`) => runChecked(ctx, 'git', args, { hint: resumeHint(cmd) })

// --------------------------------------------------------------------------- 11. push

/**
 * Whether `sha` is part of origin/main's history (the remote-tracking ref, as of the last fetch).
 * The one test for "the release commit is on origin" — used by publish.push (to skip pushing
 * main), by the resume checks in preflight.mjs and by --abort (to refuse a reset).
 */
export function releaseOnOrigin(ctx, sha) {
  const args = ['merge-base', '--is-ancestor', sha, 'origin/main']
  const res = ctx.run('git', args, { cwd: ctx.root, env: ctx.env })
  if (!res.error && (res.status === 0 || res.status === 1)) return res.status === 0
  const reason = res.error ? res.error.message : firstLine(res.stderr) || `exit ${res.status}`
  throw new ReleaseError(`\`git ${args.join(' ')}\` failed (${reason}) — check the repository, then try again.`)
}

/** The commit the local tag `tag` points at, or null when there is no such tag. */
export function localTagCommit(ctx, tag) {
  const list = runChecked(ctx, 'git', ['tag', '-l', tag], { hint: 'check the repository.' })
  if (!list.stdout.trim()) return null
  return runChecked(ctx, 'git', ['rev-parse', `${tag}^{commit}`], { hint: 'check the repository.' }).stdout.trim()
}

/** Step publish.push. */
export function pushRelease(ctx) {
  const tag = `v${ctx.version}`
  const { sha } = recorded(ctx, 'bump')
  const main = git(ctx, ['rev-parse', 'main']).stdout.trim()
  if (main !== sha) {
    throw new ReleaseError(
      `main is at ${short(main)}, but the release was built from ${short(sha)} ("release: ${tag}") — something moved main since; put it back (\`git switch main\`, move extra commits to a branch, \`git reset --hard ${sha}\`), then \`${RESUME_CMD}\`.`
    )
  }
  // An interrupted run may have pushed main already — and someone may have pushed on top of it
  // since, so pushing the (now older) local main would be rejected. Then there is nothing to push.
  if (releaseOnOrigin(ctx, sha)) {
    ctx.log(`  origin/main already contains ${short(sha)} — not pushing main again`)
  } else {
    git(ctx, ['push', 'origin', 'main'])
  }

  const tagged = localTagCommit(ctx, tag)
  if (tagged === null) {
    // The commit is named explicitly: the tag must mark what was built, whatever HEAD is now.
    git(ctx, ['tag', '-a', tag, '-m', tag, sha])
    ctx.log(`  tagged ${short(sha)} as ${tag}`)
  } else if (tagged !== sha) {
    throw new ReleaseError(
      `tag ${tag} already exists locally but points at ${short(tagged)}, not the release commit ${short(sha)} — inspect it (\`git show ${tag}\`); if it is a leftover, \`git tag -d ${tag}\`, then \`${RESUME_CMD}\`.`
    )
  } else {
    ctx.log(`  tag ${tag} already exists on ${short(sha)} (an interrupted run made it) — kept`)
  }
  git(ctx, ['push', 'origin', tag])
  return { sha, tag }
}

// --------------------------------------------------------------------------- assets

/**
 * The five assets as stage 3 recorded them, re-hashed now: { name, size, sha256, path } with
 * `path` relative to the repo (what gh is handed, and what an error message can quote). A file
 * that changed since it was built and verified is refused — it must never be published.
 */
export function localAssets(ctx) {
  const win = recorded(ctx, 'build.windows')
  const records = [
    ['build.windows', win.exe],
    ['build.windows', win.blockmap],
    ['build.windows', win.latestYml],
    ['build.android', recorded(ctx, 'build.android').apk],
    ['build.sums', recorded(ctx, 'build.sums').sums]
  ]
  const byName = new Map(records.filter(([, r]) => r).map(([step, r]) => [r.name, { step, r }]))
  return publishAssets(ctx.version).map((name) => {
    const entry = byName.get(name)
    if (!entry) throw new ReleaseError(`state.json records no ${name} from stage 3 — ${PUBLISH_STATE_HINT}`, { final: true })
    return { ...checkUnchanged(ctx, entry.r, entry.step), path: `${outRel(ctx)}/${name}` }
  })
}

const checkUnchanged = (ctx, r, step) =>
  verifyRecorded(releaseDir(ctx.root, ctx.version), r, {
    step,
    label: `${outRel(ctx)}/${r.name}`,
    hint: `it must not be published as it is; find out what happened to it (state.json has its recorded sha256), restore it, then \`${RESUME_CMD}\`.`
  })

/**
 * The release on GitHub as { isDraft, assets: [{ name, size, state, digest }] }, or null when
 * GitHub says there is no such release. Every other failure (network, auth, rate limit) is an
 * error, never null: null makes publish.draft create a release, and a second one must not happen.
 * `state` is "uploaded" for a finished upload; `digest` ("sha256:<hex>") is absent on older gh.
 */
export function viewRelease(ctx, tag) {
  const args = ghRelease('view', tag, '--json', 'assets,isDraft')
  const res = ctx.run('gh', args, { cwd: ctx.root, env: ctx.env })
  const cmd = `gh ${args.join(' ')}`
  if (res.error) throw new ReleaseError(`could not run gh (${res.error.message}) — ${resumeHint(cmd)}`)
  if (res.status !== 0) {
    if (/^release not found$/im.test(`${res.stderr}\n${res.stdout}`.trim())) return null
    throw new ReleaseError(`\`${cmd}\` failed (${firstLine(res.stderr) || `exit ${res.status}`}) — ${resumeHint(cmd)}`)
  }
  let data
  try {
    data = JSON.parse(res.stdout)
  } catch (err) {
    throw new ReleaseError(`\`${cmd}\` did not print JSON (${err.message}) — ${resumeHint(cmd)}`)
  }
  const assets = Array.isArray(data?.assets)
    ? data.assets.map((a) => ({
        name: String(a.name),
        size: Number(a.size),
        state: typeof a.state === 'string' ? a.state : undefined,
        digest: typeof a.digest === 'string' && a.digest ? a.digest : undefined
      }))
    : []
  return { isDraft: data?.isDraft === true, assets }
}

/** What is wrong with one asset on GitHub compared with the local file, or null if nothing. */
export function assetIssue(local, remote) {
  if (!remote) return `${local.name} is missing`
  if (remote.state !== 'uploaded') return `${local.name} is ${remote.state ? `"${remote.state}"` : 'in an unknown state'} on GitHub, not uploaded`
  if (remote.size !== local.size) return `${local.name} is ${remote.size} bytes on GitHub, ${local.size} locally`
  if (remote.digest && remote.digest !== `sha256:${local.sha256}`) return `${local.name} has a different SHA-256 on GitHub (${remote.digest})`
  return null
}

/**
 * Every way the release's asset list differs from the local files: a missing, unfinished,
 * wrong-size or wrong-hash asset, or an asset this release did not build. [] = identical.
 */
export function assetProblems(local, remote) {
  const problems = local.map((l) => assetIssue(l, remote.find((a) => a.name === l.name))).filter(Boolean)
  for (const r of remote) {
    if (!local.some((l) => l.name === r.name)) problems.push(`${r.name} is not one of this release's files`)
  }
  return problems
}

function checkAssets(ctx, tag, local, remote) {
  const problems = assetProblems(local, remote.assets)
  if (!problems.length) return
  const stray = remote.assets.filter((r) => !local.some((l) => l.name === r.name)).map((r) => r.name)
  const fix = stray.length
    ? `delete what does not belong (\`${ghLine('delete-asset', tag, stray[0], '--yes')}\`), then \`${RESUME_CMD}\``
    : `\`${RESUME_CMD}\` re-uploads what is missing or wrong (or \`${ghLine('upload', tag, '<files>', '--clobber')}\` by hand)`
  throw new ReleaseError(`the GitHub release ${tag} does not carry exactly the files built in ${outRel(ctx)}/: ${problems.join('; ')} — ${fix}.`)
}

// --------------------------------------------------------------------------- 12. draft

/**
 * Step publish.draft. A fresh run creates the draft with all five assets in one
 * `gh release create`. A resumed one finds the draft an interrupted run left and uploads only
 * the assets missing from it or broken on it (not fully uploaded, wrong size, wrong SHA-256 — a
 * cut-off upload), with --clobber so the broken one is replaced. Either way the step ends by
 * reading the asset list back.
 */
export function draftRelease(ctx) {
  const tag = `v${ctx.version}`
  const local = localAssets(ctx)
  const notes = checkUnchanged(ctx, recorded(ctx, 'build.sums').notes, 'build.sums')
  if (notes.name !== NOTES_FILE) {
    throw new ReleaseError(`state.json records the release notes as ${notes.name}, expected ${NOTES_FILE} — ${PUBLISH_STATE_HINT}`, { final: true })
  }
  const notesPath = `${outRel(ctx)}/${NOTES_FILE}`

  let created = false
  let uploaded = []
  const existing = viewRelease(ctx, tag)
  if (!existing) {
    const args = ghRelease('create', tag, '--draft', '--verify-tag', '--title', ctx.version, '--notes-file', notesPath, ...local.map((a) => a.path))
    // On a failure here gh may have created the draft with some of the assets; the resume
    // then uploads only the rest.
    runChecked(ctx, 'gh', args, { hint: `\`${RESUME_CMD}\` finds the draft if one was made and uploads only what is missing.` })
    created = true
    ctx.log(`  created the draft release ${tag} with ${local.length} assets`)
  } else {
    if (!existing.isDraft) {
      throw new ReleaseError(
        `the GitHub release ${tag} is already public, but this run never published it — check it on GitHub (${releaseUrl(ctx.version)}); if it is right and complete, finish the remaining steps by hand.`,
        { final: true }
      )
    }
    const todo = local.filter((l) => assetIssue(l, existing.assets.find((a) => a.name === l.name)))
    if (todo.length) {
      const args = ghRelease('upload', tag, ...todo.map((a) => a.path), '--clobber')
      runChecked(ctx, 'gh', args, { hint: resumeHint(`gh ${args.join(' ')}`) })
      uploaded = todo.map((a) => a.name)
      ctx.log(`  the draft ${tag} already existed; uploaded what it was missing or held broken: ${uploaded.join(', ')}`)
    } else {
      ctx.log(`  the draft ${tag} already has all ${local.length} assets`)
    }
  }

  const after = viewRelease(ctx, tag)
  if (!after) throw new ReleaseError(`GitHub has no release ${tag} right after it was created — \`${RESUME_CMD}\` tries again.`)
  checkAssets(ctx, tag, local, after)
  return { created, uploaded, assets: local.map(({ name, size }) => ({ name, size })) }
}

// --------------------------------------------------------------------------- 14. undraft

/** Step publish.undraft: compares the assets once more, then makes the release the latest. */
export function undraftRelease(ctx) {
  const tag = `v${ctx.version}`
  const local = localAssets(ctx)
  const release = viewRelease(ctx, tag)
  if (!release) {
    throw new ReleaseError(
      `GitHub has no release ${tag}, although publish.draft recorded one — was the draft deleted? Inspect ${releaseUrl(ctx.version)}; to make it again, recreate the draft by hand (\`${ghLine('create', tag, '--draft', '--verify-tag', '--title', ctx.version, '--notes-file', `${outRel(ctx)}/${NOTES_FILE}`, '<the five assets>')}\`) and finish the remaining steps by hand.`,
      { final: true }
    )
  }
  checkAssets(ctx, tag, local, release)
  const args = ghRelease('edit', tag, '--draft=false', '--latest')
  runChecked(ctx, 'gh', args, { hint: resumeHint(`gh ${args.join(' ')}`) })
  ctx.log(`  ${tag} is public and the latest release: ${releaseUrl(ctx.version)}`)
  return { url: releaseUrl(ctx.version) }
}

// --------------------------------------------------------------------------- by hand

/**
 * The publish steps (12–15) not yet done in `state`, as the commands that do them by hand — for
 * the one situation --resume must not continue (origin's history was rewritten under the
 * release) and the operator has to finish it.
 */
export function remainingByHand({ root, state, env = {} }) {
  const version = state.version
  const tag = `v${version}`
  const out = posix(root, releaseDir(root, version))
  const assets = publishAssets(version).map((n) => `${out}/${n}`)
  const steps = [
    ['publish.draft', `\`${ghLine('create', tag, '--draft', '--verify-tag', '--title', version, '--notes-file', `${out}/${NOTES_FILE}`, ...assets)}\``],
    [
      'publish.pages',
      `in ${pagesDir(env)}: \`git fetch origin gh-pages\`, check \`git rev-parse HEAD origin/gh-pages\` prints the same commit twice, \`git rm -rf . --quiet --ignore-unmatch\`, copy ${out}/${WEB_DIR}/* there, create .nojekyll, \`git -c core.autocrlf=false add -A\`, \`git -c core.autocrlf=false commit -m "deploy ${tag}"\`, \`git push origin gh-pages\``
    ],
    ['publish.undraft', `\`${ghLine('edit', tag, '--draft=false', '--latest')}\``],
    ['publish.smoke', `\`curl -s ${PWA_URL}version.json\` until it reads ${version}`]
  ]
  return steps.filter(([id]) => !isDone(state, id)).map(([id, cmd]) => `${id}: ${cmd}`)
}

// --------------------------------------------------------------------------- dry-run plan

/** The stage-4 commands, as text, for the dry run to print. Paths are relative to the repo. */
export function publishPlan({ root, version, env = {} }) {
  const tag = `v${version}`
  const out = posix(root, releaseDir(root, version))
  const assets = publishAssets(version).map((name) => `${out}/${name}`)
  const pages = pagesDir(env)
  return [
    'Stage 4 (publish) would run, in this order:',
    '  11. git push origin main                       (the "release: ' + tag + '" commit)',
    `      git tag -a ${tag} -m "${tag}" <release commit>`,
    `      git push origin ${tag}`,
    `  12. gh release create ${tag} --draft --verify-tag --title "${version}" --notes-file ${out}/${NOTES_FILE} \\`,
    ...assets.map((a) => `        ${a} \\`),
    `        --repo ${REPO_SLUG}`,
    `      ${ghLine('view', tag, '--json', 'assets,isDraft')}  (names, sizes, upload state and SHA-256 compared with the files above)`,
    `  13. in ${pages} (gh-pages): git fetch origin gh-pages, HEAD must equal origin/gh-pages,`,
    `      git rm -rf . --quiet --ignore-unmatch, copy ${out}/${WEB_DIR}/* there, create .nojekyll,`,
    `      git -c core.autocrlf=false add -A,`,
    `      git -c core.autocrlf=false commit -m "deploy ${tag}" (skipped if nothing changed), git push origin gh-pages`,
    `  14. ${ghLine('edit', tag, '--draft=false', '--latest')}   (Windows auto-update and the APK go live here)`,
    `  15. poll ${PWA_URL}version.json until it reads ${version} (up to 5 min);`,
    `      fetch ${latestYmlUrl(version)}`
  ]
}

