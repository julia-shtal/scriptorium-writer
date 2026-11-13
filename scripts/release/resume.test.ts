/**
 * --resume and --abort, run end to end through main() against the stateful fake world in
 * release-world.ts: a real (never dry) release is started, stopped at some step — by handing
 * main() only a prefix of STEPS, which is exactly what a killed process leaves in state.json, or
 * by making one command fail — and then continued or dropped.
 *
 * The M32 Task 3 acceptance criterion is the first block: a release killed right after
 * publish.draft and resumed finishes without a single build command, without a second
 * `gh release create`, and without uploading any asset twice.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { publishAssets } from './artifacts.mjs'
import { STEPS, main } from './pipeline.mjs'
import { releaseWorld } from './release-world'
import { STATE_SCHEMA_VERSION, statePath, writeState } from './state.mjs'

type World = ReturnType<typeof releaseWorld>
type Step = { id: string; stage: string }

let w: World
beforeEach(() => {
  w = releaseWorld()
})
afterEach(() => {
  expect(w.runner.unexpected, 'commands the fake world has no answer for').toEqual([])
  w.cleanup()
})

/** STEPS up to and including `id`: what state.json holds when the process dies right after it. */
const upTo = (id: string) => STEPS.slice(0, STEPS.findIndex((s: Step) => s.id === id) + 1)
const linesFrom = (start: number) => w.runner.lines().slice(start)
const outDir = () => join(w.root, 'release-out', '1.8.0')
const NAMES = publishAssets('1.8.0') as string[]
const paths = (names: string[]) => names.map((n) => `release-out/1.8.0/${n}`)
const REPO = '--repo julia-shtal/scriptorium-writer'
const CREATE = `gh release create v1.8.0 --draft --verify-tag --title 1.8.0 --notes-file release-out/1.8.0/release-notes.md ${paths(NAMES).join(' ')}`
const COMMIT_PAGES = 'pages: git -c core.autocrlf=false commit -m deploy v1.8.0'

// Anything that builds or re-verifies an artifact, or re-runs the slow gates.
const BUILD = /^(npm ci|npm run (build|build:web|typecheck|lint|test:browser)|npm test|npx |android\\gradlew|node scripts\/verify|npm version)/

async function run(argv: string[], steps?: Step[]) {
  w.out.length = 0
  w.err.length = 0
  return main(argv, w.deps(steps))
}

describe('a release killed after publish.draft, then --resume (M32 Task 3 acceptance)', () => {
  it('finishes the release without a rebuild, a second draft or a duplicate upload', async () => {
    expect(await run(['minor'], upTo('publish.draft'))).toBe(0)
    expect(w.stateOf().steps['publish.draft'].done).toBe(true)
    expect(w.gh.release).toMatchObject({ isDraft: true })
    expect(w.gh.uploads).toEqual(NAMES)
    const start = w.runner.calls.length

    expect(await run(['--resume'])).toBe(0)
    expect(w.err).toEqual([])
    const resumed = linesFrom(start)
    expect(resumed.filter((l) => BUILD.test(l))).toEqual([])
    expect(resumed.filter((l) => l.startsWith('gh release create') || l.startsWith('gh release upload'))).toEqual([])
    expect(resumed.filter((l) => /^git (commit|tag -a|push origin (main|v))/.test(l))).toEqual([])
    expect(w.gh.uploads).toEqual(NAMES)

    // pages, undraft and smoke ran, in that order, and are recorded.
    expect(resumed).toContain(COMMIT_PAGES)
    expect(resumed.indexOf('pages: git push origin gh-pages')).toBeLessThan(resumed.indexOf(`gh release edit v1.8.0 --draft=false --latest ${REPO}`))
    const steps = w.stateOf().steps
    for (const id of ['publish.pages', 'publish.undraft', 'publish.smoke']) expect(steps[id].done, id).toBe(true)
    expect(w.gh.release?.isDraft).toBe(false)
    expect(w.out.join('\n')).toMatch(/RESUMING from publish\.pages/)
    expect(w.out.join('\n')).toMatch(/preflight\.checks[\s\S]*skipped on --resume/)
    expect(w.out).toContain('  GitHub release: https://github.com/julia-shtal/scriptorium-writer/releases/tag/v1.8.0')
  })
})

