/**
 * Stage 1 of `npm run release`, run end to end through main() against a fake world: a temp
 * directory standing in for the repo (package.json, docs/CHANGELOG.md, the keystore file), a
 * temp Android SDK, and a fake runner that answers git/gh/npm from a table and records every
 * call. The table lists every command preflight is expected to issue; anything else fails the
 * test (the fake throws, and afterEach asserts no unexpected command was seen).
 * Nothing here spawns a real process. The runs stop after preflight (main() is handed only the
 * preflight steps); bump and build are covered in bump.test.ts, build.test.ts and dry-run.test.ts.
 *
 * The M32 Task 1 acceptance criterion is the first block: a dirty tree, an existing tag (local or
 * on origin) and a missing CHANGELOG section each stop the run with ONE line on stderr, and
 * change nothing — asserted three ways: no mutating git/npm/gh command reached the runner, no
 * file in the repo changed, and no release-out/ directory was created.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import { STEPS, main } from './pipeline.mjs'
import { STATE_SCHEMA_VERSION, statePath, writeState } from './state.mjs'

type Reply = { status?: number | null; stdout?: string; stderr?: string; error?: Error | null }
type Call = { line: string; capture: boolean }

const PREFLIGHT_STEPS = STEPS.filter((s: { stage: string }) => s.stage === 'preflight')

const CHANGELOG = [
  '# Changelog',
  '',
  '## 1.7.0 — unreleased',
  '',
  '- Import a library.',
  '',
  '## 1.6.0 — 2026-09-05',
  '',
  '- Web and Android.',
  ''
].join('\n')

// The happy path: on main, clean, HEAD == origin/main, no tag and no GitHub release for the
// version, gh signed in, every gate green. Version-specific commands are listed for each version
// a test resolves to (1.7.0 given explicitly, 1.8.0 from "minor").
const forVersion = (version: string): Record<string, Reply> => ({
  [`git tag -l v${version}`]: { stdout: '' },
  [`git ls-remote --tags origin refs/tags/v${version}`]: { stdout: '' },
  [`gh release view v${version} --json tagName --repo julia-shtal/scriptorium-writer`]: { status: 1, stderr: 'release not found\n' }
})
const HAPPY: Record<string, Reply> = {
  'git rev-parse --abbrev-ref HEAD': { stdout: 'main\n' },
  'git status --porcelain': { stdout: '' },
  'git fetch origin main': {},
  'git rev-parse HEAD': { stdout: 'abc123\n' },
  'git rev-parse origin/main': { stdout: 'abc123\n' },
  ...forVersion('1.7.0'),
  ...forVersion('1.8.0'),
  'gh auth status': { stdout: 'Logged in to github.com account julia-shtal' },
  // The gh-pages worktree (commands run there are keyed "pages: ..."); --show-toplevel is
  // answered per test in world(), since it prints the temp directory.
  'pages: git rev-parse --abbrev-ref HEAD': { stdout: 'gh-pages\n' },
  'npm ci': {},
  'npm run typecheck': {},
  'npm run lint': {},
  'npm test': {},
  'npm run test:browser': {}
}

// Anything that would change git history, refs on origin, package.json or a GitHub release.
// `git fetch` is deliberately absent: updating remote-tracking refs is what the
// "up to date with origin/main" check has to do.
const MUTATING = [
  /^git (commit|push|reset|add|rm|checkout|switch|merge|rebase|stash|branch|cherry-pick|revert)\b/,
  /^git tag(?! -l)/,
  /^npm version\b/,
  /^gh release (?!view\b)/
]

let root: string
let sdk: string
let pages: string
let calls: Call[]
let unexpected: string[]
let out: string[]
let err: string[]

function world(overrides: Record<string, Reply> = {}) {
  const replies: Record<string, Reply> = { 'pages: git rev-parse --show-toplevel': { stdout: `${pages}\n` }, ...HAPPY, ...overrides }
  return (cmd: string, args: string[] = [], opts: { capture?: boolean; cwd?: string } = {}) => {
    const line = `${opts.cwd === pages ? 'pages: ' : ''}${[cmd, ...args].join(' ')}`
    calls.push({ line, capture: opts.capture !== false })
    const r = replies[line]
    if (!r) {
      unexpected.push(line)
      throw new Error(`fake runner: unexpected command "${line}"`)
    }
    return { status: r.status === undefined ? 0 : r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '', error: r.error ?? null }
  }
}

function release(argv: string[], { replies = {}, env = {} }: { replies?: Record<string, Reply>; env?: Record<string, string> } = {}) {
  return main(argv, {
    root,
    run: world(replies),
    env: { ANDROID_HOME: sdk, SCRIPTORIUM_PAGES_DIR: pages, ...env },
    platform: 'win32',
    steps: PREFLIGHT_STEPS,
    now: () => new Date('2026-11-09T12:00:00.000Z'),
    out: (l: string) => out.push(l),
    err: (l: string) => err.push(l)
  })
}

/** Every file under the fake repo, path -> contents. */
function snapshot(dir = root): Record<string, string> {
  const files: Record<string, string> = {}
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, e.name)
    if (e.isDirectory()) Object.assign(files, snapshot(full))
    else files[relative(root, full)] = readFileSync(full, 'utf8')
  }
  return files
}

