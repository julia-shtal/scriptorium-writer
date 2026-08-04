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
    const withHarness = async (body: (h: FsPortContractHarness) => Promise<void>): Promise<void> => {
      const harness = await setup()
      try {
        await body(harness)
      } finally {
        if (cleanup) await cleanup(harness)
      }
    }

    it('reports ENOENT for a missing file read', async () => {
      await withHarness(async ({ fs, dir }) => {
        await expect(fs.readFile(joinPath(dir, 'nope.txt'))).rejects.toMatchObject({
          code: 'ENOENT'
        })
      })
    })

    it('writes then reads a file back verbatim', async () => {
      await withHarness(async ({ fs, dir }) => {
        const path = joinPath(dir, 'hello.txt')
        await fs.writeFile(path, 'привет / hello')
        expect(await fs.readFile(path)).toBe('привет / hello')
      })
    })

    it('writes and reads raw bytes verbatim', async () => {
      await withHarness(async ({ fs, dir }) => {
        const path = joinPath(dir, 'blob.bin')
        const bytes = new Uint8Array([0x00, 0xff, 0x50, 0x4b])
        await fs.writeFile(path, bytes)
        const back = await fs.readFileBytes(path)
        expect(Array.from(back)).toEqual(Array.from(bytes))
      })
    })

    it('creates nested directories with recursive mkdir', async () => {
      await withHarness(async ({ fs, dir }) => {
        const nested = joinPath(dir, 'a', 'b', 'c')
        await fs.mkdir(nested, { recursive: true })
        const s = await fs.stat(nested)
        expect(s.isDirectory).toBe(true)
      })
    })

    it('renames over an existing target', async () => {
      await withHarness(async ({ fs, dir }) => {
        const from = joinPath(dir, 'from.txt')
        const to = joinPath(dir, 'to.txt')
        await fs.writeFile(from, 'new')
        await fs.writeFile(to, 'old')
        await fs.rename(from, to)
        expect(await fs.readFile(to)).toBe('new')
        await expect(fs.readFile(from)).rejects.toMatchObject({ code: 'ENOENT' })
      })
    })

    it('lists directory entry names', async () => {
      await withHarness(async ({ fs, dir }) => {
        await fs.writeFile(joinPath(dir, 'one.txt'), '1')
        await fs.writeFile(joinPath(dir, 'two.txt'), '2')
        const names = await fs.readdir(dir)
        expect([...names].sort()).toEqual(['one.txt', 'two.txt'])
      })
    })

    it('reports ENOENT for readdir of a missing directory', async () => {
      await withHarness(async ({ fs, dir }) => {
        await expect(fs.readdir(joinPath(dir, 'ghost'))).rejects.toMatchObject({
          code: 'ENOENT'
        })
      })
    })

    it('rm with force does not throw on a missing path', async () => {
      await withHarness(async ({ fs, dir }) => {
        await expect(fs.rm(joinPath(dir, 'absent'), { force: true })).resolves.toBeUndefined()
      })
    })

    it('rm removes an existing file', async () => {
      await withHarness(async ({ fs, dir }) => {
        const path = joinPath(dir, 'doomed.txt')
        await fs.writeFile(path, 'x')
        await fs.rm(path)
        await expect(fs.readFile(path)).rejects.toMatchObject({ code: 'ENOENT' })
      })
    })

    it('stat reports directory vs file and a size', async () => {
      await withHarness(async ({ fs, dir }) => {
        const filePath = joinPath(dir, 'sized.txt')
        await fs.writeFile(filePath, 'abc')
        const fileStat = await fs.stat(filePath)
        expect(fileStat.isDirectory).toBe(false)
        expect(fileStat.size).toBe(3)
        const dirStat = await fs.stat(dir)
        expect(dirStat.isDirectory).toBe(true)
      })
    })
  })
}
