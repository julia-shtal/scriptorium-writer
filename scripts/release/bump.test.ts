/**
 * Step `bump` against a temp repo and a fake runner: the real-run command sequence and the
 * recorded parent/sha, the "package.json already has this version" path, and the dry run, which
 * edits the working tree only and must leave the three files byte-identical afterwards — on
 * success and when a later step throws.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { BUMP_FILES, bumpVersion } from './bump.mjs'
import { ReleaseError } from './errors.mjs'
import { STEPS, runRelease } from './pipeline.mjs'
import { newState, statePath } from './state.mjs'
import { type Handler, fakeRunner, makeRepo, npmVersion, pkgVersion } from './test-world'

const AT = new Date('2026-11-09T12:00:00.000Z')
let root: string
let log: string[]

beforeEach(() => {
  root = makeRepo('1.7.0')
  log = []
})
afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

function makeCtx(version: string, { dryRun, table }: { dryRun: boolean; table: Record<string, Handler> }) {
  const runner = fakeRunner(table)
  const hooks: Array<() => void> = []
  const ctx = {
    root,
    version,
    currentVersion: pkgVersion(root),
    dryRun,
    resume: false,
    run: runner.run,
    env: {},
    platform: 'win32',
    now: () => AT,
    log: (l: string) => log.push(l),
    stateFile: statePath(root, version),
    state: newState({ version, dryRun, now: AT }),
    onFinally: (fn: () => void) => hooks.push(fn)
  }
  return { ctx, runner, hooks }
}

const read = (rel: string) => readFileSync(join(root, rel))
const snapshot = () => BUMP_FILES.map((f) => read(f))
const changelog = () => read('docs/CHANGELOG.md').toString('utf8')

/** git HEAD moves from `parent` to `sha` once `git commit` has run. */
function gitTable(parent = 'aaa111', sha = 'bbb222'): Record<string, Handler> {
  let committed = false
  return {
    'git rev-parse HEAD': () => ({ stdout: `${committed ? sha : parent}\n` }),
    'git add package.json package-lock.json docs/CHANGELOG.md': {},
    'git commit -m release: v1.8.0': () => void (committed = true),
    'git commit -m release: v1.7.0': () => void (committed = true)
  }
}

