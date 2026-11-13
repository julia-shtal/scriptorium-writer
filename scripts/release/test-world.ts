/**
 * A fake world for the bump/build/dry-run tests (not a test file itself): a temp directory
 * standing in for the repo, and a fake runner that answers commands from a table of replies or
 * handlers and records every call. Handlers for the build commands create the files the real
 * tools would (dist-web/, the APK, the installer + latest.yml), so the steps under test read
 * real files. A command with no entry is recorded as unexpected and throws.
 * Nothing here spawns a process.
 */
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export type Reply = { status?: number | null; stdout?: string; stderr?: string; error?: Error | null }
export type Handler = Reply | ((call: { cmd: string; args: string[]; env: Record<string, string | undefined> }) => Reply | void)
export type Call = { line: string; capture: boolean; env: Record<string, string | undefined> }

export const FINGERPRINT = 'c129d7e7951e7a589eec0ccb87753c6598ec35210be5dfa8acd45dd06968f16b'

export const CHANGELOG = [
  '# Changelog',
  '',
  '## 1.8.0 — unreleased',
  '',
  '- Next things.',
  '',
  '## 1.7.0 — unreleased',
  '',
  '- Import a library.',
  '- Fixed: deleting a story in the web app.',
  '',
  '## 1.6.0 — 2026-09-05',
  '',
  '- Web and Android.',
  ''
].join('\n')

export const GRADLEW = 'android\\gradlew.bat -p android :app:assembleRelease'
export const VERIFY_APK = 'node scripts/verify-apk.mjs android/app/build/outputs/apk/release/app-release.apk'

/** A temp repo: package.json + lock at `version`, the CHANGELOG, the signing fingerprint. */
export function makeRepo(version = '1.7.0'): string {
  const root = mkdtempSync(join(tmpdir(), 'release-world-'))
  writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'x', version }, null, 2) + '\n')
  writeFileSync(
    join(root, 'package-lock.json'),
    JSON.stringify({ name: 'x', version, lockfileVersion: 3, packages: { '': { name: 'x', version } } }, null, 2) + '\n'
  )
  mkdirSync(join(root, 'docs'))
  writeFileSync(join(root, 'docs', 'CHANGELOG.md'), CHANGELOG)
  mkdirSync(join(root, 'android'))
  writeFileSync(join(root, 'android', 'release-fingerprint.txt'), `${FINGERPRINT}\n`)
  return root
}

export const pkgVersion = (root: string): string => JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version

const write = (file: string, data: string | Buffer) => {
  mkdirSync(join(file, '..'), { recursive: true })
  writeFileSync(file, data)
}

/** What `npm version X --no-git-tag-version` does to package.json and package-lock.json. */
export function npmVersion(root: string, version: string): Record<string, Handler> {
  return {
    [`npm version ${version} --no-git-tag-version`]: () => {
      for (const name of ['package.json', 'package-lock.json']) {
        const file = join(root, name)
        const json = JSON.parse(readFileSync(file, 'utf8'))
        json.version = version
        if (json.packages?.['']) json.packages[''].version = version
        writeFileSync(file, JSON.stringify(json, null, 2) + '\n')
      }
    }
  }
}

/** The installer bytes the fake electron-builder writes for `version`. */
export const exeBytes = (version: string) => Buffer.from(`MZ fake installer ${version} `.repeat(50))

export function latestYml(version: string, bytes: Buffer, name = `Scriptorium-Writer-Setup-${version}.exe`): string {
  const sha512 = createHash('sha512').update(bytes).digest('base64')
  return [
    `version: ${version}`,
    'files:',
    `  - url: ${name}`,
    `    sha512: ${sha512}`,
    `    size: ${bytes.length}`,
    `path: ${name}`,
    `sha512: ${sha512}`,
    "releaseDate: '2026-11-09T12:00:00.000Z'",
    ''
  ].join('\n')
}

/**
 * The build tools, as handlers that write their outputs. Versions are read from package.json at
 * call time, so a build that ran before the bump would visibly carry the old version.
 */
export function buildTools(root: string): Record<string, Handler> {
  return {
    'npm run build:web': () => {
      const v = pkgVersion(root)
      write(join(root, 'dist-web', 'index.html'), '<!doctype html>')
      write(join(root, 'dist-web', 'assets', 'index-abc.js'), 'console.log(1)')
      write(join(root, 'dist-web', 'version.json'), `${JSON.stringify({ version: v })}\n`)
    },
    'node scripts/verify-web-build.mjs': {},
    'npx cap sync android': {},
    [GRADLEW]: () => write(join(root, 'android', 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk'), `APK ${pkgVersion(root)}`),
    [VERIFY_APK]: {},
    'npm run build': {},
    'npx electron-builder --win --publish never': () => {
      const v = pkgVersion(root)
      const bytes = exeBytes(v)
      // release/ keeps every installer ever built; the step must pick exactly this version's.
      write(join(root, 'release', 'Scriptorium Writer Setup 1.5.0.exe'), 'old')
      write(join(root, 'release', 'Scriptorium-Writer-Setup-1.6.0.exe'), 'old')
      write(join(root, 'release', `Scriptorium-Writer-Setup-${v}.exe`), bytes)
      write(join(root, 'release', `Scriptorium-Writer-Setup-${v}.exe.blockmap`), `blockmap ${v}`)
      write(join(root, 'release', 'latest.yml'), latestYml(v, bytes))
    }
  }
}

/** A catch-all after the table: returns a Reply for a command it handles, null for "unexpected". */
export type Fallback = (call: { line: string; cmd: string; args: string[]; cwd?: string }) => Reply | null

/**
 * The fake runner. `dirs` maps a working directory to a label: a command run there is keyed and
 * recorded as "<label>: <line>" (e.g. "pages: git status --porcelain"), so the same git command
 * in the repo and in the gh-pages worktree can neither be confused nor answered by one entry.
 */
export function fakeRunner(table: Record<string, Handler>, { dirs = {}, fallback }: { dirs?: Record<string, string>; fallback?: Fallback } = {}) {
  const calls: Call[] = []
  const unexpected: string[] = []
  const run = (cmd: string, args: string[] = [], opts: { capture?: boolean; env?: Record<string, string | undefined>; cwd?: string } = {}) => {
    const label = opts.cwd ? dirs[opts.cwd] : undefined
    const line = `${label ? `${label}: ` : ''}${[cmd, ...args].join(' ')}`
    const env = opts.env ?? {}
    calls.push({ line, capture: opts.capture !== false, env })
    const entry = table[line]
    const r = entry ? ((typeof entry === 'function' ? entry({ cmd, args, env }) : entry) ?? {}) : (fallback?.({ line, cmd, args, cwd: opts.cwd }) ?? null)
    if (!r) {
      unexpected.push(line)
      throw new Error(`fake runner: unexpected command "${line}"`)
    }
    return { status: r.status === undefined ? 0 : r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '', error: r.error ?? null }
  }
  return { run, calls, unexpected, lines: () => calls.map((c) => c.line) }
}
