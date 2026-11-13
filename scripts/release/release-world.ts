/**
 * A whole release's outside world, stateful, for running main() end to end (not a test file
 * itself). Built on test-world.ts: the repo is makeRepo() plus a signing key, there is an Android
 * SDK with apksigner and a gh-pages worktree (temp dirs), and the fakes behave like the real
 * thing would:
 *   git:    commits have parents (`parents`), so `merge-base --is-ancestor` answers truthfully.
 *           HEAD moves on `git commit` and `git reset --hard`, origin/main on `git push origin
 *           main`; tags appear locally on `git tag -a` and on origin on `git push origin vX`.
 *   gh:     one release, created by `gh release create` (a draft, with the assets' real on-disk
 *           sizes and SHA-256 digests, state "uploaded"), extended by `gh release upload`, made
 *           public by `gh release edit`. Every `gh release` call must name `--repo`, or it is
 *           "unexpected". `uploads` records every asset name ever uploaded, so a duplicate shows.
 *   pages:  `git rm` empties the worktree, `git diff --cached --quiet` compares it with the last
 *           commit, `git push origin gh-pages` makes it what Pages serves; origin/gh-pages is
 *           `site.pushed`, and `site.parents` is the gh-pages history.
 *   fetch:  Pages serves the pushed version.json `net.pagesDelay` polls after the push; the
 *           release download URL serves latest.yml once the release is public.
 *   clock:  sleep() advances it, so a five-minute poll takes no time.
 * Every command is recorded on `runner`; anything the world does not know is "unexpected".
 * `failOn[line]` makes one command fail — or, as a function, runs first and may return null to
 * let the command go on (e.g. to cut an upload off halfway). gh lines are keyed WITHOUT the
 * trailing `--repo owner/name`.
 */
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PWA_URL, REPO_SLUG, dirDigest } from './artifacts.mjs'
import { type Fallback, type Reply, buildTools, fakeRunner, makeRepo, npmVersion } from './test-world'

export type FakeAsset = { size: number; state: string; digest?: string }
export type FakeRelease = { isDraft: boolean; assets: Map<string, FakeAsset> }

const REPO_FLAG = ` --repo ${REPO_SLUG}`

/** Is `a` an ancestor of (or equal to) `b`, in a history given as child -> parent? */
const ancestor = (parents: Record<string, string>, a: string, b: string) => {
  for (let c: string | undefined = b; c; c = parents[c]) if (c === a) return true
  return false
}