describe('bump, real run', () => {
  it('bumps, dates the CHANGELOG, commits the three files and records parent and sha', () => {
    const { ctx, runner } = makeCtx('1.8.0', { dryRun: false, table: { ...gitTable(), ...npmVersion(root, '1.8.0') } })
    const data = bumpVersion(ctx)
    expect(runner.lines()).toEqual([
      'git rev-parse HEAD',
      'npm version 1.8.0 --no-git-tag-version',
      'git add package.json package-lock.json docs/CHANGELOG.md',
      'git commit -m release: v1.8.0',
      'git rev-parse HEAD'
    ])
    expect(data).toMatchObject({ parent: 'aaa111', sha: 'bbb222', committed: true, from: '1.7.0', to: '1.8.0', versionChanged: true, changelogStamped: true })
    expect(pkgVersion(root)).toBe('1.8.0')
    expect(JSON.parse(read('package-lock.json').toString()).version).toBe('1.8.0')
    expect(changelog()).toContain('## 1.8.0 — 2026-11-09\n')
    expect(changelog()).toContain('## 1.7.0 — unreleased\n')
    expect(runner.unexpected).toEqual([])
  })

  it('skips npm version when package.json already has the target, but still dates and commits', () => {
    const { ctx, runner } = makeCtx('1.7.0', { dryRun: false, table: gitTable() })
    const data = bumpVersion(ctx)
    expect(runner.lines()).toEqual([
      'git rev-parse HEAD',
      'git add package.json package-lock.json docs/CHANGELOG.md',
      'git commit -m release: v1.7.0',
      'git rev-parse HEAD'
    ])
    expect(data).toMatchObject({ parent: 'aaa111', sha: 'bbb222', committed: true, versionChanged: false, changelogStamped: true })
    expect(changelog()).toContain('## 1.7.0 — 2026-11-09\n')
  })

  it('makes no commit when the version is equal and the heading already dated: parent == sha == HEAD', () => {
    writeFileSync(join(root, 'docs', 'CHANGELOG.md'), changelog().replace('## 1.7.0 — unreleased', '## 1.7.0 — 2026-11-01'))
    const before = snapshot()
    const { ctx, runner } = makeCtx('1.7.0', { dryRun: false, table: gitTable() })
    const data = bumpVersion(ctx)
    expect(runner.lines()).toEqual(['git rev-parse HEAD'])
    expect(data).toMatchObject({ parent: 'aaa111', sha: 'aaa111', committed: false })
    expect(snapshot()).toEqual(before)
  })

  it('stops with one line when the commit fails', () => {
    const { ctx } = makeCtx('1.8.0', {
      dryRun: false,
      table: { ...gitTable(), ...npmVersion(root, '1.8.0'), 'git commit -m release: v1.8.0': { status: 1, stderr: 'error: gpg failed to sign the data\n' } }
    })
    expect(() => bumpVersion(ctx)).toThrow(ReleaseError)
    expect(() => bumpVersion(ctx)).toThrow(/`git commit -m release: v1\.8\.0` failed \(exit 1: error: gpg failed/)
  })
})

describe('bump, dry run', () => {
  const bumpStep = STEPS.find((s: { id: string }) => s.id === 'bump')

  it('edits the working tree with no git command, then restores the files byte for byte', async () => {
    const before = snapshot()
    let during: Buffer[] = []
    const { ctx, runner } = makeCtx('1.8.0', { dryRun: true, table: npmVersion(root, '1.8.0') })
    await runRelease(ctx, [bumpStep, { id: 'build.web', stage: 'build', title: 'peek', run: () => void (during = snapshot()) }])
    expect(runner.lines()).toEqual(['npm version 1.8.0 --no-git-tag-version'])
    // During the run the builds see the bumped version and the dated heading...
    expect(JSON.parse(during[0].toString()).version).toBe('1.8.0')
    expect(during[2].toString()).toContain('## 1.8.0 — 2026-11-09')
    // ...and afterwards nothing is left of it.
    expect(snapshot()).toEqual(before)
  })

  it('restores the files when a later step throws', async () => {
    const before = snapshot()
    const { ctx } = makeCtx('1.8.0', { dryRun: true, table: npmVersion(root, '1.8.0') })
    const failing = {
      id: 'build.web',
      stage: 'build',
      title: 'fails',
      run: () => {
        expect(pkgVersion(root)).toBe('1.8.0')
        throw new ReleaseError('npm run build:web failed')
      }
    }
    await expect(runRelease(ctx, [bumpStep, failing])).rejects.toThrow('npm run build:web failed')
    expect(snapshot()).toEqual(before)
  })

  it('restores the files when the bump itself fails halfway', async () => {
    const before = snapshot()
    rmSync(join(root, 'docs', 'CHANGELOG.md'))
    writeFileSync(join(root, 'docs', 'CHANGELOG.md'), '# Changelog\n')
    const withoutSection = snapshot()
    const { ctx } = makeCtx('1.8.0', { dryRun: true, table: npmVersion(root, '1.8.0') })
    await expect(runRelease(ctx, [bumpStep])).rejects.toThrow(/lost its "## 1\.8\.0" section/)
    // package.json had already been bumped by npm version; it is back.
    expect(snapshot()).toEqual(withoutSection)
    expect(withoutSection[0]).toEqual(before[0])
  })

  it('keeps CRLF line endings when dating the heading', async () => {
    writeFileSync(join(root, 'docs', 'CHANGELOG.md'), changelog().replace(/\n/g, '\r\n'))
    const { ctx } = makeCtx('1.7.0', { dryRun: true, table: {} })
    let during = ''
    await runRelease(ctx, [bumpStep, { id: 'build.web', stage: 'build', title: 'peek', run: () => void (during = changelog()) }])
    expect(during).toContain('## 1.7.0 — 2026-11-09\r\n')
    expect(during.replace(/\r\n/g, '').includes('\n')).toBe(false)
  })
})
