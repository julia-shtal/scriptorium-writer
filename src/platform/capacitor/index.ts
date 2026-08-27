/**
 * Capacitor (Android) platform composition root (MC1, real device storage in MC2).
 *
 * The Android app ships the exact same `dist-web` bundle as the PWA (see
 * `vite.web.config.ts`); this module is the one place the composition root
 * (`src/renderer/main.web.tsx`) diverges for the native branch — see that file's
 * runtime `Capacitor.isNativePlatform()` check.
 *
 * Storage is backed by {@link CapacitorFsPort} (`@capacitor/filesystem`), rooted under
 * the paths {@link resolveCapacitorRoots} resolves, so chapter data lives in real
 * Android app storage rather than the WebView's OPFS sandbox.
 *
 * EXPORT (MC2 Task 6): the three export methods `makeApiFromService` builds are web ones,
 * built on `triggerDownload` — a WebView with no `DownloadListener` drops those `blob:`
 * downloads silently while the calls still resolve successfully, which would let
 * `runLibraryBackup` stamp `lastLibraryBackupAt` over nothing. All three are therefore
 * replaced here by `createNativeExportApi` (native-export.ts), which writes and verifies a
 * real file before offering the Share sheet.
 *
 * Browser/WebView code: this module must never import a `node:` built-in.
 */

import type { Platform } from '@renderer/platform'
import { createPlatformFromFsPort } from '../web'
import { CapacitorFsPort } from './fs-port'
import { createNativeExportApi } from './native-export'
import { resolveCapacitorRoots } from './roots'

export async function createCapacitorPlatform(): Promise<Platform> {
  const roots = await resolveCapacitorRoots()
  const fs = new CapacitorFsPort()
  const { api, service } = await createPlatformFromFsPort(fs, {
    userDataPath: roots.userdata,
    defaultLibraryPath: roots.library
  })
  return {
    // Spread order matters: the native export methods must WIN over the web ones.
    api: { ...api, ...createNativeExportApi(fs, service, roots.exports) },
    // No navigator.storage.persist() and no OPFS worker on native — and no storagePersisted,
    // which is an OPFS-eviction concept with no native meaning.
    // exportsToDeviceFolder: native export writes to a fixed folder nothing cleans up, so
    // the UI must be able to tell the user where to find the files (native-export.ts).
    capabilities: {
      managedSpellcheck: false,
      evictableStorage: false,
      exportsToDeviceFolder: true
    }
  }
}
