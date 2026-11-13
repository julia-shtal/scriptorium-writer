/**
 * The publish steps (11–15) in detail, through main() and the stateful fake world: the asset
 * comparison (name, size, upload state, SHA-256) that gates the draft and the undraft, the
 * gh-pages deploy's guards and its "nothing changed" path, and the smoke check's polling — on a
 * fake clock, so the five-minute timeout takes no time. The resume/abort flows themselves are in
 * resume.test.ts.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { exeName, publishAssets } from './artifacts.mjs'
import { ReleaseError } from './errors.mjs'
import { STEPS, main } from './pipeline.mjs'
import { assetProblems, publishPlan, remainingByHand, resumable } from './publish.mjs'
import { samePath } from './pages.mjs'
import { FETCH_TIMEOUT_MS, POLL_TIMEOUT_MS } from './smoke.mjs'
import { type FakeAsset, releaseWorld } from './release-world'

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

const REPO = '--repo julia-shtal/scriptorium-writer'
const upTo = (id: string) => STEPS.slice(0, STEPS.findIndex((s: Step) => s.id === id) + 1)
const NAMES = publishAssets('1.8.0') as string[]
const EXE = exeName('1.8.0') as string
const outFile = (name: string) => join(w.root, 'release-out', '1.8.0', name)
const sizeOf = (name: string) => readFileSync(outFile(name)).length
const uploadLine = (names: string[]) => `gh release upload v1.8.0 ${names.map((n) => `release-out/1.8.0/${n}`).join(' ')} --clobber`
const ghCalls = (re: RegExp) => w.runner.lines().filter((l) => re.test(l))

async function run(argv: string[], steps?: Step[], overrides: Record<string, unknown> = {}) {
  w.out.length = 0
  w.err.length = 0
  return main(argv, { ...w.deps(steps), ...overrides })
}

/** A draft the interrupted publish.draft left behind: every asset fully uploaded, except `odd`. */
function leaveDraft(odd: Record<string, Partial<FakeAsset> | null> = {}) {
  const assets = new Map<string, FakeAsset>()
  for (const name of NAMES) {
    if (odd[name] === null) continue
    assets.set(name, { ...w.uploadedAsset(name), ...odd[name] })
  }
  w.gh.release = { isDraft: true, assets }
}

describe('assetProblems', () => {
  const local = [
    { name: 'a.exe', size: 10, sha256: 'aa' },
    { name: 'b.apk', size: 20, sha256: 'bb' }
  ]
  const up = (name: string, size: number, digest?: string) => ({ name, size, state: 'uploaded', digest })

  it('is empty for the same names, sizes and digests, in any order; a missing digest is not held against it', () => {
    expect(assetProblems(local, [up('b.apk', 20, 'sha256:bb'), up('a.exe', 10)])).toEqual([])
  })
  it('names a missing, unfinished, wrong-size, wrong-hash and stray asset', () => {
    expect(assetProblems(local, [{ name: 'a.exe', size: 10, state: 'starter' }, up('b.apk', 19), up('old.exe', 1)])).toEqual([
      'a.exe is "starter" on GitHub, not uploaded',
      'b.apk is 19 bytes on GitHub, 20 locally',
      "old.exe is not one of this release's files"
    ])
    expect(assetProblems(local, [up('b.apk', 20, 'sha256:00')])).toEqual(['a.exe is missing', 'b.apk has a different SHA-256 on GitHub (sha256:00)'])
  })
})

