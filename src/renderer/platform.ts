import type { Api, LifecycleApi } from '@shared/types'

export interface Platform {
  api: Api
  /** Absent on platforms with no host lifecycle (web/PWA). Callers must null-check. */
  lifecycle?: LifecycleApi
  /** Whether the browser granted persistent storage (navigator.storage.persist()).
   *  undefined on platforms without OPFS storage pressure (Electron). MP9 surfaces this. */
  storagePersisted?: boolean
  /** Present ONLY where the OS can withhold access to the library, i.e. Android/MC3
   *  (MANAGE_EXTERNAL_STORAGE). Absent on desktop and web, where storage is always
   *  reachable — so `storageAccess === undefined` means "no gate applies", not "denied".
   *  Callers must null-check and treat absence as granted. */
  storageAccess?: {
    /** State as of boot. The live value moves (the user grants it from system Settings while
     *  the app is backgrounded), which is what `recheck` is for. */
    granted: boolean
    /** Route the user to the system All-files-access screen. REJECTS if no such screen
     *  resolves on this device — some OEM builds have neither the per-app nor the global one —
     *  so the caller can fall back to written instructions instead of a dead button. */
    request: () => Promise<void>
    /** Re-read the live state (called when the app regains focus after `request`). */
    recheck: () => Promise<boolean>
  }
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
    /** How Settings should present the library location. REQUIRED, like the flags above.
     *  'path-revealable' — a real OS path with a working reveal-in-folder (Electron).
     *  'path'            — a real path string, no reveal control (web: `/library` inside OPFS,
     *                      where `revealInFolder` throws UNSUPPORTED, so that button was
     *                      always dead).
     *  'androidDocuments'— the raw path is an internal `/storage/emulated/0/...` string that
     *                      means nothing to a tablet user, and Android has no reliable
     *                      universal file-manager intent; show the human-readable location
     *                      («Документы / Scriptorium-Writer») and render no reveal control. */
    libraryLocation: 'path-revealable' | 'path' | 'androidDocuments'
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
