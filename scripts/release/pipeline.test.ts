/**
 * The orchestrator itself, with made-up steps: what it records, what it keeps, and the cleanup
 * hooks. The real preflight steps are exercised end to end in preflight.test.ts.
 *
 * Two contracts later tasks lean on:
 *  - A preflight step re-run on --resume keeps its FIRST recorded data. --abort needs the
 *    pre-release HEAD, and by the time of a resume HEAD is the bump commit.
 *  - ctx.onFinally hooks run whether the steps after preflight succeed or throw. The dry-run
 *    bump (Task 2) puts package.json, package-lock.json and the CHANGELOG back through one.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ReleaseError } from './errors.mjs'
import { STEPS, STEP_IDS, runRelease } from './pipeline.mjs'
import { markDone, newState, statePath } from './state.mjs'

type Ctx = Record<string, unknown> & { onFinally: (fn: () => void | Promise<void>) => void; state: { steps: Record<string, unknown> } }
type Step = { id: string; stage: string; title: string; run: (ctx: Ctx) => unknown }

let root: string
let log: string[]
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'release-pipeline-'))
  log = []
})
afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

const AT = new Date('2026-11-09T12:00:00.000Z')
const makeCtx = (state = newState({ version: '1.7.0', dryRun: true, now: AT })) =>
  ({ root, version: '1.7.0', dryRun: true, log: (l: string) => log.push(l), now: () => AT, stateFile: statePath(root, '1.7.0'), state }) as unknown as Ctx

const step = (id: string, stage: string, run: Step['run']): Step => ({ id, stage, title: id, run })
const saved = () => JSON.parse(readFileSync(statePath(root, '1.7.0'), 'utf8'))

describe('step list', () => {
  it('uses only ids from STEP_IDS, in that order', () => {
    const ids = STEPS.map((s: Step) => s.id)
    expect(ids.every((id: string) => STEP_IDS.includes(id))).toBe(true)
    expect([...ids].sort((a: string, b: string) => STEP_IDS.indexOf(a) - STEP_IDS.indexOf(b))).toEqual(ids)
  })
})

describe('runRelease', () => {
  it('re-runs a done preflight step but keeps its first recorded data', async () => {
    const state = markDone(newState({ version: '1.7.0', dryRun: false, now: AT }), 'preflight.git', { head: 'pre-release' }, AT)
    let ran = 0
    await runRelease(makeCtx(state), [
      step('preflight.git', 'preflight', () => {
        ran++
        return { head: 'bump-commit' }
      })
    ])
    expect(ran).toBe(1)
    expect(saved().steps['preflight.git']).toMatchObject({ head: 'pre-release' })
  })

  it('skips a done non-preflight step and records new ones', async () => {
    const state = markDone(newState({ version: '1.7.0', dryRun: false, now: AT }), 'bump', { parent: 'p', sha: 's' }, AT)
    const ran: string[] = []
    await runRelease(makeCtx(state), [
      step('bump', 'bump', () => void ran.push('bump')),
      step('build.web', 'build', () => {
        ran.push('build.web')
        return { files: 3 }
      })
    ])
    expect(ran).toEqual(['build.web'])
    expect(saved().steps).toMatchObject({ bump: { parent: 'p', sha: 's' }, 'build.web': { done: true, files: 3 } })
  })

  it('runs onFinally hooks in reverse order when a later step throws, and rethrows the step error', async () => {
    const order: string[] = []
    const run = runRelease(makeCtx(), [
      step('preflight.git', 'preflight', () => ({})),
      step('bump', 'bump', (ctx) => {
        ctx.onFinally(() => void order.push('restore files'))
        ctx.onFinally(async () => void order.push('second hook'))
      }),
      step('build.web', 'build', () => {
        throw new ReleaseError('npm run build:web failed')
      })
    ])
    await expect(run).rejects.toThrow('npm run build:web failed')
    expect(order).toEqual(['second hook', 'restore files'])
    // The step that threw is not recorded; the one before it is.
    expect(saved().steps.bump.done).toBe(true)
    expect(saved().steps['build.web']).toBeUndefined()
  })

  it('runs onFinally hooks after a successful run too', async () => {
    let restored = false
    await runRelease(makeCtx(), [step('bump', 'bump', (ctx) => ctx.onFinally(() => void (restored = true)))])
    expect(restored).toBe(true)
  })

  it('runs every hook even if one fails, and reports the failure with the step error it followed', async () => {
    let second = false
    const run = runRelease(makeCtx(), [
      step('bump', 'bump', (ctx) => {
        ctx.onFinally(() => void (second = true))
        ctx.onFinally(() => {
          throw new Error('package.json is locked')
        })
      }),
      step('build.web', 'build', () => {
        throw new ReleaseError('build failed')
      })
    ])
    await expect(run).rejects.toThrow(ReleaseError)
    await expect(run).rejects.toThrow(/cleanup failed: package\.json is locked \(after the run had already stopped: build failed\)/)
    expect(second).toBe(true)
  })
})
