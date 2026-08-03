import type { Api } from '@shared/types'
import { setPlatform } from '@renderer/platform'

/**
 * Test helper: inject a fake platform built from a partial, loosely-typed stand-in for
 * `Api` (only the methods a given test exercises, often with abbreviated fixture
 * shapes rather than full domain objects). The `as Api` cast mirrors the previous
 * `vi.stubGlobal('window', { api: {...} })` pattern, which was likewise untyped; it is
 * safe because each test only invokes the methods it itself stubbed with `vi.fn()`.
 */
export function setFakeApi(partial: Record<string, unknown>): void {
  // Double cast (via `unknown`) hops the structural gap — `partial` doesn't satisfy `Api`;
  // see the doc comment above for why that's safe.
  setPlatform({ api: partial as unknown as Api })
}
