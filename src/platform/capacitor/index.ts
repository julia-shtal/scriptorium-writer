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
import { hasAllFilesAccess, openAllFilesAccessSettings } from './all-files-access'
import { CapacitorFsPort } from './fs-port'
import { isNativeLibraryPathUsable } from './library-path'
import { createNativeExportApi } from './native-export'
import { resolveCapacitorRoots } from './roots'

export async function createCapacitorPlatform(): Promise<Platform> {
  // FIRST, before any filesystem work: the renderer's gate needs this answer to decide whether
  // it may boot the library at all, and MC3 exists because acting before knowing is what let
  // MC2 seed a demo story over an unreadable library.
  const granted = await hasAllFilesAccess()

  // Resolved even when access is withheld, deliberately. Settings and userdata live in
  // Directory.Data and stay reachable regardless, so the app still has somewhere to work; and
  // if the Documents mkdir genuinely fails on permission, resolveRoot propagates the real 0007
  // rather than inventing a phantom path (see roots.ts). A comprehensible error beats a boot
  // crash, and skipping this would trade one for the other.
  const roots = await resolveCapacitorRoots()
  const fs = new CapacitorFsPort()
  const { api, service } = await createPlatformFromFsPort(fs, {
    userDataPath: roots.userdata,
    defaultLibraryPath: roots.library,
    // A settings.json that travelled in from the desktop carries a Windows libraryPath; ignore
    // it and use the resolved Documents root instead of failing to launch (MC3 §6).
    isLibraryPathUsable: isNativeLibraryPathUsable
  })
  return {
    // Spread order matters: the native export methods must WIN over the web ones.
    api: { ...api, ...createNativeExportApi(fs, service, roots.exports) },
    // No navigator.storage.persist() and no OPFS worker on native — and no storagePersisted,
    // which is an OPFS-eviction concept with no native meaning.
    storageAccess: {
      granted,
      request: openAllFilesAccessSettings,
      recheck: hasAllFilesAccess
    },
    // exportsToDeviceFolder: native export writes to a fixed folder nothing cleans up, so
    // the UI must be able to tell the user where to find the files (native-export.ts).
    // libraryLocation 'androidDocuments': roots.library is an internal
    // /storage/emulated/0/... string, and there is no reliable file-manager intent to reveal
    // it, so Settings shows the human-readable location and no reveal control.
    capabilities: {
      managedSpellcheck: false,
      evictableStorage: false,
      exportsToDeviceFolder: true,
      libraryLocation: 'androidDocuments'
    }
  }
}
