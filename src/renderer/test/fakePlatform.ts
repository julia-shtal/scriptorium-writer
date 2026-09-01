import type { Api } from '@shared/types'
import { setPlatform, type Platform } from '@renderer/platform'

/**
 * Test helper: inject a fake platform built from a partial, loosely-typed stand-in for
 * `Api` (only the methods a given test exercises, often with abbreviated fixture
 * shapes rather than full domain objects). The `as Api` cast mirrors the previous
 * `vi.stubGlobal('window', { api: {...} })` pattern, which was likewise untyped; it is
 * safe because each test only invokes the methods it itself stubbed with `vi.fn()`.
 *
 * `rest` carries the non-`api` half of a `Platform` for the code paths that read it —
 * `capabilities`, and MC3's `storageAccess`. Unlike `partial` it is **fully typed**, not
 * cast: those fields are small, plain data, so a test that fakes one should have to fake it
 * honestly, and a future required field should break the tests that claim to supply it.
 * Omitting it reproduces the original bare `{ api }` platform exactly, which is what every
 * pre-existing call site wants: no `storageAccess` at all, i.e. "no permission gate applies".
 */
export function setFakeApi(partial: Record<string, unknown>, rest: Omit<Platform, 'api'> = {}): void {
  // Double cast (via `unknown`) hops the structural gap — `partial` doesn't satisfy `Api`;
  // see the doc comment above for why that's safe.
  setPlatform({ api: partial as unknown as Api, ...rest })
}