const mutating = () => calls.filter((c) => MUTATING.some((re) => re.test(c.line))).map((c) => c.line)
const npmCalls = () => calls.filter((c) => c.line.startsWith('npm ')).map((c) => c.line)

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'release-repo-'))
  sdk = mkdtempSync(join(tmpdir(), 'release-sdk-'))
  pages = mkdtempSync(join(tmpdir(), 'release-pages-'))
  writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'x', version: '1.7.0' }, null, 2) + '\n')
  mkdirSync(join(root, 'docs'))
  writeFileSync(join(root, 'docs', 'CHANGELOG.md'), CHANGELOG)
  mkdirSync(join(root, 'android'))
  writeFileSync(join(root, 'android', 'keystore.properties'), 'storeFile=k.jks\nstorePassword=secret-1\n')
  writeFileSync(join(root, 'android', 'k.jks'), '')
  mkdirSync(join(sdk, 'build-tools', '36.0.0'), { recursive: true })
  writeFileSync(join(sdk, 'build-tools', '36.0.0', 'apksigner.bat'), '')
  calls = []
  unexpected = []
  out = []
  err = []
})
afterEach(() => {
  expect(unexpected, 'commands the fake runner has no reply for').toEqual([])
  rmSync(root, { recursive: true, force: true })
  rmSync(sdk, { recursive: true, force: true })
  rmSync(pages, { recursive: true, force: true })
})

/** One stderr line, prefixed, matching `message`; nothing mutated; repo byte-identical. */
async function expectStopsCleanly(run: () => Promise<number>, message: RegExp) {
  const before = snapshot()
  expect(await run()).toBe(1)
  expect(err).toHaveLength(1)
  expect(err[0]).toMatch(/^release: /)
  expect(err[0]).not.toContain('\n')
  expect(err[0]).toMatch(message)
  expect(mutating()).toEqual([])
  expect(snapshot()).toEqual(before)
  expect(existsSync(join(root, 'release-out'))).toBe(false)
}