describe('publish.draft', () => {
  it('re-uploads a cut-off asset (not uploaded, or same size but another hash)', async () => {
    expect(await run(['minor'], upTo('publish.push'))).toBe(0)
    leaveDraft({ [EXE]: { state: 'starter' }, 'latest.yml': { digest: 'sha256:0000' } })
    expect(await run(['--resume'])).toBe(0)
    expect(ghCalls(/^gh release upload/)).toEqual([`${uploadLine([EXE, 'latest.yml'])} ${REPO}`])
    expect(w.stateOf().steps['publish.draft']).toMatchObject({ created: false, uploaded: [EXE, 'latest.yml'] })
  })

  it('stops if GitHub still disagrees after the re-upload', async () => {
    expect(await run(['minor'], upTo('publish.push'))).toBe(0)
    leaveDraft({ [EXE]: { size: 4096 } })
    // gh claims success, but GitHub keeps the broken asset.
    w.failOn[uploadLine([EXE])] = { stdout: '' }
    expect(await run(['--resume'])).toBe(1)
    expect(w.err).toHaveLength(1)
    expect(w.err[0]).toContain(`the GitHub release v1.8.0 does not carry exactly the files built in release-out/1.8.0/: ${EXE} is 4096 bytes on GitHub, ${sizeOf(EXE)} locally — `)
    expect(w.err[0]).toContain('npm run release -- --resume')
    expect(w.stateOf().steps['publish.draft']?.done).not.toBe(true)
    expect(ghCalls(/^gh release edit/)).toEqual([])
  })

  it('refuses a draft carrying a file this release did not build', async () => {
    expect(await run(['minor'], upTo('publish.push'))).toBe(0)
    leaveDraft()
    w.gh.release?.assets.set('Scriptorium Writer Setup 1.8.0.exe', { size: 1, state: 'uploaded' })
    expect(await run(['--resume'])).toBe(1)
    expect(w.err[0]).toContain(`delete what does not belong (\`gh release delete-asset v1.8.0 Scriptorium Writer Setup 1.8.0.exe --yes ${REPO}\`)`)
  })

  it('refuses to adopt a release that is already public — without promising that --resume helps', async () => {
    expect(await run(['minor'], upTo('publish.push'))).toBe(0)
    w.gh.release = { isDraft: false, assets: new Map() }
    expect(await run(['--resume'])).toBe(1)
    expect(w.err[0]).toMatch(/^release: the GitHub release v1\.8\.0 is already public, but this run never published it — .*finish the remaining steps by hand\.$/)
    expect(w.err[0]).not.toContain('--resume')
    expect(ghCalls(/^gh release (create|upload)/)).toEqual([])
  })

  it('never takes a failed lookup for "no release yet" — no second create', async () => {
    expect(await run(['minor'], upTo('publish.push'))).toBe(0)
    w.failOn['gh release view v1.8.0 --json assets,isDraft'] = { status: 1, stderr: 'HTTP 401: Bad credentials (https://api.github.com/graphql)\n' }
    expect(await run(['--resume'])).toBe(1)
    expect(w.err[0]).toMatch(/`gh release view v1\.8\.0 --json assets,isDraft --repo julia-shtal\/scriptorium-writer` failed \(HTTP 401: Bad credentials/)
    expect(ghCalls(/^gh release create/)).toEqual([])
  })

  it('never uploads an artifact that changed since it was built', async () => {
    expect(await run(['minor'], upTo('publish.push'))).toBe(0)
    writeFileSync(outFile(EXE), 'tampered')
    expect(await run(['--resume'])).toBe(1)
    expect(w.err[0]).toContain(`release-out/1.8.0/${EXE} changed since build.windows built and verified it — it must not be published as it is`)
    expect(w.err[0]).not.toContain('--abort')
    expect(ghCalls(/^gh release (create|upload)/)).toEqual([])
  })

  it('a missing stage-3 record is final: neither --abort nor --resume is suggested', async () => {
    expect(await run(['minor'], upTo('publish.push'))).toBe(0)
    const file = join(w.root, 'release-out', '1.8.0', 'state.json')
    const state = JSON.parse(readFileSync(file, 'utf8'))
    // build.android stays "done" (so it is not rebuilt), but its record of the APK is gone.
    delete state.steps['build.android'].apk
    writeFileSync(file, JSON.stringify(state))
    expect(await run(['--resume', '1.8.0'])).toBe(1)
    expect(w.err[0]).toMatch(/state\.json records no Scriptorium-Writer-1\.8\.0\.apk from stage 3 — publishing cannot go on without it/)
    expect(w.err[0]).not.toMatch(/--abort|--resume/)
  })
})

describe('publish.undraft', () => {
  it('compares the assets again before going public', async () => {
    expect(await run(['minor'], upTo('publish.pages'))).toBe(0)
    w.gh.release?.assets.delete('latest.yml')
    expect(await run(['--resume'])).toBe(1)
    expect(w.err[0]).toMatch(/does not carry exactly the files .*: latest\.yml is missing/)
    expect(w.gh.release?.isDraft).toBe(true)
    expect(ghCalls(/^gh release edit/)).toEqual([])
  })

  it('a deleted draft is final', async () => {
    expect(await run(['minor'], upTo('publish.pages'))).toBe(0)
    w.gh.release = null
    expect(await run(['--resume'])).toBe(1)
    expect(w.err[0]).toMatch(/GitHub has no release v1\.8\.0, although publish\.draft recorded one — was the draft deleted\?/)
    expect(w.err[0]).not.toContain('npm run release -- --resume')
  })
})

describe('publish.pages', () => {
  it('adds and commits with core.autocrlf=false, and pushes', async () => {
    expect(await run(['minor'])).toBe(0)
    expect(w.runner.lines().filter((l) => /^pages: git .*(add|commit)/.test(l))).toEqual([
      'pages: git -c core.autocrlf=false add -A',
      'pages: git -c core.autocrlf=false commit -m deploy v1.8.0'
    ])
  })

  it('skips the commit when the worktree already holds the pushed bundle, and still pushes', async () => {
    // The deploy commit was pushed, then the process died before state.json recorded the step.
    w.failOn['pages: git push origin gh-pages'] = () => {
      w.site.pushed = w.site.head
      w.site.pushedAtPoll = 0
      w.site.servedVersion = '1.8.0'
      return { status: null, error: new Error('killed') }
    }
    expect(await run(['minor'])).toBe(1)
    expect(w.err[0]).toContain('npm run release -- --resume')
    delete w.failOn['pages: git push origin gh-pages']
    expect(w.site.commits).toBe(1)

    expect(await run(['--resume'])).toBe(0)
    expect(w.site.commits).toBe(1)
    expect(w.runner.lines().filter((l) => l.includes('commit -m deploy'))).toHaveLength(1)
    expect(w.stateOf().steps['publish.pages']).toMatchObject({ done: true, committed: false, commit: 'pages000001' })
    expect(w.out.join('\n')).toMatch(/already holds this bundle — no commit/)
  })

  it('on resume, pushes its own deploy commit that the interrupted run could not push', async () => {
    w.failOn['pages: git push origin gh-pages'] = { status: 1, stderr: 'fatal: unable to access github.com\n' }
    expect(await run(['minor'])).toBe(1)
    expect(w.err[0]).toMatch(/`git push origin gh-pages` failed .*`git -C .* push origin gh-pages` yourself, then `npm run release -- --resume`/)
    delete w.failOn['pages: git push origin gh-pages']
    expect(w.site.head).not.toBe(w.site.pushed)

    expect(await run(['--resume'])).toBe(0)
    expect(w.site.pushed).toBe('pages000001')
    expect(w.site.commits).toBe(1)
    expect(w.out.join('\n')).toMatch(/has what the interrupted deploy left — redoing it/)
  })

  it('accepts the dirty worktree an interrupted deploy of its own left, and redoes it', async () => {
    w.failOn['pages: git -c core.autocrlf=false add -A'] = () => {
      w.site.dirty = ' D index.html\n?? assets/\n'
      return { status: null, error: new Error('killed') }
    }
    expect(await run(['minor'])).toBe(1)
    expect(w.stateOf().steps['publish.pages']).toMatchObject({ done: false, startedAt: expect.any(String) })
    delete w.failOn['pages: git -c core.autocrlf=false add -A']

    expect(await run(['--resume'])).toBe(0)
    expect(w.out.join('\n')).toMatch(/has what the interrupted deploy left — redoing it from the frozen bundle/)
    expect(w.stateOf().steps['publish.smoke'].done).toBe(true)
  })

  it('refuses a dirty worktree it did not dirty itself', async () => {
    w.site.dirty = ' M index.html\n'
    expect(await run(['minor'])).toBe(1)
    expect(w.err[0]).toMatch(/the gh-pages worktree .* is not clean \(first: M index\.html\) — everything in it is replaced by the deploy/)
    expect(ghCalls(/^pages: git rm/)).toEqual([])
    expect(readFileSync(join(w.pages, 'index.html'), 'utf8')).toBe('previous deploy')
  })

  it('refuses when origin/gh-pages moved on, before touching anything', async () => {
    w.site.parents.someone0001 = w.site.head
    w.site.pushed = 'someone0001'
    expect(await run(['minor'])).toBe(1)
    expect(w.err[0]).toMatch(/is behind origin\/gh-pages \(someone deployed meanwhile\) — `git -C .* pull --ff-only`, then `npm run release -- --resume`/)
    expect(ghCalls(/^pages: git rm/)).toEqual([])
    expect(w.stateOf().steps['publish.pages']).toBeUndefined()
  })

  it('refuses unpushed commits of someone else in the worktree', async () => {
    w.site.parents.local00001 = w.site.head
    w.site.head = 'local00001'
    expect(await run(['minor'])).toBe(1)
    expect(w.err[0]).toMatch(/has commits origin\/gh-pages does not \(local00 vs pages00\) — push or drop them/)
    expect(ghCalls(/^pages: git rm/)).toEqual([])
  })

  it.each([
    ['on another branch', (x: World) => void (x.site.branch = 'main'), /is on "main", not gh-pages — .*`git -C .* switch gh-pages`/],
    ['not the top of its worktree', (x: World) => void (x.site.toplevel = 'C:/Users/someone/IdeaProjects/scriptorium-writer'), /is not the top of a git worktree \(git says the worktree is C:\/Users\/someone\/IdeaProjects\/scriptorium-writer\) — `git rm -rf \.` there would empty the wrong tree/],
    ['missing', (x: World) => rmSync(x.pages, { recursive: true, force: true }), /the gh-pages worktree .* does not exist — create it with `git worktree add .* gh-pages` \(or set SCRIPTORIUM_PAGES_DIR\)/]
  ])('a worktree %s stops a fresh release in preflight, before the bump commit', async (_, breakIt, message) => {
    breakIt(w)
    expect(await run(['minor'])).toBe(1)
    expect(w.err).toHaveLength(1)
    expect(w.err[0]).toMatch(message)
    expect(w.err[0]).toMatch(/, then run the release again\.$/)
    expect(ghCalls(/^(git (commit|push|tag -a)|npm version|gh release (create|upload|edit)|pages: git rm)/)).toEqual([])
  })

  it('a worktree broken after the draft stops the resume in preflight, before anything else is published', async () => {
    expect(await run(['minor'], upTo('publish.draft'))).toBe(0)
    w.site.branch = 'main'
    expect(await run(['--resume'])).toBe(1)
    expect(w.err[0]).toMatch(/is on "main", not gh-pages/)
    // On a resume, preflight says to resume again, not to start the release over.
    expect(w.err[0]).toMatch(/, then `npm run release -- --resume` again\.$/)
    expect(ghCalls(/^(gh release edit|pages: git (rm|fetch))/)).toEqual([])
  })

  it('step 13 checks the worktree again if it changed after preflight', async () => {
    // Someone switches the worktree's branch while the release is uploading the draft.
    w.failOn[`gh release create v1.8.0 --draft --verify-tag --title 1.8.0 --notes-file release-out/1.8.0/release-notes.md ${NAMES.map((n) => `release-out/1.8.0/${n}`).join(' ')}`] = () => {
      w.site.branch = 'main'
      return null
    }
    expect(await run(['minor'])).toBe(1)
    expect(w.err[0]).toMatch(/is on "main", not gh-pages — .*, then `npm run release -- --resume`\.$/)
    expect(ghCalls(/^pages: git rm/)).toEqual([])
    expect(w.stateOf().steps['publish.draft'].done).toBe(true)
  })

  it('once publish.pages is done, a resume no longer needs the worktree', async () => {
    w.net.pagesDelay = 1_000
    expect(await run(['minor'])).toBe(1)
    expect(w.stateOf().steps['publish.pages'].done).toBe(true)
    rmSync(w.pages, { recursive: true, force: true })
    w.net.pagesDelay = 0
    expect(await run(['--resume'])).toBe(0)
    expect(w.stateOf().steps['publish.smoke'].done).toBe(true)
  })

  it('refuses a frozen bundle that no longer matches what build.web verified', async () => {
    expect(await run(['minor'], upTo('publish.draft'))).toBe(0)
    writeFileSync(join(w.root, 'release-out', '1.8.0', 'web', 'index.html'), 'edited after the build')
    expect(await run(['--resume'])).toBe(1)
    expect(w.err[0]).toMatch(/the frozen web bundle .* no longer matches what build\.web verified — it must not be deployed/)
    expect(ghCalls(/^pages: git rm/)).toEqual([])
  })
})

describe('samePath', () => {
  it('ignores separators, a trailing slash and, on Windows, case', () => {
    const dir = join(w.root, 'Sub')
    mkdirSync(dir)
    expect(samePath(dir, `${dir.replace(/\\/g, '/')}/`, 'win32')).toBe(true)
    expect(samePath('C:/Pages', 'c:\\pages', 'win32')).toBe(true)
    expect(samePath('/srv/Pages', '/srv/pages', 'linux')).toBe(false)
    expect(samePath(dir, join(w.root, 'Other'), 'win32')).toBe(false)
  })
})

describe('publish.smoke', () => {
  it('polls version.json every 15 s until it reads the new version, each request with a timeout', async () => {
    w.net.pagesDelay = 3
    const before = w.clock()
    expect(await run(['minor'])).toBe(0)
    expect(w.stateOf().steps['publish.smoke']).toMatchObject({ done: true, pwaVersion: '1.8.0', pwaAttempts: 4, latestYmlPath: EXE })
    expect(w.clock() - before).toBe(3 * 15_000)
    // Every request is cache-busted, uncached, and cannot hang.
    expect(w.fetched.every((u) => /\?t=\d+$/.test(u))).toBe(true)
    expect(w.fetchInits.every((i) => i?.cache === 'no-store' && i.signal instanceof AbortSignal)).toBe(true)
    expect(FETCH_TIMEOUT_MS).toBe(20_000)
  })

  it('gives up after 5 minutes with one clear line, and a resume re-runs only the check', async () => {
    w.net.pagesDelay = 1_000
    const before = w.clock()
    expect(await run(['minor'])).toBe(1)
    expect(w.err).toHaveLength(1)
    expect(w.err[0]).toMatch(
      /the PWA at https:\/\/julia-shtal\.github\.io\/scriptorium-writer\/version\.json \(expected version 1\.8\.0\) still did not check out after 5 min and 21 tries \(last: version "1\.7\.0"\) — check it by hand \(`curl -s https:\/\/julia-shtal\.github\.io\/scriptorium-writer\/version\.json`\); once it does, `npm run release -- --resume`/
    )
    expect(w.clock() - before).toBe(POLL_TIMEOUT_MS)
    expect(w.stateOf().steps['publish.undraft'].done).toBe(true)

    w.net.pagesDelay = 0
    const start = w.runner.calls.length
    expect(await run(['--resume'])).toBe(0)
    expect(w.runner.lines().slice(start).filter((l) => l.startsWith('pages: git rm') || l.startsWith('gh release edit'))).toEqual([])
    expect(w.stateOf().steps['publish.smoke'].done).toBe(true)
  })

  it('fails at once when the published latest.yml points at another file', async () => {
    const deps = w.deps()
    const fetch = async (url: string, init?: RequestInit) =>
      url.includes('/latest.yml?') ? new Response('version: 1.8.0\npath: Scriptorium Writer Setup 1.8.0.exe\n', { status: 200 }) : deps.fetch(url, init)
    expect(await run(['minor'], undefined, { fetch })).toBe(1)
    expect(w.err[0]).toMatch(/the published latest\.yml says version "1\.8\.0", path "Scriptorium Writer Setup 1\.8\.0\.exe" — expected 1\.8\.0 and Scriptorium-Writer-Setup-1\.8\.0\.exe; installed Windows clients cannot update/)
  })

  it('treats network errors and timed-out requests as "not yet"', async () => {
    const deps = w.deps()
    const failures = [new TypeError('fetch failed'), new DOMException('The operation was aborted due to timeout', 'TimeoutError')]
    const fetch = async (url: string, init?: RequestInit) => {
      const next = failures.shift()
      if (next) throw next
      return deps.fetch(url, init)
    }
    w.net.pagesDelay = 0
    expect(await run(['minor'], undefined, { fetch })).toBe(0)
    expect(w.stateOf().steps['publish.smoke'].pwaAttempts).toBe(3)
  })
})

describe('dry run and the publish steps', () => {
  it('resumable() refuses to run a publish step in a dry run', async () => {
    let ran = false
    const step = resumable('publish.push', () => void (ran = true))
    await expect(step({ dryRun: true })).rejects.toThrow(/publish steps are left out of a dry run/)
    expect(ran).toBe(false)
  })

  it('resumable() ends any failure with the resume command and keeps the cause', async () => {
    const boom = new Error('EBUSY: resource busy')
    const step = resumable('publish.pages', () => {
      throw boom
    })
    const err = await step({ dryRun: false }).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ReleaseError)
    expect((err as Error).message).toBe('publish.pages failed unexpectedly: EBUSY: resource busy — publish.pages is not done; once fixed, `npm run release -- --resume` continues from it.')
    expect((err as Error & { cause: unknown }).cause).toBe(boom)
  })

  it('resumable() passes a final error on untouched', async () => {
    const final = new ReleaseError('the draft was deleted — finish by hand.', { final: true })
    const step = resumable('publish.undraft', () => {
      throw final
    })
    await expect(step({ dryRun: false })).rejects.toBe(final)
  })

  it('the by-hand pages commands match the automated step', () => {
    const state = { version: '1.8.0', steps: { 'publish.draft': { done: true } } }
    const [pages, ...rest] = remainingByHand({ root: w.root, state, env: { SCRIPTORIUM_PAGES_DIR: '../scriptorium-pages' } })
    expect(pages).toBe(
      'publish.pages: in ../scriptorium-pages: `git fetch origin gh-pages`, check `git rev-parse HEAD origin/gh-pages` prints the same commit twice, `git rm -rf . --quiet --ignore-unmatch`, copy release-out/1.8.0/web/* there, create .nojekyll, `git -c core.autocrlf=false add -A`, `git -c core.autocrlf=false commit -m "deploy v1.8.0"`, `git push origin gh-pages`'
    )
    expect(rest.map((l: string) => l.split(':')[0])).toEqual(['publish.undraft', 'publish.smoke'])
  })

  it('the plan names every stage-4 command, each gh call with --repo', () => {
    const plan = publishPlan({ root: w.root, version: '1.8.0', env: {} }).join('\n')
    for (const needle of [
      'git push origin main',
      'git push origin v1.8.0',
      'gh release create v1.8.0 --draft --verify-tag',
      `gh release edit v1.8.0 --draft=false --latest ${REPO}`,
      `gh release view v1.8.0 --json assets,isDraft ${REPO}`,
      `--repo julia-shtal/scriptorium-writer`,
      'version.json'
    ]) {
      expect(plan).toContain(needle)
    }
  })
})
