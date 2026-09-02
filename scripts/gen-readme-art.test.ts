/**
 * `assets/readme/` is generator output, committed to the repo because GitHub renders the
 * README straight from the tree and cannot run a build step. That makes the eleven files
 * there a second copy of what `scripts/gen-readme-art.mjs` says, and nothing but this file
 * connects the two: hand-editing an SVG (to nudge a colour, to fix a viewBox) leaves the
 * generator behind, and the next `npm run gen:art` silently reverts the edit.
 *
 * So the duplication is asserted rather than trusted. The generator is run once into a
 * temp directory — that is what the `<outDir>` argv override exists for — and the result
 * is compared byte for byte against what is committed. A red test here means one of two
 * things, and the message says which: the art was edited by hand (re-do it in the
 * generator), or the generator was changed and the output not regenerated (`npm run
 * gen:art`).
 *
 * These are static-file assertions, not behaviour tests. The two size/shape checks at the
 * bottom are the exception: a byte-diff proves the files agree but explains nothing, and
 * those two properties are the ones a future edit could plausibly and invisibly break.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const ROOT = resolve(__dirname, '..')
const GENERATOR = resolve(ROOT, 'scripts/gen-readme-art.mjs')
const COMMITTED = resolve(ROOT, 'assets/readme')

let tmp: string

beforeAll(() => {
  // Generate ONCE for the whole suite: the generator writes eleven files including a
  // 1280x640 PNG, and re-running it per test would be pure waste.
  tmp = mkdtempSync(join(tmpdir(), 'readme-art-'))
  execFileSync(process.execPath, [GENERATOR, tmp], { stdio: 'pipe' })
})

afterAll(() => {
  rmSync(tmp, { recursive: true, force: true })
})

const sorted = (dir: string): string[] => readdirSync(dir).sort()

/**
 * Compare one produced file to its committed counterpart, byte for byte.
 *
 * Throws with the filename and the fix rather than letting `expect` print two multi-kilobyte
 * buffers: the useful half of this failure is *which* file and *what to run*, and a diff of
 * a packed `<path>` string tells a reader nothing.
 */
function expectIdentical(name: string): void {
  const produced = readFileSync(join(tmp, name))
  const committed = readFileSync(join(COMMITTED, name))
  if (!produced.equals(committed)) {
    throw new Error(`${name} in assets/readme/ differs from generator output — run \`npm run gen:art\``)
  }
}

describe('the committed README art is what the generator produces', () => {
  it('produces exactly the set of files committed in assets/readme/', () => {
    // Set equality, not "every produced file exists": this way a new output the generator
    // gained but nobody committed, and a stale committed file it no longer writes, both
    // fail here rather than going unnoticed until GitHub renders a broken image.
    expect(sorted(tmp)).toEqual(sorted(COMMITTED))
  })

  it('produces every committed file byte-identically', () => {
    for (const name of sorted(COMMITTED)) {
      expectIdentical(name)
    }
  })

  it('keeps banner-light.svg small enough to be an inline README image', () => {
    // Catches a regression in the emitter: `paths()` packs the pixel grid into one <path>
    // per colour. Going back to one <rect> per run — the obvious, naive shape — roughly
    // triples this to ~17 KB for the same picture, in a file GitHub serves on every page
    // view. 8000 is comfortably above the ~5.4 KB it is today and far below that.
    expect(readFileSync(join(COMMITTED, 'banner-light.svg')).byteLength).toBeLessThan(8000)
  })

  it('declares 1280x640 in the social preview PNG header', () => {
    // GitHub accepts a social preview at exactly this size and rescales or rejects
    // anything else, so the dimensions are a contract with a third party rather than a
    // taste call. Read straight from the IHDR (width at byte 16, height at byte 20)
    // instead of trusting the generator's own constants.
    const png = readFileSync(join(COMMITTED, 'social-preview.png'))
    expect(png.readUInt32BE(16)).toBe(1280)
    expect(png.readUInt32BE(20)).toBe(640)
  })
})