export function releaseWorld({ current = '1.7.0', target = '1.8.0' }: { current?: string; target?: string } = {}) {
  const root = makeRepo(current)
  writeFileSync(join(root, 'android', 'keystore.properties'), 'storeFile=k.jks\nstorePassword=secret-1\n')
  writeFileSync(join(root, 'android', 'k.jks'), '')
  const sdk = mkdtempSync(join(tmpdir(), 'release-sdk-'))
  mkdirSync(join(sdk, 'build-tools', '36.0.0'), { recursive: true })
  writeFileSync(join(sdk, 'build-tools', '36.0.0', 'apksigner.bat'), '')
  const pages = mkdtempSync(join(tmpdir(), 'release-pages-'))
  writeFileSync(join(pages, 'index.html'), 'previous deploy')
  writeFileSync(join(pages, 'version.json'), `${JSON.stringify({ version: current })}\n`)

  const tag = `v${target}`
  const git = {
    head: 'base0000000',
    originMain: 'base0000000',
    bumpSha: 'bump1111111',
    dirty: '',
    branch: 'main',
    parents: { bump1111111: 'base0000000' } as Record<string, string>,
    subjects: { base0000000: 'm31: docs' } as Record<string, string>,
    localTags: new Map<string, string>(),
    remoteTags: new Map<string, string>()
  }
  const gh: { release: FakeRelease | null; uploads: string[] } = { release: null, uploads: [] }
  const site = {
    branch: 'gh-pages',
    dirty: '',
    /** What `git rev-parse --show-toplevel` prints there (git's forward-slash form). */
    toplevel: pages.replace(/\\/g, '/'),
    committed: dirDigest(pages).sha256 as string,
    commits: 0,
    head: 'pages000000',
    pushed: 'pages000000',
    parents: {} as Record<string, string>,
    pushedAtPoll: -1,
    servedVersion: current
  }
  let polls = 0
  const failOn: Record<string, Reply | (() => Reply | null)> = {}

  const ok = (stdout = ''): Reply => ({ stdout })
  const nameOf = (rel: string) => rel.split('/').at(-1) as string
  const upload = (rels: string[]) => {
    for (const rel of rels) {
      const bytes = readFileSync(join(root, ...rel.split('/')))
      gh.release?.assets.set(nameOf(rel), { size: bytes.length, state: 'uploaded', digest: `sha256:${createHash('sha256').update(bytes).digest('hex')}` })
      gh.uploads.push(nameOf(rel))
    }
  }
  const createRe = new RegExp(`^gh release create ${tag} --draft --verify-tag --title ${target} --notes-file (\\S+) (.+)$`)
  const uploadRe = new RegExp(`^gh release upload ${tag} (.+) --clobber$`)
  const rev = (ref: string) => (ref === 'HEAD' ? git.head : ref === 'origin/main' ? git.originMain : ref)
  const siteRev = (ref: string) => (ref === 'HEAD' ? site.head : ref === 'origin/gh-pages' ? site.pushed : ref)

  const fallback: Fallback = ({ line: raw, cmd, args }) => {
    // Every gh release call must name the repository; the table is keyed without it.
    let line = raw
    if (raw.startsWith('gh release ')) {
      if (!raw.endsWith(REPO_FLAG)) return null
      line = raw.slice(0, -REPO_FLAG.length)
    }
    const fail = failOn[line]
    if (fail) {
      const r = typeof fail === 'function' ? fail() : fail
      if (r) return r
    }
    const tool = tools[line]
    if (tool) return (typeof tool === 'function' ? tool({ cmd, args, env: {} }) : tool) ?? {}
    let m: RegExpExecArray | null
    // ---- the repo
    if (line === 'git rev-parse --abbrev-ref HEAD') return ok(`${git.branch}\n`)
    if (line === 'git status --porcelain') return ok(git.dirty)
    if (line === 'git fetch origin main') return ok()
    if (line === 'git rev-parse HEAD' || line === 'git rev-parse main') return ok(`${git.head}\n`)
    if (line === 'git rev-parse origin/main') return ok(`${git.originMain}\n`)
    if (line === 'git log -1 --format=%s') return ok(`${git.subjects[git.head] ?? 'some work'}\n`)
    if ((m = /^git merge-base --is-ancestor (\S+) (\S+)$/.exec(line))) return { status: ancestor(git.parents, rev(m[1]), rev(m[2])) ? 0 : 1 }
    if ((m = /^git tag -l (\S+)$/.exec(line))) return ok(git.localTags.has(m[1]) ? `${m[1]}\n` : '')
    if ((m = /^git ls-remote --tags origin refs\/tags\/(\S+)$/.exec(line))) {
      const obj = git.remoteTags.get(m[1])
      return ok(obj ? `${obj}\trefs/tags/${m[1]}\n` : '')
    }
    if ((m = /^git rev-parse (\S+)\^\{commit\}$/.exec(line))) {
      return git.localTags.has(m[1]) ? ok(`${git.localTags.get(m[1])}\n`) : { status: 128, stderr: 'fatal: bad revision\n' }
    }
    if ((m = /^git rev-parse refs\/tags\/(\S+)$/.exec(line))) return ok(`tagobj-${m[1]}\n`)
    if (line === 'git add package.json package-lock.json docs/CHANGELOG.md') return ok()
    if (line === `git commit -m release: ${tag}`) {
      git.parents[git.bumpSha] = git.head
      git.subjects[git.bumpSha] = `release: ${tag}`
      git.head = git.bumpSha
      return ok()
    }
    if (line === 'git push origin main') {
      if (!ancestor(git.parents, git.originMain, git.head)) return { status: 1, stderr: ' ! [rejected] main -> main (non-fast-forward)\n' }
      git.originMain = git.head
      return ok()
    }
    if ((m = /^git tag -a (\S+) -m (\S+) (\S+)$/.exec(line)) && m[1] === m[2]) {
      git.localTags.set(m[1], m[3])
      return ok()
    }
    if ((m = /^git push origin (v\S+)$/.exec(line))) {
      if (!git.localTags.has(m[1])) return { status: 1, stderr: `error: src refspec ${m[1]} does not match any\n` }
      git.remoteTags.set(m[1], `tagobj-${m[1]}`)
      return ok()
    }
    if ((m = /^git reset --hard (\S+)$/.exec(line))) {
      git.head = m[1]
      return ok()
    }
    // ---- npm gates and gh
    if (/^npm (ci|run typecheck|run lint|test|run test:browser)$/.test(line)) return ok()
    if (line === 'gh auth status') return ok('Logged in to github.com account julia-shtal')
    if (line === `gh release view ${tag} --json tagName`) {
      return gh.release ? ok(`{"tagName":"${tag}"}`) : { status: 1, stderr: 'release not found\n' }
    }
    if (line === `gh release view ${tag} --json assets,isDraft`) {
      if (!gh.release) return { status: 1, stderr: 'release not found\n' }
      const assets = [...gh.release.assets].map(([name, a]) => ({ name, ...a }))
      return ok(JSON.stringify({ assets, isDraft: gh.release.isDraft }))
    }
    if ((m = createRe.exec(line))) {
      if (!git.remoteTags.has(tag)) return { status: 1, stderr: `tag ${tag} doesn't exist in the repo\n` }
      gh.release = { isDraft: true, assets: new Map() }
      upload(m[2].split(' '))
      return ok('https://github.com/julia-shtal/scriptorium-writer/releases/tag/untagged-1\n')
    }
    if ((m = uploadRe.exec(line))) {
      if (!gh.release) return { status: 1, stderr: 'release not found\n' }
      upload(m[1].split(' '))
      return ok()
    }
    if (line === `gh release edit ${tag} --draft=false --latest`) {
      if (!gh.release) return { status: 1, stderr: 'release not found\n' }
      gh.release.isDraft = false
      return ok()
    }
    // ---- the gh-pages worktree
    if (line === 'pages: git rev-parse --show-toplevel') return ok(`${site.toplevel}\n`)
    if (line === 'pages: git rev-parse --abbrev-ref HEAD') return ok(`${site.branch}\n`)
    if (line === 'pages: git status --porcelain') return ok(site.dirty)
    if (line === 'pages: git fetch origin gh-pages') return ok()
    if (line === 'pages: git rev-parse HEAD') return ok(`${site.head}\n`)
    if (line === 'pages: git rev-parse origin/gh-pages') return ok(`${site.pushed}\n`)
    if ((m = /^pages: git merge-base --is-ancestor (\S+) (\S+)$/.exec(line))) {
      return { status: ancestor(site.parents, siteRev(m[1]), siteRev(m[2])) ? 0 : 1 }
    }
    if (line === 'pages: git rm -rf . --quiet --ignore-unmatch') {
      for (const name of readdirSync(pages)) rmSync(join(pages, name), { recursive: true, force: true })
      return ok()
    }
    if (line === 'pages: git -c core.autocrlf=false add -A') return ok()
    if (line === 'pages: git diff --cached --quiet') return { status: dirDigest(pages).sha256 === site.committed ? 0 : 1 }
    if (line === `pages: git -c core.autocrlf=false commit -m deploy ${tag}`) {
      site.committed = dirDigest(pages).sha256
      site.commits++
      const next = `pages${String(site.commits).padStart(6, '0')}`
      site.parents[next] = site.head
      site.head = next
      site.dirty = ''
      return ok()
    }
    if (line === 'pages: git push origin gh-pages') {
      if (!ancestor(site.parents, site.pushed, site.head)) return { status: 1, stderr: ' ! [rejected] gh-pages -> gh-pages (non-fast-forward)\n' }
      if (site.pushed !== site.head) {
        site.pushed = site.head
        site.pushedAtPoll = polls
        site.servedVersion = JSON.parse(readFileSync(join(pages, 'version.json'), 'utf8')).version
      }
      return ok()
    }
    return null
  }

  // The build tools are answered in the fallback rather than from the runner's table, so failOn
  // reaches them too.
  const tools = { ...npmVersion(root, target), ...buildTools(root) }
  const runner = fakeRunner({}, { dirs: { [pages]: 'pages' }, fallback })

  let clock = new Date('2026-11-09T12:00:00.000Z').getTime()
  const net = { pagesDelay: 2 }
  const fetched: string[] = []
  const fetchInits: Array<RequestInit | undefined> = []
  const fetch = async (url: string, init?: RequestInit) => {
    fetched.push(url)
    fetchInits.push(init)
    if (url.startsWith(`${PWA_URL}version.json?`)) {
      polls++
      const live = site.pushedAtPoll >= 0 && polls - site.pushedAtPoll > net.pagesDelay
      return new Response(`${JSON.stringify({ version: live ? site.servedVersion : current })}\n`, { status: 200 })
    }
    if (url.startsWith(`https://github.com/julia-shtal/scriptorium-writer/releases/download/${tag}/latest.yml?`)) {
      if (!gh.release || gh.release.isDraft) return new Response('Not Found', { status: 404 })
      return new Response(readFileSync(join(root, 'release-out', target, 'latest.yml'), 'utf8'), { status: 200 })
    }
    throw new Error(`fake fetch: unexpected URL ${url}`)
  }

  const out: string[] = []
  const err: string[] = []
  const deps = (steps?: unknown[]) => ({
    root,
    run: runner.run,
    env: { ANDROID_HOME: sdk, SCRIPTORIUM_PAGES_DIR: pages },
    platform: 'win32',
    now: () => new Date(clock),
    sleep: async (ms: number) => void (clock += ms),
    fetch,
    out: (l: string) => out.push(l),
    err: (l: string) => err.push(l),
    ...(steps ? { steps } : {})
  })
  const stateOf = (version = target) => {
    const file = join(root, 'release-out', version, 'state.json')
    return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null
  }
  const cleanup = () => {
    for (const dir of [root, sdk, pages]) rmSync(dir, { recursive: true, force: true })
  }
  /** The asset as GitHub would describe a finished upload of release-out/<target>/<name>. */
  const uploadedAsset = (name: string): FakeAsset => {
    const bytes = readFileSync(join(root, 'release-out', target, name))
    return { size: bytes.length, state: 'uploaded', digest: `sha256:${createHash('sha256').update(bytes).digest('hex')}` }
  }
  return { root, sdk, pages, tag, target, git, gh, site, net, failOn, runner, fetched, fetchInits, out, err, deps, stateOf, cleanup, uploadedAsset, clock: () => clock }
}
