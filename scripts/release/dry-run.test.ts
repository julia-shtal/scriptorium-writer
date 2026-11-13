/**
 * `npm run release -- minor --dry-run` end to end through the fake world: stages 1–3 run for
 * real (preflight, the bump in the working tree, every build into release-out/X.Y.Z/), and then
 * nothing is committed, pushed, tagged, uploaded or deployed — the publish stage is only printed.
 * Afterwards package.json, package-lock.json and docs/CHANGELOG.md are byte for byte what they
 * were, so the next real release does not trip over a dirty tree.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { publishAssets } from './artifacts.mjs'
import { BUMP_FILES } from './bump.mjs'
import { main } from './pipeline.mjs'
import { releaseWorld } from './release-world'

let w: ReturnType<typeof releaseWorld>
beforeEach(() => {
  w = releaseWorld()
})
afterEach(() => {
  expect(w.runner.unexpected, 'commands the fake world has no answer for').toEqual([])
  w.cleanup()
})

const bumpFiles = () => (BUMP_FILES as string[]).map((f) => readFileSync(join(w.root, ...f.split('/'))))

describe('a full --dry-run', () => {
  it('builds everything into release-out/X.Y.Z/, publishes nothing and restores the bumped files', async () => {
    const before = bumpFiles()
    expect(await main(['minor', '--dry-run'], w.deps())).toBe(0)
    expect(w.err).toEqual([])

    const out = join(w.root, 'release-out', '1.8.0')
    for (const name of [...(publishAssets('1.8.0') as string[]), 'release-notes.md', 'state.json']) {
      expect(existsSync(join(out, name)), name).toBe(true)
    }
    expect(readdirSync(join(out, 'web')).sort()).toEqual(['assets', 'index.html', 'version.json'])
    // The builds saw the bumped version...
    expect(JSON.parse(readFileSync(join(out, 'web', 'version.json'), 'utf8')).version).toBe('1.8.0')
    expect(readFileSync(join(out, 'Scriptorium-Writer-1.8.0.apk'), 'utf8')).toBe('APK 1.8.0')
    // ...and the working tree is back to what it was.
    expect(bumpFiles()).toEqual(before)

    const lines = w.runner.lines()
    expect(lines.filter((l) => /^(git (commit|push|tag -a|add|reset)|gh release (create|upload|edit|delete)|pages: git (?!rev-parse ))/.test(l))).toEqual([])
    expect(lines).toContain('npm version 1.8.0 --no-git-tag-version')
    expect(w.gh.release).toBeNull()
    expect(w.git.head).toBe('base0000000')

    const state = w.stateOf()
    expect(state.dryRun).toBe(true)
    expect(Object.keys(state.steps).filter((id) => id.startsWith('publish.'))).toEqual([])
    expect(state.steps['build.sums'].done).toBe(true)

    const printed = w.out.join('\n')
    expect(printed).toMatch(/DRY RUN complete: release-out\/1\.8\.0\/ holds .*release-notes\.md and web\//)
    expect(printed).toMatch(/nothing was committed, tagged or published/)
    expect(printed).toMatch(/Stage 4 \(publish\) would run, in this order:/)
    expect(printed).toContain('gh release edit v1.8.0 --draft=false --latest --repo julia-shtal/scriptorium-writer')
  })

  it('restores the bumped files when a build fails halfway', async () => {
    const before = bumpFiles()
    w.failOn['android\\gradlew.bat -p android :app:assembleRelease'] = { status: 1 }
    expect(await main(['minor', '--dry-run'], w.deps())).toBe(1)
    expect(w.err[0]).toMatch(/`android\\gradlew\.bat -p android :app:assembleRelease` failed \(exit 1\) — fix the Android build/)
    expect(bumpFiles()).toEqual(before)
  })
})
