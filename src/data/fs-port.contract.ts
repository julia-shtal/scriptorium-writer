/**
 * Reusable {@link FsPort} contract suite (MP2).
 *
 * Every platform adapter (NodeFsPort now; OPFS/Capacitor in MP4/MC2) must satisfy
 * the same behavioural contract the data layer relies on. Rather than re-test each
 * impl by hand, this suite is parameterised over an `FsPort` factory plus a
 * per-run scratch directory, so a platform's own test file just wires its factory
 * and runs it.
 *
 * It is a `.ts` (not `.test.ts`) so Vitest's `src/** /*.test.ts` glob does not pick
 * it up directly — it only runs via a platform test that imports and invokes it.
 *
 * The cases themselves (`FS_PORT_CONTRACT_CASES`) are runner-agnostic: they are
 * plain data driven through the small `FsPortAssert` interface, not `it(...)`
 * blocks tied to vitest. This lets a non-vitest runner (the MC2 on-device harness,
 * needed because vitest cannot run inside an Android WebView) execute the exact
 * same cases against `CapacitorFsPort`. `runFsPortContract` below remains the
 * vitest-backed wrapper the existing platform test files use.
 */
import { describe, it, expect } from 'vitest'
import type { FsPort } from './fs-port'
import { joinPath } from './path-utils'

export interface FsPortContractHarness {
  /** A fresh port instance. */
  fs: FsPort
  /** An empty scratch directory the suite may freely populate. */
  dir: string
}

/**
 * The assertion surface a contract case may use. Deliberately tiny: every case below is
 * expressible with these five, and a small surface is what lets a non-vitest runner (the
 * MC2 on-device harness) implement it faithfully. `deepEqual` is structural — it must NOT
 * be implemented as `===`, or the array cases silently stop asserting anything.
 */
export interface FsPortAssert {
  equal(actual: unknown, expected: unknown, label: string): void
  deepEqual(actual: unknown, expected: unknown, label: string): void
  isTrue(actual: boolean, label: string): void
  rejectsWithCode(fn: () => Promise<unknown>, code: string, label: string): Promise<void>
  resolvesUndefined(fn: () => Promise<unknown>, label: string): Promise<void>
}

export interface FsPortCase {
  /** Verbatim the old `it(...)` title. Never rename: MC2 asserts these across runners. */
  name: string
  run(h: FsPortContractHarness, t: FsPortAssert): Promise<void>
}

