/**
 * release-out/X.Y.Z/state.json is what --resume trusts to skip finished steps, so it is written
 * the way the app writes user data: temp file, fsync, rename — and read back strictly.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ReleaseError } from './errors.mjs'
import { isDone, markDone, newState, readState, statePath, writeState } from './state.mjs'

let root: string
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'release-state-'))
})
afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

const AT = new Date('2026-11-09T10:00:00.000Z')

describe('state.json', () => {
  it('lives in release-out/X.Y.Z/', () => {
    expect(statePath(root, '1.7.0')).toBe(join(root, 'release-out', '1.7.0', 'state.json'))
  })

  it('round-trips through an atomic write, creating the directory', () => {
    const file = statePath(root, '1.7.0')
    const state = markDone(newState({ version: '1.7.0', dryRun: true, now: AT }), 'preflight.git', { head: 'abc' }, AT)
    writeState(file, state)

    expect(readState(file)).toEqual({
      schemaVersion: 1,
      version: '1.7.0',
      startedAt: '2026-11-09T10:00:00.000Z',
      dryRun: true,
      steps: { 'preflight.git': { head: 'abc', done: true, at: '2026-11-09T10:00:00.000Z' } }
    })
    // Nothing but the target is left behind: no temp file survives a successful write.
    expect(readdirSync(join(root, 'release-out', '1.7.0'))).toEqual(['state.json'])
  })

  it('replaces an existing file whole', () => {
    const file = statePath(root, '1.7.0')
    writeState(file, newState({ version: '1.7.0', dryRun: false, now: AT }))
    const next = markDone(newState({ version: '1.7.0', dryRun: false, now: AT }), 'bump', { sha: 'def' }, AT)
    writeState(file, next)
    expect(isDone(readState(file), 'bump')).toBe(true)
    expect(readFileSync(file, 'utf8').endsWith('}\n')).toBe(true)
  })

  it('retries a rename blocked by a transient Windows lock', () => {
    const file = statePath(root, '1.7.0')
    let failures = 2
    const rename = (from: string, to: string) => {
      if (failures-- > 0) throw Object.assign(new Error('EPERM: operation not permitted'), { code: 'EPERM' })
      renameSync(from, to)
    }
    writeState(file, newState({ version: '1.7.0', dryRun: false, now: AT }), { platform: 'win32', rename })
    expect(readState(file)?.version).toBe('1.7.0')
    expect(readdirSync(join(root, 'release-out', '1.7.0'))).toEqual(['state.json'])
  })

  it('gives up on a lock that does not clear, leaving no temp file and the old state intact', () => {
    const file = statePath(root, '1.7.0')
    writeState(file, newState({ version: '1.7.0', dryRun: true, now: AT }))
    let attempts = 0
    const rename = () => {
      attempts++
      throw Object.assign(new Error('EBUSY: resource busy or locked'), { code: 'EBUSY' })
    }
    expect(() => writeState(file, newState({ version: '1.7.0', dryRun: false, now: AT }), { platform: 'win32', rename })).toThrow(/EBUSY/)
    expect(attempts).toBe(6)
    expect(readState(file)?.dryRun).toBe(true)
    expect(readdirSync(join(root, 'release-out', '1.7.0'))).toEqual(['state.json'])
  })

  it('does not retry off Windows', () => {
    let attempts = 0
    const rename = () => {
      attempts++
      throw Object.assign(new Error('EPERM'), { code: 'EPERM' })
    }
    expect(() => writeState(statePath(root, '1.7.0'), newState({ version: '1.7.0', dryRun: false }), { platform: 'linux', rename })).toThrow()
    expect(attempts).toBe(1)
  })

  it('reads a missing file as null', () => {
    expect(readState(statePath(root, '9.9.9'))).toBeNull()
  })

  it('refuses a corrupt file instead of starting over', () => {
    const file = statePath(root, '1.7.0')
    mkdirSync(join(root, 'release-out', '1.7.0'), { recursive: true })
    writeFileSync(file, '{"schemaVersion": 1, "version": "1.7')
    expect(() => readState(file)).toThrow(ReleaseError)
    expect(() => readState(file)).toThrow(/not valid JSON/)
  })

  it('refuses another schema version', () => {
    const file = statePath(root, '1.7.0')
    mkdirSync(join(root, 'release-out', '1.7.0'), { recursive: true })
    writeFileSync(file, JSON.stringify({ schemaVersion: 2, version: '1.7.0', steps: {} }))
    expect(() => readState(file)).toThrow(/not a schemaVersion 1 release state/)
  })

  it('isDone is false for unknown steps and for no state at all', () => {
    expect(isDone(newState({ version: '1.7.0', dryRun: false }), 'bump')).toBe(false)
    expect(isDone(null, 'bump')).toBe(false)
  })
})