describe('a whole release in one run', () => {
  it('publishes in order: push, tag, draft, pages, undraft, smoke', async () => {
    expect(await run(['minor'])).toBe(0)
    expect(w.err).toEqual([])
    const publish = w.runner.lines().filter((l) => /^(git (push|tag -a)|gh release (create|upload|edit)|pages: git (-c core.autocrlf=false commit|push))/.test(l))
    expect(publish).toEqual([
      'git push origin main',
      'git tag -a v1.8.0 -m v1.8.0 bump1111111',
      'git push origin v1.8.0',
      `${CREATE} ${REPO}`,
      COMMIT_PAGES,
      'pages: git push origin gh-pages',
      `gh release edit v1.8.0 --draft=false --latest ${REPO}`
    ])
    expect(w.out.slice(-3)).toEqual([
      'release: v1.8.0 is out.',
      '  GitHub release: https://github.com/julia-shtal/scriptorium-writer/releases/tag/v1.8.0',
      '  PWA:            https://julia-shtal.github.io/scriptorium-writer/'
    ])
    // The served PWA is the frozen bundle, plus .nojekyll; the previous deploy is gone.
    expect(readFileSync(join(w.pages, 'version.json'), 'utf8')).toBe('{"version":"1.8.0"}\n')
    expect(readFileSync(join(w.pages, 'version.json'))).toEqual(readFileSync(join(outDir(), 'web', 'version.json')))
    expect(existsSync(join(w.pages, '.nojekyll'))).toBe(true)
    expect(readFileSync(join(w.pages, 'index.html'), 'utf8')).toBe('<!doctype html>')
  })

  it('a fresh run over the finished release refuses before touching anything', async () => {
    expect(await run(['minor'])).toBe(0)
    const start = w.runner.calls.length
    expect(await run(['1.8.0'])).toBe(1)
    expect(w.err[0]).toMatch(/v1\.8\.0 has already been released/)
    expect(linesFrom(start)).toEqual([])
    expect(await run(['--resume', '1.8.0'])).toBe(1)
    expect(w.err[0]).toMatch(/v1\.8\.0 is already fully released .* nothing to resume/)
  })
})

