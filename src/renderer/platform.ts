import type { Api, LifecycleApi } from '@shared/types'

export interface Platform {
  api: Api
  /** Absent on platforms with no host lifecycle (web/PWA). Callers must null-check. */
  lifecycle?: LifecycleApi
}

let current: Platform | null = null

export function setPlatform(p: Platform): void { current = p }

export function getPlatform(): Platform {
  if (!current) throw new Error('Platform not initialised — call setPlatform() before render')
  return current
}

/** Convenience accessor; the overwhelmingly common case. */
export function api(): Api { return getPlatform().api }

/** Test-only: clear the injected platform between tests. */
export function resetPlatform(): void { current = null }