describe('preflight stops with one clear line and changes nothing (M32 Task 1 acceptance)', () => {
  it('on a dirty working tree', async () => {
    await expectStopsCleanly(
      () => release(['1.7.0'], { replies: { 'git status --porcelain': { stdout: ' M src/main/index.ts\n?? notes.txt\n' } } }),
      /working tree is not clean \(2 changed files, first: M src\/main\/index\.ts\)/
    )
    expect(npmCalls()).toEqual([])
    expect(calls.map((c) => c.line)).not.toContain('git fetch origin main')
  })

  it('when the tag already exists locally', async () => {
    await expectStopsCleanly(
      () => release(['1.7.0'], { replies: { 'git tag -l v1.7.0': { stdout: 'v1.7.0\n' } } }),
      /tag v1\.7\.0 already exists locally/
    )
    expect(npmCalls()).toEqual([])
  })

  it('when the tag already exists on origin', async () => {
    await expectStopsCleanly(
      () =>
        release(['1.7.0'], {
          replies: { 'git ls-remote --tags origin refs/tags/v1.7.0': { stdout: 'deadbeef\trefs/tags/v1.7.0\n' } }
        }),
      /tag v1\.7\.0 already exists on origin/
    )
    expect(npmCalls()).toEqual([])
  })

  it('when docs/CHANGELOG.md has no section for the version', async () => {
    await expectStopsCleanly(() => release(['minor']), /docs\/CHANGELOG\.md has no "## 1\.8\.0" section/)
    expect(npmCalls()).toEqual([])
  })

  it('when the CHANGELOG section has no bullet', async () => {
    writeFileSync(join(root, 'docs', 'CHANGELOG.md'), '# Changelog\n\n## 1.7.0 — unreleased\n\nTBD.\n\n## 1.6.0\n\n- x\n')
    await expectStopsCleanly(() => release(['1.7.0']), /"## 1\.7\.0 — unreleased" section .* has no "- " bullet/)
  })
})

describe('preflight: git', () => {
  it('refuses a branch other than main', async () => {
    await expectStopsCleanly(
      () => release(['1.7.0'], { replies: { 'git rev-parse --abbrev-ref HEAD': { stdout: 'm32-one-command-release\n' } } }),
      /on "m32-one-command-release" — run `git switch main`/
    )
  })

  it.each([
    ['0\t2', /2 commits behind origin\/main — run `git pull`/],
    ['1\t0', /1 commit ahead of origin\/main — push first/],
    ['3\t1', /diverged from origin\/main \(3 ahead, 1 behind\)/]
  ])('refuses HEAD != origin/main (left-right %j)', async (counts, message) => {
    await expectStopsCleanly(
      () =>
        release(['1.7.0'], {
          replies: {
            'git rev-parse origin/main': { stdout: 'fff999\n' },
            'git rev-list --left-right --count HEAD...origin/main': { stdout: `${counts}\n` }
          }
        }),
      message
    )
  })

  it('refuses when origin cannot be fetched', async () => {
    await expectStopsCleanly(
      () => release(['1.7.0'], { replies: { 'git fetch origin main': { status: 128, stderr: 'fatal: unable to access github.com\n' } } }),
      /could not fetch origin\/main \(fatal: unable to access github\.com\)/
    )
  })
})