describe('--resume after an interrupted publish step', () => {
  it('after a cut-off `gh release create`, uploads only the missing assets, with --clobber', async () => {
    w.failOn[CREATE] = () => {
      // gh made the draft and got two assets up before the connection dropped.
      w.gh.release = { isDraft: true, assets: new Map() }
      for (const name of NAMES.slice(0, 2)) {
        w.gh.release.assets.set(name, w.uploadedAsset(name))
        w.gh.uploads.push(name)
      }
      return { status: 1, stderr: 'HTTP 502: Bad Gateway (https://uploads.github.com/...)\n' }
    }
    expect(await run(['minor'])).toBe(1)
    expect(w.err).toHaveLength(1)
    expect(w.err[0]).toMatch(/`gh release create v1\.8\.0 .*` failed \(exit 1: HTTP 502.*`npm run release -- --resume` finds the draft/)
    expect(w.stateOf().steps['publish.draft']?.done).not.toBe(true)

    const start = w.runner.calls.length
    expect(await run(['--resume'])).toBe(0)
    const resumed = linesFrom(start)
    expect(resumed.filter((l) => l.startsWith('gh release create'))).toEqual([])
    expect(resumed.filter((l) => l.startsWith('gh release upload'))).toEqual([`gh release upload v1.8.0 ${paths(NAMES.slice(2)).join(' ')} --clobber ${REPO}`])
    expect([...w.gh.uploads].sort()).toEqual([...NAMES].sort())
    expect(w.stateOf().steps['publish.draft']).toMatchObject({ created: false, uploaded: NAMES.slice(2) })
    expect(w.stateOf().steps['publish.smoke'].done).toBe(true)
  })

  it('after the tag was made but not pushed, keeps the tag and pushes it', async () => {
    w.failOn['git push origin v1.8.0'] = { status: 1, stderr: 'fatal: unable to access github.com\n' }
    expect(await run(['minor'])).toBe(1)
    expect(w.err[0]).toMatch(/`git push origin v1\.8\.0` failed .* run `git push origin v1\.8\.0` yourself, then `npm run release -- --resume`/)
    delete w.failOn['git push origin v1.8.0']

    const start = w.runner.calls.length
    expect(await run(['--resume'])).toBe(0)
    expect(w.err).toEqual([])
    const resumed = linesFrom(start)
    expect(resumed.filter((l) => l.startsWith('git tag -a'))).toEqual([])
    expect(resumed).toContain('git push origin v1.8.0')
    expect(w.git.remoteTags.has('v1.8.0')).toBe(true)
  })

  it('every publish failure names the failed command and the resume command', async () => {
    w.failOn['git push origin main'] = { status: 1, stderr: 'error: failed to push some refs\n' }
    expect(await run(['minor'])).toBe(1)
    expect(w.err).toHaveLength(1)
    expect(w.err[0]).toMatch(/^release: `git push origin main` failed \(exit 1: error: failed to push some refs\) — .*`git push origin main`.*`npm run release -- --resume`/)
  })

  it('before the push, refuses when HEAD is no longer the release commit and says how to get it back', async () => {
    expect(await run(['minor'], upTo('build.sums'))).toBe(0)
    w.git.head = 'other999999'
    const start = w.runner.calls.length
    expect(await run(['--resume'])).toBe(1)
    expect(w.err[0]).toMatch(/HEAD is other99, but this release was built from bump111/)
    expect(w.err[0]).toContain('`git reset --hard bump1111111`), then `npm run release -- --resume`; to drop the release instead, get HEAD back on bump111 first, then --abort')
    expect(linesFrom(start).filter((l) => /^(git push|gh release (create|upload|edit))/.test(l))).toEqual([])
  })

  it('when main was pushed but publish.push not recorded, and someone pushed on top: goes on without pushing main again', async () => {
    w.failOn['git tag -a v1.8.0 -m v1.8.0 bump1111111'] = { status: null, error: new Error('killed') }
    expect(await run(['minor'])).toBe(1)
    delete w.failOn['git tag -a v1.8.0 -m v1.8.0 bump1111111']
    expect(w.git.originMain).toBe('bump1111111')
    w.git.parents.other000001 = 'bump1111111'
    w.git.originMain = 'other000001'

    const start = w.runner.calls.length
    expect(await run(['--resume'])).toBe(0)
    expect(w.err).toEqual([])
    const resumed = linesFrom(start)
    expect(resumed).not.toContain('git push origin main')
    expect(resumed).toContain('git tag -a v1.8.0 -m v1.8.0 bump1111111')
    expect(w.out.join('\n')).toMatch(/origin\/main already contains bump111 — not pushing main again/)
    expect(w.git.remoteTags.has('v1.8.0')).toBe(true)
    expect(w.stateOf().steps['publish.smoke'].done).toBe(true)
  })

  it('after the push, does not care where HEAD is as long as origin/main still contains the release', async () => {
    expect(await run(['minor'], upTo('publish.draft'))).toBe(0)
    // A fix was committed and pushed on top of the release commit meanwhile.
    w.git.parents.fix0000001 = 'bump1111111'
    w.git.head = w.git.originMain = 'fix0000001'
    expect(await run(['--resume'])).toBe(0)
    expect(w.err).toEqual([])
    expect(w.stateOf().steps['publish.smoke'].done).toBe(true)
  })

  it('after the push, refuses when origin/main no longer contains the release commit, and lists the steps left', async () => {
    expect(await run(['minor'], upTo('publish.pages'))).toBe(0)
    w.git.parents.rewrite0001 = 'base0000000'
    w.git.head = w.git.originMain = 'rewrite0001'
    const start = w.runner.calls.length
    expect(await run(['--resume'])).toBe(1)
    expect(w.err).toHaveLength(1)
    const line = w.err[0]
    expect(line).toMatch(/the release commit bump111 that publish\.push pushed is no longer in origin\/main's history — it was rewritten \(force-pushed\) mid-release\. Do NOT force-push/)
    expect(line).toContain(`publish.undraft: \`gh release edit v1.8.0 --draft=false --latest ${REPO}\``)
    expect(line).toContain('publish.smoke: `curl -s https://julia-shtal.github.io/scriptorium-writer/version.json`')
    expect(line).not.toContain('publish.pages:')
    expect(line).not.toContain('publish.draft:')
    expect(line).not.toContain('npm run release -- --resume')
    expect(linesFrom(start).filter((l) => /^(gh release (create|upload|edit)|pages: git (?!rev-parse ))/.test(l))).toEqual([])
  })

  it('refuses when origin/main moved before the release commit was pushed', async () => {
    expect(await run(['minor'], upTo('build.sums'))).toBe(0)
    w.git.originMain = 'someone0000'
    expect(await run(['--resume'])).toBe(1)
    expect(w.err[0]).toMatch(/origin\/main moved to someone since the release started from base000/)
  })

  it('refuses a tag that is not on the release commit', async () => {
    expect(await run(['minor'], upTo('build.sums'))).toBe(0)
    w.git.localTags.set('v1.8.0', 'elsewhere00')
    expect(await run(['--resume'])).toBe(1)
    expect(w.err[0]).toMatch(/tag v1\.8\.0 points at elsewhe, not the release commit bump111/)
  })

  it('runs preflight.checks again when stopped before the bump and HEAD moved', async () => {
    w.failOn['npm version 1.8.0 --no-git-tag-version'] = { status: 1, stderr: 'npm ERR! EBUSY\n' }
    expect(await run(['minor'])).toBe(1)
    delete w.failOn['npm version 1.8.0 --no-git-tag-version']
    // Only preflight is recorded: nothing to resume without naming the version.
    expect(await run(['--resume'])).toBe(1)
    expect(w.err[0]).toMatch(/no interrupted release/)

    w.git.head = w.git.originMain = 'newer000000'
    const start = w.runner.calls.length
    expect(await run(['--resume', '1.8.0'])).toBe(0)
    expect(linesFrom(start)).toContain('npm ci')
    expect(w.out.join('\n')).toMatch(/HEAD moved since they passed — running them again/)
  })
})

describe('--resume: which release', () => {
  const seed = (version: string, steps: Record<string, unknown>, dryRun = false) =>
    writeState(statePath(w.root, version), { schemaVersion: STATE_SCHEMA_VERSION, version, startedAt: '2026-11-08T00:00:00.000Z', dryRun, steps })

  it('refuses a dry-run state, and never picks one on its own', async () => {
    expect(await run(['minor', '--dry-run'])).toBe(0)
    expect(w.runner.lines().filter((l) => /^(git (push|commit|tag -a)|gh release (create|upload|edit)|pages: git (?!rev-parse ))/.test(l))).toEqual([])
    expect(w.out.join('\n')).toMatch(/Stage 4 \(publish\) would run/)
    const start = w.runner.calls.length

    expect(await run(['--resume'])).toBe(1)
    expect(w.err[0]).toMatch(/no interrupted release under release-out\/ — nothing to resume/)
    expect(await run(['--resume', '1.8.0'])).toBe(1)
    expect(w.err[0]).toMatch(/release-out\/1\.8\.0\/state\.json is from a dry run, which is never resumed/)
    expect(linesFrom(start)).toEqual([])
  })

  it('names the releases when several are interrupted', async () => {
    seed('1.8.0', { bump: { done: true, sha: 'a' } })
    seed('1.9.0', { bump: { done: true, sha: 'b' } })
    expect(await run(['--resume'])).toBe(1)
    expect(w.err[0]).toMatch(/2 interrupted releases under release-out\/ \(1\.8\.0, 1\.9\.0\) — say which: npm run release -- --resume 1\.8\.0/)
  })

  it('refuses a state filed under another version', async () => {
    writeState(statePath(w.root, '1.8.0'), { schemaVersion: STATE_SCHEMA_VERSION, version: '1.9.0', startedAt: '2026-11-08T00:00:00.000Z', dryRun: false, steps: {} })
    expect(await run(['--resume'])).toBe(1)
    expect(w.err[0]).toMatch(/records version 1\.9\.0 but sits in release-out\/1\.8\.0\/ — it was not written there by this script/)
  })

  it('takes only an exact version, and one that has a state', async () => {
    expect(await run(['--resume', 'minor'])).toBe(1)
    expect(w.err[0]).toMatch(/--resume takes the version from release-out\/, so give an exact X\.Y\.Z or nothing — not "minor"/)
    expect(await run(['--resume', '1.9.0'])).toBe(1)
    expect(w.err[0]).toMatch(/there is no release-out\/1\.9\.0\/state\.json — no release of 1\.9\.0 to resume/)
    expect(w.runner.calls).toEqual([])
  })
})

describe('--abort', () => {
  it('before the push: resets to the recorded parent and deletes release-out/X.Y.Z/', async () => {
    expect(await run(['minor'], upTo('build.sums'))).toBe(0)
    expect(w.git.head).toBe('bump1111111')
    const start = w.runner.calls.length
    expect(await run(['--abort'])).toBe(0)
    expect(w.err).toEqual([])
    expect(linesFrom(start)).toEqual([
      'git tag -l v1.8.0',
      'git rev-parse --abbrev-ref HEAD',
      'git rev-parse HEAD',
      'git merge-base --is-ancestor bump1111111 origin/main',
      'git status --porcelain',
      'git reset --hard base0000000'
    ])
    expect(w.git.head).toBe('base0000000')
    expect(existsSync(outDir())).toBe(false)
  })

  it('skips the reset when the bump made no commit', async () => {
    w.cleanup()
    w = releaseWorld({ current: '1.8.0', target: '1.8.0' })
    const changelog = join(w.root, 'docs', 'CHANGELOG.md')
    writeFileSync(changelog, readFileSync(changelog, 'utf8').replace('## 1.8.0 — unreleased', '## 1.8.0 — 2026-11-01'))
    expect(await run(['1.8.0'], upTo('bump'))).toBe(0)
    expect(w.stateOf().steps.bump).toMatchObject({ committed: false, parent: 'base0000000', sha: 'base0000000' })
    const start = w.runner.calls.length
    expect(await run(['--abort'])).toBe(0)
    expect(linesFrom(start)).toEqual(['git tag -l v1.8.0'])
    expect(w.out.join('\n')).toMatch(/the bump made no commit, so there is nothing to reset/)
    expect(existsSync(outDir())).toBe(false)
  })

  it('refuses when HEAD is not the release commit, and changes nothing', async () => {
    expect(await run(['minor'], upTo('build.sums'))).toBe(0)
    w.git.head = 'mywork00000'
    expect(await run(['--abort'])).toBe(1)
    expect(w.err[0]).toMatch(/HEAD is mywork0, not the release commit bump111 — --abort only undoes the release commit while it is on top/)
    expect(w.runner.lines().filter((l) => l.startsWith('git reset'))).toEqual([])
    expect(existsSync(outDir())).toBe(true)
  })

  it('refuses when the checkout is not on main', async () => {
    expect(await run(['minor'], upTo('build.sums'))).toBe(0)
    w.git.branch = 'm33-next'
    expect(await run(['--abort'])).toBe(1)
    expect(w.err[0]).toMatch(/this checkout is on "m33-next", and --abort resets main — `git switch main` first/)
    expect(w.runner.lines().filter((l) => l.startsWith('git reset'))).toEqual([])
    expect(existsSync(outDir())).toBe(true)
  })

  it('names the reset when the bump committed but died before state.json recorded it', async () => {
    w.failOn['git commit -m release: v1.8.0'] = () => {
      w.git.parents.bump1111111 = w.git.head
      w.git.subjects.bump1111111 = 'release: v1.8.0'
      w.git.head = 'bump1111111'
      return { status: null, error: new Error('killed') }
    }
    expect(await run(['minor'])).toBe(1)
    expect(w.stateOf().steps.bump).toBeUndefined()
    const start = w.runner.calls.length
    expect(await run(['--abort', '1.8.0'])).toBe(1)
    expect(w.err[0]).toMatch(/HEAD bump111 is a "release: v1\.8\.0" commit that state\.json never recorded .* drop it with `git reset --hard base0000000`, then --abort again/)
    expect(linesFrom(start).filter((l) => l.startsWith('git reset'))).toEqual([])
    expect(existsSync(outDir())).toBe(true)

    // Done by hand, as told: now --abort drops the rest.
    w.git.head = 'base0000000'
    expect(await run(['--abort', '1.8.0'])).toBe(0)
    expect(existsSync(outDir())).toBe(false)
  })

  it('refuses on a dirty tree, which git reset --hard would wipe', async () => {
    expect(await run(['minor'], upTo('build.sums'))).toBe(0)
    w.git.dirty = ' M src/main/index.ts\n'
    expect(await run(['--abort'])).toBe(1)
    expect(w.err[0]).toMatch(/uncommitted changes \(first: M src\/main\/index\.ts\) and --abort runs `git reset --hard`/)
    expect(w.runner.lines().filter((l) => l.startsWith('git reset'))).toEqual([])
  })

  it('refuses after the push and prints the manual withdraw commands for the steps done', async () => {
    expect(await run(['minor'], upTo('publish.pages'))).toBe(0)
    const start = w.runner.calls.length
    expect(await run(['--abort'])).toBe(1)
    expect(w.err).toHaveLength(1)
    const line = w.err[0]
    expect(line).toMatch(/v1\.8\.0 was already pushed \(publish\.push is done\), so --abort cannot undo it/)
    expect(line).toContain('`npm run release -- --resume`')
    expect(line).toContain(`\`gh release delete v1.8.0 --yes ${REPO}\``)
    expect(line).toContain('`git push origin :refs/tags/v1.8.0` and `git tag -d v1.8.0`')
    expect(line).toContain(`\`git -C ${w.pages} revert --no-edit pages000001\``)
    expect(line).toContain('`git revert bump1111111`')
    expect(linesFrom(start)).toEqual([])
    expect(existsSync(outDir())).toBe(true)
  })

  it('refuses when main was pushed but not recorded, even with commits on top of it on origin', async () => {
    w.failOn['git tag -a v1.8.0 -m v1.8.0 bump1111111'] = { status: null, error: new Error('killed') }
    expect(await run(['minor'])).toBe(1)
    w.git.parents.other000001 = 'bump1111111'
    w.git.originMain = 'other000001'
    expect(await run(['--abort'])).toBe(1)
    expect(w.err[0]).toMatch(/the release commit bump111 is already on origin\/main \(publish\.push was interrupted after pushing main\)/)
    expect(w.runner.lines().filter((l) => l.startsWith('git reset'))).toEqual([])
    expect(w.git.head).toBe('bump1111111')
    expect(existsSync(outDir())).toBe(true)
  })

  it('refuses when publish.push was cut off after tagging', async () => {
    w.failOn['git push origin v1.8.0'] = { status: 1, stderr: 'fatal: unable to access\n' }
    w.failOn['git push origin main'] = () => null
    expect(await run(['minor'])).toBe(1)
    expect(await run(['--abort'])).toBe(1)
    expect(w.err[0]).toMatch(/tag v1\.8\.0 exists, so the interrupted publish\.push got as far as tagging/)
  })

  it('drops a dry-run state without any git command', async () => {
    expect(await run(['minor', '--dry-run'])).toBe(0)
    const start = w.runner.calls.length
    expect(await run(['--abort', '1.8.0'])).toBe(0)
    expect(linesFrom(start)).toEqual([])
    expect(existsSync(outDir())).toBe(false)
  })
})
