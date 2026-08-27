/**
 * DEV-ONLY on-device runner for the shared FsPort contract (MC2).
 *
 * Why a console global and not a debug view: a view needs a permanent ViewId /
 * uiStore.activeView entry that must never be reachable in production. This has no such
 * footprint, gives real stack traces in chrome://inspect, and its exclusion from release is a
 * bundler guarantee rather than a discipline problem — see the import.meta.env.DEV branch in
 * src/renderer/main.web.tsx, which must stay a DYNAMIC import or this module lands in
 * dist-web anyway.
 *
 * Usage: chrome://inspect → the app's WebView → console → `await __fsPortContract()`.
 *
 * If `__fsPortContract` is undefined on device: `vite build --mode development` alone does
 * NOT set `import.meta.env.DEV` — Vite derives DEV/PROD from `NODE_ENV`, which a plain
 * `vite build` forces to `production` regardless of `--mode`. `build:web:dev` sets
 * `NODE_ENV=development` (via `cross-env`) before invoking Vite; that env var, not `--mode`,
 * is what actually flips `import.meta.env.DEV` and includes this harness in the bundle.
 *
 * COVERAGE CAVEAT: every case here runs its scratch directory under `roots.userdata`
 * (Directory.Data), which needs no runtime permission on Android. A clean 10/10 therefore
 * says nothing about `roots.library` (Directory.Documents) — the permission-sensitive root
 * MC2 exists for in the first place. See the `roots` line this harness logs, and the
 * console note it prints alongside the results table. A second pass under roots.library is
 * a deliberate scope decision for after this spike, not an oversight here.
 */
import { FS_PORT_CONTRACT_CASES, type FsPortAssert } from '@data/fs-port.contract'
import { joinPath } from '@data/path-utils'
import { codeOf } from './error-codes'
import { CapacitorFsPort } from './fs-port'
import { resolveCapacitorRoots, type CapacitorRoots } from './roots'

/** Grep target: this string must NEVER appear in a production dist-web build. */
export const DEV_HARNESS_MARKER = 'SCRIPTORIUM_DEV_FSPORT_HARNESS'

function fail(label: string, detail: string): never {
  throw new Error(`${label}: ${detail}`)
}

const deviceAssert: FsPortAssert = {
  equal: (actual, expected, label) => {
    if (actual !== expected) fail(label, `expected ${String(expected)}, got ${String(actual)}`)
  },
  deepEqual: (actual, expected, label) => {
    // STANDING ASSUMPTION: JSON.stringify comparison is only correct because every current
    // contract case compares arrays (Array.from(bytes), [...names].sort()), where stringify
    // is order-faithful. A future case comparing plain objects would make this silently
    // key-order-sensitive (JSON.stringify does not sort object keys). If that happens, this
    // needs a real structural deepEqual instead.
    const a = JSON.stringify(actual)
    const b = JSON.stringify(expected)
    if (a !== b) fail(label, `expected ${b}, got ${a}`)
  },
  isTrue: (actual, label) => {
    if (actual !== true) fail(label, `expected true, got ${String(actual)}`)
  },
  rejectsWithCode: async (fn, code, label) => {
    try {
      await fn()
    } catch (err) {
      const actual = (err as { code?: string } | null)?.code
      if (actual !== code) fail(label, `expected rejection code ${code}, got ${String(actual)}`)
      return
    }
    fail(label, `expected rejection with code ${code}, but it resolved`)
  },
  resolvesUndefined: async (fn, label) => {
    const value = await fn()
    if (value !== undefined) fail(label, `expected undefined, got ${String(value)}`)
  }
}

export interface DeviceCaseResult {
  name: string
  passed: boolean
  error?: string
}

/** Run every shared contract case against a real CapacitorFsPort on this device. */
export async function runContractOnDevice(): Promise<{
  total: number
  passed: number
  results: DeviceCaseResult[]
  roots: CapacitorRoots
}> {
  const roots = await resolveCapacitorRoots()
  const fs = new CapacitorFsPort()
  const results: DeviceCaseResult[] = []

  for (const [index, testCase] of FS_PORT_CONTRACT_CASES.entries()) {
    // Unique scratch dir per case: device storage persists between runs, so a fixed name
    // would let one case's leftovers decide another case's result.
    const dir = joinPath(roots.userdata, `fsporttest-${Date.now()}-${index}`)
    try {
      try {
        await fs.mkdir(dir, { recursive: true })
      } catch (err) {
        // Distinguish "the scratch dir itself couldn't be made" (permissions, a bad
        // roots.userdata) from an actual case failure — without the `setup:` prefix a
        // dir-creation failure reports as all ten cases failing, and the user would
        // reasonably (but wrongly) read that as "everything is broken" rather than "one
        // thing, upstream of every case, is broken."
        const code = codeOf(err)
        const message = err instanceof Error ? err.message : String(err)
        results.push({
          name: testCase.name,
          passed: false,
          error: `setup: ${code ? `[${code}] ${message}` : message}`
        })
        console.error(`[${DEV_HARNESS_MARKER}] SETUP FAIL: ${testCase.name}`, err)
        continue
      }
      await testCase.run({ fs, dir }, deviceAssert)
      results.push({ name: testCase.name, passed: true })
    } catch (err) {
      // The interesting failure here is a raw plugin rejection escaping translate() (by
      // design, for any code outside the ENOENT whitelist) — OS-PLUG-FILE-0007 vs -0009 vs
      // -0013 is the single most valuable datum on first contact with hardware, and
      // `String(err)` would either drop it or, for a non-Error rejection, print
      // `[object Object]`. Format it explicitly so `results` is self-contained enough to
      // paste back verbatim.
      const code = codeOf(err)
      const message = err instanceof Error ? err.message : String(err)
      results.push({ name: testCase.name, passed: false, error: code ? `[${code}] ${message}` : message })
      console.error(`[${DEV_HARNESS_MARKER}] FAIL: ${testCase.name}`, err)
    } finally {
      await fs.rm(dir, { force: true, recursive: true }).catch(() => {
        /* best-effort cleanup; an rm case may already have removed it */
      })
    }
  }

  const passed = results.filter((r) => r.passed).length
  console.table(results)
  console.log(`[${DEV_HARNESS_MARKER}] resolved roots:`, roots)
  console.log(
    `[${DEV_HARNESS_MARKER}] NOTE: every case above ran under roots.userdata (Directory.Data, ` +
      'no runtime permission needed). This result does NOT exercise roots.library ' +
      '(Directory.Documents), the permission-sensitive root MC2 exists for.'
  )
  console.log(`[${DEV_HARNESS_MARKER}] ${passed}/${results.length} passed`)
  return { total: results.length, passed, results, roots }
}

interface ContractHarnessGlobal {
  __fsPortContract?: typeof runContractOnDevice
}

/** Attach the console entry point. Called only from the DEV branch of main.web.tsx. */
export function installDevContractHarness(): void {
  const harnessGlobal = globalThis as unknown as ContractHarnessGlobal
  harnessGlobal.__fsPortContract = runContractOnDevice
  console.log(`[${DEV_HARNESS_MARKER}] installed — run: await __fsPortContract()`)
}
