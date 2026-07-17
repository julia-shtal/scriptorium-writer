import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fsp from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { atomicWriteFile } from './atomic-write'

let dir: string

beforeEach(async () => {
  dir = await fsp.mkdtemp(join(tmpdir(), 'scriptorium-writer-atomic-'))
})

afterEach(async () => {
  await fsp.rm(dir, { recursive: true, force: true })
})

const listTemps = async (): Promise<string[]> =>
  (await fsp.readdir(dir)).filter((name) => name.endsWith('.tmp'))

describe('atomicWriteFile', () => {
  it('writes the target file', async () => {
    const target = join(dir, 'data.json')
    await atomicWriteFile(target, '{"ok":true}')
    expect(await fsp.readFile(target, 'utf8')).toBe('{"ok":true}')
  })

  it('leaves the original file intact if interrupted before the rename', async () => {
    const target = join(dir, 'data.json')
    await atomicWriteFile(target, 'GOOD')

    // Simulate a crash at the rename step: the tmp file was written and fsynced,
    // but the atomic swap never happens.
    const boom = async (): Promise<void> => {
      throw new Error('simulated crash before rename')
    }
    await expect(
      atomicWriteFile(target, 'BAD', { rename: boom })
    ).rejects.toThrow('simulated crash before rename')

    // The original good data must survive untouched...
    expect(await fsp.readFile(target, 'utf8')).toBe('GOOD')
    // ...and no half-written temp file may be left behind.
    expect(await listTemps()).toEqual([])
  })

  it('does not leave temp files behind on success', async () => {
    const target = join(dir, 'data.json')
    await atomicWriteFile(target, 'a')
    await atomicWriteFile(target, 'b')
    expect(await fsp.readFile(target, 'utf8')).toBe('b')
    expect(await listTemps()).toEqual([])
  })

  // Windows-lock resilience (Defender real-time scan / Search indexer / OneDrive
  // transiently lock a just-written file, making `rename` fail with EPERM/EACCES/EBUSY).
  const codeError = (code: string): NodeJS.ErrnoException => {
    const err = new Error(`simulated ${code}`) as NodeJS.ErrnoException
    err.code = code
    return err
  }

  it('retries a transient EPERM rename and then succeeds', async () => {
    const target = join(dir, 'data.json')
    let attempts = 0
    const flaky = async (from: string, to: string): Promise<void> => {
      attempts += 1
      if (attempts < 3) throw codeError('EPERM')
      await fsp.rename(from, to)
    }
    await atomicWriteFile(target, 'RESILIENT', { rename: flaky, sleep: () => Promise.resolve() })
    expect(attempts).toBe(3)
    expect(await fsp.readFile(target, 'utf8')).toBe('RESILIENT')
    expect(await listTemps()).toEqual([])
  })

  it('gives up after exhausting retries on a persistent transient error, cleaning the temp', async () => {
    const target = join(dir, 'data.json')
    let attempts = 0
    const alwaysBusy = async (): Promise<void> => {
      attempts += 1
      throw codeError('EBUSY')
    }
    await expect(
      atomicWriteFile(target, 'x', { rename: alwaysBusy, sleep: () => Promise.resolve() })
    ).rejects.toMatchObject({ code: 'EBUSY' })
    expect(attempts).toBeGreaterThan(1) // it retried, not one-and-done
    expect(await listTemps()).toEqual([])
  })

  it('does not retry a non-transient error (e.g. ENOSPC) — fails fast', async () => {
    const target = join(dir, 'data.json')
    let attempts = 0
    const noSpace = async (): Promise<void> => {
      attempts += 1
      throw codeError('ENOSPC')
    }
    await expect(
      atomicWriteFile(target, 'x', { rename: noSpace, sleep: () => Promise.resolve() })
    ).rejects.toMatchObject({ code: 'ENOSPC' })
    expect(attempts).toBe(1)
    expect(await listTemps()).toEqual([])
  })
})
