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
  capabilities?: {
    managedSpellcheck: boolean
    /** True only where storage is a browser sandbox the engine may evict (OPFS). Gates the
     *  MP9 nudge and the Settings storage panel. NOT the same question as managedSpellcheck,
     *  which is false on Android too — reusing that flag as an isWeb proxy hides nothing on
     *  native. */
    evictableStorage: boolean
    /** True only where every export lands in ONE fixed, user-browsable device folder
     *  (Android/MC2: Documents/Scriptorium-Writer-exports) instead of a location the user
     *  chooses per export. Gates the "saved to …" hint, which must not be shown on desktop
     *  (the user picked the folder in a real save dialog) or on web (the browser did) —
     *  naming a folder those platforms never wrote to would be false. REQUIRED, like
     *  evictableStorage: every field in this object is required, so a new platform factory
     *  (or a new flag) fails to compile until someone states the answer rather than
     *  inheriting `undefined` by omission. */
    exportsToDeviceFolder: boolean
  }
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
