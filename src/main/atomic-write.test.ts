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
})