describe('preflight: tools', () => {
  it('refuses when gh is not signed in', async () => {
    await expectStopsCleanly(() => release(['1.7.0'], { replies: { 'gh auth status': { status: 1 } } }), /gh auth login/)
  })

  it('refuses when gh is not installed', async () => {
    await expectStopsCleanly(
      () => release(['1.7.0'], { replies: { 'gh auth status': { status: null, error: new Error('gh not found on PATH') } } }),
      /could not run gh \(gh not found on PATH\) — install the GitHub CLI/
    )
  })

  it('refuses when a GitHub release for the version already exists', async () => {
    await expectStopsCleanly(
      () => release(['1.7.0'], { replies: { 'gh release view v1.7.0 --json tagName --repo julia-shtal/scriptorium-writer': { stdout: '{"tagName":"v1.7.0"}' } } }),
      /a GitHub release v1\.7\.0 already exists \(possibly a draft\)/
    )
    expect(npmCalls()).toEqual([])
  })

  it('refuses when GitHub cannot be asked about the release', async () => {
    await expectStopsCleanly(
      () =>
        release(['1.7.0'], {
          replies: { 'gh release view v1.7.0 --json tagName --repo julia-shtal/scriptorium-writer': { status: 1, stderr: 'error connecting to api.github.com\n' } }
        }),
      /could not check GitHub for a release v1\.7\.0 \(error connecting to api\.github\.com\)/
    )
  })

  it('refuses when the keystore file named by keystore.properties is missing', async () => {
    rmSync(join(root, 'android', 'k.jks'))
    await expectStopsCleanly(() => release(['1.7.0']), /the release keystore .*k\.jks \(from android\/keystore\.properties\) does not exist/)
    // The password sitting next to storeFile is never echoed.
    expect(err[0]).not.toContain('secret-1')
  })

  it('reads storeFile with .properties escapes, as Gradle does', async () => {
    const keys = mkdtempSync(join(tmpdir(), 'release-keys-'))
    try {
      writeFileSync(join(keys, 'release.jks'), '')
      // `C:\\keys\\release.jks` in the file means C:\keys\release.jks; a single backslash would not.
      const escaped = join(keys, 'release.jks').replace(/\\/g, '\\\\')
      writeFileSync(join(root, 'android', 'keystore.properties'), `# comment\nstoreFile = ${escaped}\nstorePassword=x\n`)
      expect(await release(['1.7.0'])).toBe(0)
      const state = JSON.parse(readFileSync(statePath(root, '1.7.0'), 'utf8'))
      expect(state.steps['preflight.tools'].keystoreFile).toBe(join(keys, 'release.jks'))
    } finally {
      rmSync(keys, { recursive: true, force: true })
    }
  })

  it('refuses keystore.properties without storeFile', async () => {
    writeFileSync(join(root, 'android', 'keystore.properties'), 'storePassword=secret-1\n')
    await expectStopsCleanly(() => release(['1.7.0']), /keystore\.properties has no storeFile/)
  })

  it('refuses when there is no signing key at all', async () => {
    rmSync(join(root, 'android', 'keystore.properties'))
    await expectStopsCleanly(() => release(['1.7.0']), /no release signing key/)
  })

  it('refuses a partial set of SCRIPTORIUM_* variables', async () => {
    rmSync(join(root, 'android', 'keystore.properties'))
    await expectStopsCleanly(
      () => release(['1.7.0'], { env: { SCRIPTORIUM_KEYSTORE_FILE: 'C:\\keys\\k.jks', SCRIPTORIUM_KEY_ALIAS: 'a' } }),
      /only partly set \(missing: SCRIPTORIUM_KEYSTORE_PASSWORD, SCRIPTORIUM_KEY_PASSWORD\)/
    )
  })

  const ENV_KEY = {
    SCRIPTORIUM_KEYSTORE_PASSWORD: 'pw-store',
    SCRIPTORIUM_KEY_ALIAS: 'a',
    SCRIPTORIUM_KEY_PASSWORD: 'pw-key'
  }

  it('accepts all four SCRIPTORIUM_* variables in place of keystore.properties', async () => {
    rmSync(join(root, 'android', 'keystore.properties'))
    writeFileSync(join(sdk, 'env.jks'), '')
    expect(await release(['1.7.0'], { env: { ...ENV_KEY, SCRIPTORIUM_KEYSTORE_FILE: join(sdk, 'env.jks') } })).toBe(0)
    const state = JSON.parse(readFileSync(statePath(root, '1.7.0'), 'utf8'))
    expect(state.steps['preflight.tools']).toMatchObject({ keystore: 'SCRIPTORIUM_* environment variables', keystoreFile: join(sdk, 'env.jks') })
    // The secrets are never copied into the state file or printed.
    expect(JSON.stringify(state)).not.toMatch(/pw-store|pw-key/)
    expect(out.join('\n')).not.toMatch(/pw-store|pw-key/)
  })

  it('refuses SCRIPTORIUM_KEYSTORE_FILE pointing at nothing, resolved against android/', async () => {
    rmSync(join(root, 'android', 'keystore.properties'))
    await expectStopsCleanly(
      () => release(['1.7.0'], { env: { ...ENV_KEY, SCRIPTORIUM_KEYSTORE_FILE: 'missing.jks' } }),
      /the release keystore .*android[\\/]missing\.jks \(from SCRIPTORIUM_\* environment variables\) does not exist/
    )
    expect(err[0]).not.toMatch(/pw-store|pw-key/)
  })

  it('refuses when apksigner is missing', async () => {
    rmSync(join(sdk, 'build-tools', '36.0.0', 'apksigner.bat'))
    await expectStopsCleanly(() => release(['1.7.0']), /no apksigner under .*build-tools — install Android SDK Build-Tools/)
  })
})

