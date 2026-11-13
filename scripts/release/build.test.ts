/**
 * Stage 3 (build.mjs and the pure checks in artifacts.mjs). The check that matters most is
 * latest.yml against the installer: electron-updater downloads `path` by name from the release
 * and compares the SHA-512, so a name off by one character — or a space GitHub turns into a dot —
 * is a failed update on every installed Windows client. Then SHA256SUMS.txt's exact format
 * (`sha256sum -c` must read it as is), and two build runs through the fake world: a bad
 * latest.yml stops the release before anything is published, and a resumed build restores a
 * changed dist-web/ from the frozen copy instead of rebuilding it.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { absolutizeLinks, latestYmlProblems, parseLatestYml, releaseNotesText, sha256SumsText } from './artifacts.mjs'
import { ReleaseError } from './errors.mjs'
import { STEPS, main } from './pipeline.mjs'
import { releaseWorld } from './release-world'
import { exeBytes, latestYml } from './test-world'

const EXE = 'Scriptorium-Writer-Setup-1.8.0.exe'
const bytes = exeBytes('1.8.0')
const exe = { name: EXE, size: bytes.length, sha512: createHash('sha512').update(bytes).digest('base64') }

describe('latest.yml against the installer', () => {
  it('passes when it describes exactly this installer', () => {
    expect(latestYmlProblems(latestYml('1.8.0', bytes), { version: '1.8.0', exe })).toEqual([])
  })

  it('reads quoted values and CRLF line endings', () => {
    const doc = parseLatestYml(latestYml('1.8.0', bytes).replace(/\n/g, '\r\n').replace(`path: ${EXE}`, `path: '${EXE}'`))
    expect(doc.path).toBe(EXE)
    expect(doc.files[0]).toMatchObject({ url: EXE, size: String(bytes.length) })
  })

  it('names a path that points at another file', () => {
    const text = latestYml('1.8.0', bytes, 'Scriptorium-Writer-Setup-1.7.0.exe')
    expect(latestYmlProblems(text, { version: '1.8.0', exe })).toEqual([
      `path is "Scriptorium-Writer-Setup-1.7.0.exe", expected "${EXE}"`,
      `files[0].url is "Scriptorium-Writer-Setup-1.7.0.exe", expected "${EXE}"`
    ])
  })

  it('names a space in the file name (GitHub would serve it under a dot)', () => {
    const text = latestYml('1.8.0', bytes, 'Scriptorium Writer Setup 1.8.0.exe')
    expect(latestYmlProblems(text, { version: '1.8.0', exe })).toEqual([
      'path "Scriptorium Writer Setup 1.8.0.exe" contains a space',
      'files[0].url "Scriptorium Writer Setup 1.8.0.exe" contains a space'
    ])
  })

  it('names a SHA-512, size or version that does not match', () => {
    const other = latestYml('1.7.0', Buffer.from('another build'), EXE)
    expect(latestYmlProblems(other, { version: '1.8.0', exe })).toEqual([
      'version is "1.7.0", expected "1.8.0"',
      "sha512 does not match the installer's SHA-512",
      "files[0].sha512 does not match the installer's SHA-512",
      `files[0].size is 13, the installer is ${bytes.length} bytes`
    ])
  })

  it('names missing fields instead of guessing', () => {
    expect(latestYmlProblems('version: 1.8.0\n', { version: '1.8.0', exe })).toEqual([
      'path is missing',
      'files[0].url is missing',
      'sha512 is missing',
      'files[0].sha512 is missing',
      'files[0].size is missing'
    ])
  })
})

describe('release notes: relative links point at the tagged docs', () => {
  const BLOB = 'https://github.com/julia-shtal/scriptorium-writer/blob/v1.7.0'
  const RAW = 'https://github.com/julia-shtal/scriptorium-writer/raw/v1.7.0'

  it('points images at the raw file so they render, and leaves a linked image\'s outer target relative', () => {
    expect(absolutizeLinks('![Import dialog](img/import.png "Import")', '1.7.0')).toBe(`![Import dialog](${RAW}/docs/img/import.png "Import")`)
    expect(absolutizeLinks('[![shot](img/a.png)](page.md)', '1.7.0')).toBe(`[![shot](${RAW}/docs/img/a.png)](page.md)`)
    expect(absolutizeLinks('[a [nested] text](x.md)', '1.7.0')).toBe('[a [nested] text](x.md)')
  })

  it('never takes a footnote or a prose line starting with "[x]:" for a reference definition', () => {
    for (const line of ['[^1]: See the docs here.', '  [RU]: Исправлено удаление истории в веб-версии.', '[note]: see below']) {
      expect(absolutizeLinks(line, '1.7.0')).toBe(line)
    }
    // A real definition with each title form, or none, is still rewritten.
    expect(absolutizeLinks(['[a]: x.md', "[b]: y.md 'Y'", '[c]: <z z.md> (Z)'].join('\n'), '1.7.0')).toBe(
      [`[a]: ${BLOB}/docs/x.md`, `[b]: ${BLOB}/docs/y.md 'Y'`, `[c]: <${BLOB}/docs/z z.md> (Z)`].join('\n')
    )
  })

  it('skips code spans of any backtick count, including ones with backticks inside', () => {
    const text = '``x ` [c](d.md) `` then [e](f.md) and `[g](h.md)` and ```[i](j.md)```'
    expect(absolutizeLinks(text, '1.7.0')).toBe(`\`\`x \` [c](d.md) \`\` then [e](${BLOB}/docs/f.md) and \`[g](h.md)\` and \`\`\`[i](j.md)\`\`\``)
    // An unmatched backtick is not a code span.
    expect(absolutizeLinks('a ` b [k](l.md)', '1.7.0')).toBe(`a \` b [k](${BLOB}/docs/l.md)`)
  })

  it('resolves a relative link against docs/ on the tag and keeps the fragment', () => {
    expect(absolutizeLinks('- See [architecture.md](architecture.md#library-import).', '1.7.0')).toBe(
      `- See [architecture.md](${BLOB}/docs/architecture.md#library-import).`
    )
    expect(absolutizeLinks('[r](../README.md) [a](./android.md "Android") ![shot](img/a.png)', '1.7.0')).toBe(
      `[r](${BLOB}/README.md) [a](${BLOB}/docs/android.md "Android") ![shot](${RAW}/docs/img/a.png)`
    )
    expect(absolutizeLinks('[s](<some file.md>)', '1.7.0')).toBe(`[s](<${BLOB}/docs/some file.md>)`)
  })

  it('points a pure #anchor at docs/CHANGELOG.md on the tag', () => {
    expect(absolutizeLinks('[earlier](#160--2026-09-05)', '1.7.0')).toBe(`[earlier](${BLOB}/docs/CHANGELOG.md#160--2026-09-05)`)
  })

  it('leaves absolute, root-relative, mailto and out-of-repo targets alone', () => {
    const text = '[a](https://example.com/x.md) [b](/docs/x.md) [c](mailto:a@b.c) [d](../../elsewhere.md) [e](http://x)'
    expect(absolutizeLinks(text, '1.7.0')).toBe(text)
  })

  it('rewrites reference definitions, and never touches code', () => {
    const text = ['See [the docs][d].', '', '[d]: architecture.md "Architecture"', '', 'Write `[x](y.md)` for a link.', '```md', '[x](y.md)', '```'].join('\n')
    expect(absolutizeLinks(text, '1.7.0')).toBe(
      ['See [the docs][d].', '', `[d]: ${BLOB}/docs/architecture.md "Architecture"`, '', 'Write `[x](y.md)` for a link.', '```md', '[x](y.md)', '```'].join('\n')
    )
  })

  it('is applied by releaseNotesText', () => {
    const text = releaseNotesText({ notes: '- See [architecture.md](architecture.md#library-import).', version: '1.7.0', fingerprint: 'ab'.repeat(32) })
    expect(text.startsWith(`- See [architecture.md](${BLOB}/docs/architecture.md#library-import).\n`)).toBe(true)
    // The footer's own absolute link is untouched.
    expect(text).toContain('**Web app (PWA):** https://julia-shtal.github.io/scriptorium-writer/')
  })
})

describe('SHA256SUMS.txt', () => {
  it('is sha256sum format: lowercase hex, two spaces, LF, trailing newline', () => {
    const text = sha256SumsText([
      { name: EXE, sha256: 'AB'.repeat(32) },
      { name: 'Scriptorium-Writer-1.8.0.apk', sha256: 'cd'.repeat(32) }
    ])
    expect(text).toBe(`${'ab'.repeat(32)}  ${EXE}\n${'cd'.repeat(32)}  Scriptorium-Writer-1.8.0.apk\n`)
  })

  it('refuses a name that is not plain ASCII', () => {
    expect(() => sha256SumsText([{ name: 'Скрипторий.apk', sha256: 'ab'.repeat(32) }])).toThrow(ReleaseError)
  })
})

describe('the build steps through the fake world', () => {
  let w: ReturnType<typeof releaseWorld>
  beforeEach(() => {
    w = releaseWorld()
  })
  afterEach(() => {
    expect(w.runner.unexpected).toEqual([])
    w.cleanup()
  })
  const upTo = (id: string) => STEPS.slice(0, STEPS.findIndex((s: { id: string }) => s.id === id) + 1)

  it('writes SHA256SUMS.txt for the installer and the APK, matching the files', async () => {
    expect(await main(['minor'], w.deps(upTo('build.sums')))).toBe(0)
    const out = join(w.root, 'release-out', '1.8.0')
    const sha = (name: string) => createHash('sha256').update(readFileSync(join(out, name))).digest('hex')
    const apk = 'Scriptorium-Writer-1.8.0.apk'
    expect(readFileSync(join(out, 'SHA256SUMS.txt'), 'utf8')).toBe(`${sha(EXE)}  ${EXE}\n${sha(apk)}  ${apk}\n`)
  })

  it('writes release-notes.md with the CHANGELOG links pointing at the docs on the new tag', async () => {
    const changelog = join(w.root, 'docs', 'CHANGELOG.md')
    writeFileSync(changelog, readFileSync(changelog, 'utf8').replace('- Next things.', '- Next things. See [architecture.md](architecture.md#library-import).'))
    expect(await main(['minor'], w.deps(upTo('build.sums')))).toBe(0)
    const notes = readFileSync(join(w.root, 'release-out', '1.8.0', 'release-notes.md'), 'utf8')
    expect(notes).toContain('See [architecture.md](https://github.com/julia-shtal/scriptorium-writer/blob/v1.8.0/docs/architecture.md#library-import).')
    // The CHANGELOG itself keeps its relative link.
    expect(readFileSync(changelog, 'utf8')).toContain('(architecture.md#library-import)')
  })

  it('stops at build.windows when electron-builder writes a latest.yml with a space in the name', async () => {
    w.failOn['npx electron-builder --win --publish never'] = () => {
      const dir = join(w.root, 'release')
      mkdirSync(dir, { recursive: true })
      writeFileSync(join(dir, EXE), bytes)
      writeFileSync(join(dir, `${EXE}.blockmap`), 'blockmap')
      writeFileSync(join(dir, 'latest.yml'), latestYml('1.8.0', bytes, 'Scriptorium Writer Setup 1.8.0.exe'))
      return {}
    }
    expect(await main(['minor'], w.deps())).toBe(1)
    expect(w.err).toHaveLength(1)
    expect(w.err[0]).toMatch(/release\/latest\.yml does not describe Scriptorium-Writer-Setup-1\.8\.0\.exe: path "Scriptorium Writer Setup 1\.8\.0\.exe" contains a space/)
    expect(w.stateOf().steps['build.windows']).toBeUndefined()
    expect(w.runner.lines().filter((l) => /^(git push|gh release (create|upload|edit))/.test(l))).toEqual([])
  })

  it('on resume, restores a changed dist-web/ from the frozen bundle instead of rebuilding it', async () => {
    expect(await main(['minor'], w.deps(upTo('build.web')))).toBe(0)
    writeFileSync(join(w.root, 'dist-web', 'index.html'), 'a stray rebuild')
    const start = w.runner.calls.length
    expect(await main(['--resume'], w.deps(upTo('build.android')))).toBe(0)
    expect(w.runner.lines().slice(start)).not.toContain('npm run build:web')
    expect(w.out.join('\n')).toMatch(/dist-web\/ differs from the frozen bundle — restoring it from the frozen copy \(not rebuilding\)/)
    expect(readFileSync(join(w.root, 'dist-web', 'index.html'), 'utf8')).toBe('<!doctype html>')
  })
})