export const FS_PORT_CONTRACT_CASES: FsPortCase[] = [
  {
    name: 'reports ENOENT for a missing file read',
    run: async ({ fs, dir }, t) => {
      await t.rejectsWithCode(() => fs.readFile(joinPath(dir, 'nope.txt')), 'ENOENT', 'readFile')
    }
  },
  {
    name: 'writes then reads a file back verbatim',
    run: async ({ fs, dir }, t) => {
      const path = joinPath(dir, 'hello.txt')
      await fs.writeFile(path, 'привет / hello')
      t.equal(await fs.readFile(path), 'привет / hello', 'round-trip text')
    }
  },
  {
    name: 'writes and reads raw bytes verbatim',
    run: async ({ fs, dir }, t) => {
      const path = joinPath(dir, 'blob.bin')
      const bytes = new Uint8Array([0x00, 0xff, 0x50, 0x4b])
      await fs.writeFile(path, bytes)
      const back = await fs.readFileBytes(path)
      t.deepEqual(Array.from(back), Array.from(bytes), 'round-trip bytes')
    }
  },
  {
    name: 'creates nested directories with recursive mkdir',
    run: async ({ fs, dir }, t) => {
      const nested = joinPath(dir, 'a', 'b', 'c')
      await fs.mkdir(nested, { recursive: true })
      const s = await fs.stat(nested)
      t.isTrue(s.isDirectory, 'nested dir isDirectory')
    }
  },
  {
    name: 'renames over an existing target',
    run: async ({ fs, dir }, t) => {
      const from = joinPath(dir, 'from.txt')
      const to = joinPath(dir, 'to.txt')
      await fs.writeFile(from, 'new')
      await fs.writeFile(to, 'old')
      await fs.rename(from, to)
      t.equal(await fs.readFile(to), 'new', 'target has new content')
      await t.rejectsWithCode(() => fs.readFile(from), 'ENOENT', 'source gone')
    }
  },
  {
    name: 'lists directory entry names',
    run: async ({ fs, dir }, t) => {
      await fs.writeFile(joinPath(dir, 'one.txt'), '1')
      await fs.writeFile(joinPath(dir, 'two.txt'), '2')
      const names = await fs.readdir(dir)
      t.deepEqual([...names].sort(), ['one.txt', 'two.txt'], 'entry names')
    }
  },
  {
    name: 'reports ENOENT for readdir of a missing directory',
    run: async ({ fs, dir }, t) => {
      await t.rejectsWithCode(() => fs.readdir(joinPath(dir, 'ghost')), 'ENOENT', 'readdir')
    }
  },
  {
    name: 'rm with force does not throw on a missing path',
    run: async ({ fs, dir }, t) => {
      await t.resolvesUndefined(() => fs.rm(joinPath(dir, 'absent'), { force: true }), 'rm force')
    }
  },
  {
    name: 'rm removes an existing file',
    run: async ({ fs, dir }, t) => {
      const path = joinPath(dir, 'doomed.txt')
      await fs.writeFile(path, 'x')
      await fs.rm(path)
      await t.rejectsWithCode(() => fs.readFile(path), 'ENOENT', 'removed file')
    }
  },
  {
    name: 'stat reports directory vs file and a size',
    run: async ({ fs, dir }, t) => {
      const filePath = joinPath(dir, 'sized.txt')
      await fs.writeFile(filePath, 'abc')
      const fileStat = await fs.stat(filePath)
      t.equal(fileStat.isDirectory, false, 'file isDirectory')
      t.equal(fileStat.size, 3, 'file size')
      const dirStat = await fs.stat(dir)
      t.isTrue(dirStat.isDirectory, 'dir isDirectory')
    }
  }
]

/**
 * Vitest-backed {@link FsPortAssert}. Maps 1:1 onto the matchers the cases used before.
 *
 * Every arm below ignores `label`, which makes it look like dead weight from the refactor.
 * It is not — do not remove it. Vitest supplies its own failure context (the `it` title plus
 * the matcher diff), so the label is redundant HERE. The on-device harness (MC2) has neither:
 * `label` is the only thing telling you WHICH assertion in a case failed on the tablet.
 */
const vitestAssert: FsPortAssert = {
  equal: (actual, expected) => expect(actual).toBe(expected),
  deepEqual: (actual, expected) => expect(actual).toEqual(expected),
  isTrue: (actual) => expect(actual).toBe(true),
  rejectsWithCode: async (fn, code) => {
    await expect(fn()).rejects.toMatchObject({ code })
  },
  resolvesUndefined: async (fn) => {
    await expect(fn()).resolves.toBeUndefined()
  }
}

/**
 * Run the FsPort contract against a platform implementation.
 *
 * @param name    Suite label (e.g. "NodeFsPort").
 * @param setup   Async factory returning a port + a fresh scratch dir per test.
 * @param cleanup Optional teardown for the scratch dir.
 */
export function runFsPortContract(
  name: string,
  setup: () => Promise<FsPortContractHarness>,
  cleanup?: (harness: FsPortContractHarness) => Promise<void>
): void {
  describe(`FsPort contract: ${name}`, () => {
    for (const testCase of FS_PORT_CONTRACT_CASES) {
      it(testCase.name, async () => {
        const harness = await setup()
        try {
          await testCase.run(harness, vitestAssert)
        } finally {
          if (cleanup) await cleanup(harness)
        }
      })
    }
  })
}
