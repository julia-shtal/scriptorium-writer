/**
 * `hasAllFilesAccess` / `openAllFilesAccessSettings` (MC3) with `@capacitor/core`'s
 * `registerPlugin` mocked — there is no Android bridge in a node suite.
 *
 * The property worth a test is the asymmetry, not the happy path: a check that FAILS must
 * yield `false`, exactly like an explicit denial. Returning true (or letting the rejection
 * escape into the composition root) would put the app back where MC2 left it — proceeding on
 * absent evidence, reading an empty listStories(), and seeding a demo story over writing it
 * could not see. `openSettings` is the mirror image: its rejection MUST escape, because the
 * caller turns it into "open Settings by hand" and a swallowed one is a dead button.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Reassigned per test. The `vi.mock` factory runs once per module import and `registerPlugin`
// is called at module-eval time, so the returned proxy must read whichever implementation is
// current at CALL time rather than capturing one here (same pattern as fs-port.test.ts).
let checkImpl: () => Promise<{ granted: boolean }>
let openSettingsImpl: () => Promise<void>

vi.mock('@capacitor/core', () => ({
  registerPlugin: () => ({
    check: () => checkImpl(),
    openSettings: () => openSettingsImpl()
  })
}))

// Imported AFTER the vi.mock call reads (Vitest hoists the mock above every import), so the
// module-eval `registerPlugin(...)` inside all-files-access.ts sees the fake.
import { hasAllFilesAccess, openAllFilesAccessSettings } from './all-files-access'

beforeEach(() => {
  checkImpl = () => Promise.resolve({ granted: false })
  openSettingsImpl = () => Promise.resolve()
  // The failure paths log; keep the suite output readable without hiding a real regression
  // (the assertions below, not the console, are what prove the behaviour).
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

describe('hasAllFilesAccess', () => {
  it('is true when the plugin reports the permission granted', async () => {
    checkImpl = () => Promise.resolve({ granted: true })
    expect(await hasAllFilesAccess()).toBe(true)
  })

  it('is false when the plugin reports the permission denied', async () => {
    checkImpl = () => Promise.resolve({ granted: false })
    expect(await hasAllFilesAccess()).toBe(false)
  })

  it('is false — never a throw — when the check itself rejects', async () => {
    // The real shapes behind this: the plugin missing from the bridge ("not implemented on
    // web"), the bridge not ready yet, or an OEM throwing from isExternalStorageManager.
    checkImpl = () => Promise.reject(new Error('"AllFilesAccess" plugin is not implemented on web'))
    await expect(hasAllFilesAccess()).resolves.toBe(false)
  })

  it('is false when the plugin resolves something that is not a boolean granted', async () => {
    // A bridge that hands back `{}` (or a string) is not evidence of access either. The strict
    // `=== true` comparison is what makes this hold; a truthiness check would pass 'false'.
    checkImpl = () => Promise.resolve({} as { granted: boolean })
    expect(await hasAllFilesAccess()).toBe(false)
  })

  it('re-reads the plugin on every call rather than caching the first answer', async () => {
    // The user grants this from system Settings while the app is backgrounded, so the gate's
    // recheck-on-resume only works if nothing memoises the boot-time value.
    checkImpl = () => Promise.resolve({ granted: false })
    expect(await hasAllFilesAccess()).toBe(false)
    checkImpl = () => Promise.resolve({ granted: true })
    expect(await hasAllFilesAccess()).toBe(true)
  })
})

describe('openAllFilesAccessSettings', () => {
  it('resolves when a system screen was opened', async () => {
    await expect(openAllFilesAccessSettings()).resolves.toBeUndefined()
  })

  it('propagates the rejection when no system screen resolved', async () => {
    // The Java side already tried the per-app and then the global screen; this rejection is
    // the caller's only cue to show written instructions instead.
    openSettingsImpl = () => Promise.reject(new Error('NO_SETTINGS_SCREEN'))
    await expect(openAllFilesAccessSettings()).rejects.toThrow('NO_SETTINGS_SCREEN')
  })
})
