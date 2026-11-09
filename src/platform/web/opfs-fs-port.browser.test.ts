/**
 * OpfsFsPort contract + concurrency tests (MP4 Task 2). Runs in REAL Chromium via
 * Vitest browser mode (`npm run test:browser`), because there is no faithful
 * Node/OPFS shim.
 *
 * The shared {@link runFsPortContract} suite is the behavioural spec. Each run gets
 * a UNIQUE scratch dir under the OPFS root (OPFS persists within a browser session,
 * so a fixed name would collide across runs); `cleanup` removes it recursively.
 *
 * The extra concurrent-write test proves the worker's per-path serialization: many
 * simultaneous writes to ONE file must not throw `NoModificationAllowedError` and
 * must leave the file readable with one of the written values (never a partial mix).
 */
import { afterEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import { runFsPortContract } from '@data/fs-port.contract'
import { FileService } from '@data/file-service'
import { AppError } from '@shared/errors'
import { OpfsFsPort } from './opfs-fs-port'

/** Best-effort removal of an OPFS scratch dir; a missing dir is fine. */
async function removeScratch(dir: string): Promise<void> {
  try {
    const root = await navigator.storage.getDirectory()
    await root.removeEntry(dir.replace(/^\//, ''), { recursive: true })
  } catch {
    // Best-effort cleanup.
  }
}

runFsPortContract(
  'OpfsFsPort',
  async () => {
    const fs = new OpfsFsPort()
    const dir = `/optest-${crypto.randomUUID()}`
    await fs.mkdir(dir, { recursive: true })
    return { fs, dir }
  },
  async ({ dir }) => {
    await removeScratch(dir)
  }
)

describe('OpfsFsPort concurrent writes to one path', () => {
  it('serializes ~20 concurrent writes without corruption', async () => {
    const fs = new OpfsFsPort()
    const dir = `/optest-conc-${crypto.randomUUID()}`
    await fs.mkdir(dir, { recursive: true })
    const path = `${dir}/contended.txt`

    const values = Array.from({ length: 20 }, (_, i) => `value-${i}-${'x'.repeat(i)}`)

    // None of these must reject (especially not NoModificationAllowedError).
    await expect(Promise.all(values.map((v) => fs.writeFile(path, v)))).resolves.toBeDefined()

    // The file must be readable and hold exactly ONE of the written values — no
    // partial mixture (which would prove overlapping sync access handles / a
    // truncate-then-partial-write race).
    const back = await fs.readFile(path)
    expect(values).toContain(back)

    await removeScratch(dir)
  })
})

describe('OpfsFsPort worker-failure resilience', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('rejects (does not hang) when a write reply never arrives', async () => {
    vi.useFakeTimers()
    const fs = new OpfsFsPort()
    // Intercept the worker so the write is posted but no reply is ever sent — this
    // simulates a stuck/dead worker whose reply is lost. Only the timeout can
    // settle this promise; without the fix it would hang forever.
    const realGetWorker = (
      fs as unknown as { getWorker: () => Worker }
    ).getWorker.bind(fs)
    const worker = realGetWorker()
    const postSpy = vi.spyOn(worker, 'postMessage').mockImplementation(() => {})
    ;(fs as unknown as { getWorker: () => Worker }).getWorker = () => worker

    const write = fs.writeFile('/optest-hang/file.txt', 'data')
    const assertion = expect(write).rejects.toBeInstanceOf(AppError)

    await vi.advanceTimersByTimeAsync(30_000)
    await assertion
    expect(postSpy).toHaveBeenCalledOnce()
  })
})

describe('OpfsFsPort directory rename fallback (M31)', () => {
  /**
   * Run `body` with `FileSystemDirectoryHandle.prototype.move` disabled so the port is
   * forced onto its copy-then-remove fallback. Only the DIRECTORY handle's `move` is
   * shadowed — `FileSystemFileHandle.move` (used by atomic writes) stays intact.
   */
  async function withoutDirectoryMove(
    body: (fs: OpfsFsPort, copySpy: MockInstance) => Promise<void>
  ): Promise<void> {
    const proto = FileSystemDirectoryHandle.prototype
    const original = Object.getOwnPropertyDescriptor(proto, 'move')
    Object.defineProperty(proto, 'move', { value: undefined, configurable: true, writable: true })
    try {
      const fs = new OpfsFsPort()
      const copySpy = vi.spyOn(
        fs as unknown as { copyTree: (a: string, b: string) => Promise<void> },
        'copyTree'
      )
      await body(fs, copySpy)
    } finally {
      if (original) Object.defineProperty(proto, 'move', original)
      else delete (proto as { move?: unknown }).move
    }
  }

  it('copies then removes when FileSystemDirectoryHandle.move is unavailable', async () => {
    const dir = `/optest-mvfb-${crypto.randomUUID()}`
    try {
      await withoutDirectoryMove(async (fs, copySpy) => {
        await fs.mkdir(`${dir}/a/sub`, { recursive: true })
        await fs.mkdir(`${dir}/a/empty`, { recursive: true })
        await fs.writeFile(`${dir}/a/sub/x.txt`, 'X')
        await fs.writeFile(`${dir}/a/top2.txt`, 'T2')
        await fs.rename(`${dir}/a`, `${dir}/b`)
        expect(copySpy).toHaveBeenCalled() // proves the fallback, not native move, ran
        expect(await fs.readFile(`${dir}/b/sub/x.txt`)).toBe('X')
        expect(await fs.readFile(`${dir}/b/top2.txt`)).toBe('T2')
        expect((await fs.stat(`${dir}/b/empty`)).isDirectory).toBe(true)
        await expect(fs.stat(`${dir}/a`)).rejects.toMatchObject({ code: 'ENOENT' })
      })
    } finally {
      await removeScratch(dir)
    }
  })

  it('refuses an existing target (EEXIST) and leaves source and target intact', async () => {
    const dir = `/optest-mvex-${crypto.randomUUID()}`
    try {
      await withoutDirectoryMove(async (fs, copySpy) => {
        await fs.mkdir(`${dir}/a`, { recursive: true })
        await fs.mkdir(`${dir}/b`, { recursive: true })
        await fs.writeFile(`${dir}/a/x.txt`, 'SRC')
        await fs.writeFile(`${dir}/b/y.txt`, 'DST')
        await expect(fs.rename(`${dir}/a`, `${dir}/b`)).rejects.toMatchObject({ code: 'EEXIST' })
        expect(copySpy).not.toHaveBeenCalled()
        expect(await fs.readFile(`${dir}/a/x.txt`)).toBe('SRC')
        expect(await fs.readFile(`${dir}/b/y.txt`)).toBe('DST')
        await expect(fs.stat(`${dir}/b/x.txt`)).rejects.toMatchObject({ code: 'ENOENT' })
      })
    } finally {
      await removeScratch(dir)
    }
  })

  it('same-path rename is a no-op and into-itself is EINVAL', async () => {
    const dir = `/optest-mvself-${crypto.randomUUID()}`
    try {
      await withoutDirectoryMove(async (fs) => {
        await fs.mkdir(`${dir}/a/sub`, { recursive: true })
        await fs.writeFile(`${dir}/a/x.txt`, 'X')
        await fs.rename(`${dir}/a`, `${dir}/a`)
        expect(await fs.readFile(`${dir}/a/x.txt`)).toBe('X')
        await expect(fs.rename(`${dir}/a`, `${dir}/a/sub/in`)).rejects.toMatchObject({
          code: 'EINVAL'
        })
        expect(await fs.readFile(`${dir}/a/x.txt`)).toBe('X')
      })
    } finally {
      await removeScratch(dir)
    }
  })
})

describe('FileService.deleteStory on OPFS (M31 Task 1)', () => {
  it('moves the story folder to .trash', async () => {
    const base = `/optest-del-${crypto.randomUUID()}`
    const fs = new OpfsFsPort()
    try {
      const svc = new FileService({
        fs,
        userDataPath: `${base}/userdata`,
        defaultLibraryPath: `${base}/library`
      })
      await svc.ensureLibrary()
      const story = await svc.createStory({ title: 'Doomed' })
      await svc.deleteStory(story.id)
      expect(await svc.listStories()).toEqual([])
      const trash = await fs.readdir(`${base}/library/.trash`)
      expect(trash.some((n) => n.startsWith('doomed-'))).toBe(true)
    } finally {
      await removeScratch(base)
    }
  })
})
