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
import { afterEach, describe, expect, it, vi } from 'vitest'
import { runFsPortContract } from '@data/fs-port.contract'
import { AppError } from '@shared/errors'
import { OpfsFsPort } from './opfs-fs-port'

runFsPortContract(
  'OpfsFsPort',
  async () => {
    const fs = new OpfsFsPort()
    const dir = `/optest-${crypto.randomUUID()}`
    await fs.mkdir(dir, { recursive: true })
    return { fs, dir }
  },
  async ({ dir }) => {
    const root = await navigator.storage.getDirectory()
    const name = dir.replace(/^\//, '')
    try {
      await root.removeEntry(name, { recursive: true })
    } catch {
      // Best-effort cleanup; a missing dir (e.g. an rm test removed it) is fine.
    }
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

    const root = await navigator.storage.getDirectory()
    await root.removeEntry(dir.replace(/^\//, ''), { recursive: true })
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