describe('preflight: the gh-pages worktree', () => {
  it('refuses when it does not exist', async () => {
    rmSync(pages, { recursive: true, force: true })
    await expectStopsCleanly(
      () => release(['1.7.0']),
      /^release: the gh-pages worktree .*release-pages-\w+ does not exist — create it with `git worktree add .*release-pages-\w+ gh-pages` \(or set SCRIPTORIUM_PAGES_DIR\), then run the release again\.$/
    )
    expect(npmCalls()).toEqual([])
  })

  it('refuses a directory on another branch, also in a dry run', async () => {
    await expectStopsCleanly(
      () => release(['1.7.0', '--dry-run'], { replies: { 'pages: git rev-parse --abbrev-ref HEAD': { stdout: 'main\n' } } }),
      /is on "main", not gh-pages — deploying there would publish the bundle on the wrong branch; `git -C .* switch gh-pages`, or point SCRIPTORIUM_PAGES_DIR at the gh-pages worktree \(`git worktree add .* gh-pages`\), then run the release again\./
    )
  })

  it('refuses a directory that is not the top of its worktree', async () => {
    await expectStopsCleanly(
      () => release(['1.7.0'], { replies: { 'pages: git rev-parse --show-toplevel': { stdout: 'C:/Users/julia/IdeaProjects/scriptorium-writer\n' } } }),
      /is not the top of a git worktree \(git says the worktree is C:\/Users\/julia\/IdeaProjects\/scriptorium-writer\) — `git rm -rf \.` there would empty the wrong tree; create the gh-pages worktree with `git worktree add .* gh-pages`/
    )
  })

  it('refuses a directory that is not in git at all', async () => {
    await expectStopsCleanly(
      () => release(['1.7.0'], { replies: { 'pages: git rev-parse --show-toplevel': { status: 128, stderr: 'fatal: not a git repository (or any of the parent directories): .git\n' } } }),
      /is not a git worktree \(fatal: not a git repository .*\) — create the gh-pages worktree with `git worktree add/
    )
  })

  it('records the worktree, and asks nothing about cleanliness', async () => {
    expect(await release(['1.7.0'])).toBe(0)
    expect(calls.filter((c) => c.line.startsWith('pages: ')).map((c) => c.line)).toEqual([
      'pages: git rev-parse --show-toplevel',
      'pages: git rev-parse --abbrev-ref HEAD'
    ])
    const state = JSON.parse(readFileSync(statePath(root, '1.7.0'), 'utf8'))
    expect(state.steps['preflight.tools'].pagesDir).toBe(pages)
  })
})

describe('preflight: test suites', () => {
  it('runs the gates in order, streamed, after every cheap check', async () => {
    expect(await release(['1.7.0'])).toBe(0)
    expect(npmCalls()).toEqual(['npm ci', 'npm run typecheck', 'npm run lint', 'npm test', 'npm run test:browser'])
    expect(calls.filter((c) => c.line.startsWith('npm ')).every((c) => !c.capture)).toBe(true)
    // The slow step comes last: every git/gh call happened before the first npm call.
    const firstNpm = calls.findIndex((c) => c.line.startsWith('npm '))
    expect(calls.slice(firstNpm).every((c) => c.line.startsWith('npm '))).toBe(true)
  })

  it('stops at the first failing gate', async () => {
    await expectStopsCleanly(
      () => release(['1.7.0'], { replies: { 'npm run lint': { status: 1 } } }),
      /`npm run lint` failed \(exit 1\) — fix it on main/
    )
    expect(npmCalls()).toEqual(['npm ci', 'npm run typecheck', 'npm run lint'])
  })
})

describe('a passing preflight', () => {
  it('writes state.json with every preflight step done and the dry-run flag', async () => {
    expect(await release(['1.7.0', '--dry-run'])).toBe(0)
    expect(err).toEqual([])
    expect(mutating()).toEqual([])
    const state = JSON.parse(readFileSync(statePath(root, '1.7.0'), 'utf8'))
    expect(state).toMatchObject({ schemaVersion: STATE_SCHEMA_VERSION, version: '1.7.0', dryRun: true })
    expect(Object.keys(state.steps)).toEqual([
      'preflight.git',
      'preflight.tag',
      'preflight.changelog',
      'preflight.tools',
      'preflight.checks'
    ])
    expect(state.steps['preflight.git']).toMatchObject({ done: true, head: 'abc123' })
    expect(out.join('\n')).toMatch(/DRY RUN/)
  })

  it('leaves package.json and the CHANGELOG untouched (bump comes after preflight)', async () => {
    const before = snapshot()
    expect(await release(['1.7.0'])).toBe(0)
    const after = snapshot()
    delete after[relative(root, statePath(root, '1.7.0'))]
    expect(after).toEqual(before)
  })
})

describe('state from an earlier run', () => {
  const seed = (dryRun: boolean, steps: Record<string, unknown>) =>
    writeState(statePath(root, '1.7.0'), {
      schemaVersion: STATE_SCHEMA_VERSION,
      version: '1.7.0',
      startedAt: '2026-11-08T00:00:00.000Z',
      dryRun,
      steps
    })

  it('refuses a fresh run over a real release that got past preflight, before touching git', async () => {
    seed(false, { 'preflight.git': { done: true }, bump: { done: true, sha: 'abc' } })
    const before = snapshot()
    expect(await release(['1.7.0'])).toBe(1)
    expect(err).toHaveLength(1)
    expect(err[0]).toMatch(/release of 1\.7\.0 is already in progress .* records bump\) — continue it with --resume or drop it with --abort/)
    expect(calls).toEqual([])
    expect(snapshot()).toEqual(before)
  })

  it('starts over from a dry-run state or a preflight-only state', async () => {
    seed(true, { bump: { done: true }, 'build.web': { done: true } })
    expect(await release(['1.7.0'])).toBe(0)
    seed(false, { 'preflight.git': { done: true } })
    expect(await release(['1.7.0'])).toBe(0)
    expect(JSON.parse(readFileSync(statePath(root, '1.7.0'), 'utf8')).dryRun).toBe(false)
  })
})

describe('the CLI surface', () => {
  it('prints usage for --help and exits 0 without running anything', async () => {
    expect(await release(['--help'])).toBe(0)
    expect(out.join('\n')).toMatch(/^Usage: npm run release -- <major\|minor\|patch\|X\.Y\.Z>/)
    expect(calls).toEqual([])
  })

  it.each([
    [['1.6.0'], /1\.6\.0 is lower than the current version 1\.7\.0/],
    [['v1.8.0'], /"v1\.8\.0" is not major, minor, patch or a strict X\.Y\.Z/],
    [['--resume'], /no interrupted release under release-out\/ — nothing to resume/],
    [['--abort'], /no interrupted release under release-out\/ — nothing to abort/]
  ])('stops %j before running anything', async (argv, message) => {
    await expectStopsCleanly(() => release(argv), message)
    expect(calls).toEqual([])
  })

  // `npm run release minor --dry-run` (no `--`): npm keeps the flag, sets npm_config_dry_run and
  // passes only ["minor"]. Running on would be a real release where a dry run was asked for.
  it.each([
    [['minor'], 'npm_config_dry_run', 'put flags after `--`: npm run release -- minor --dry-run'],
    [[], 'npm_config_resume', 'put flags after `--`: npm run release -- --resume'],
    [[], 'npm_config_abort', 'put flags after `--`: npm run release -- --abort']
  ])('stops %j when npm swallowed a flag (%s)', async (argv, variable, hint) => {
    await expectStopsCleanly(() => release(argv, { env: { [variable]: 'true' } }), new RegExp(hint.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&')))
    expect(calls).toEqual([])
  })

  it('does not object when the flag did reach the script, or npm has it set to false', async () => {
    expect(await release(['1.7.0', '--dry-run'], { env: { npm_config_dry_run: 'true' } })).toBe(0)
    expect(await release(['1.7.0'], { env: { npm_config_dry_run: 'false' } })).toBe(0)
    expect(err).toEqual([])
  })
})
