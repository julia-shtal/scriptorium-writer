import type { Api, LifecycleApi } from '@shared/types'

export interface Platform {
  api: Api
  /** Absent on platforms with no host lifecycle (web/PWA). Callers must null-check. */
  lifecycle?: LifecycleApi
  /** Whether the browser granted persistent storage (navigator.storage.persist()).
   *  undefined on platforms without OPFS storage pressure (Electron). MP9 surfaces this. */
  storagePersisted?: boolean
  /** Static, per-platform capability flags read by the UI to adapt behaviour
   *  without user-agent sniffing. Optional (like storagePersisted) so the
   *  fakePlatform test helper — which builds a bare { api } — keeps compiling;
   *  both real factories still set it. */
  capabilities?: { managedSpellcheck: boolean }
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
