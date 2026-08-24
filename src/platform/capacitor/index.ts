/**
 * Capacitor (Android) platform composition root (MC1).
 *
 * The Android app ships the exact same `dist-web` bundle as the PWA (see
 * `vite.web.config.ts`), so at this milestone there is nothing Android-specific to wire
 * up: `capacitor.config.ts` pins `androidScheme: 'https'`, which keeps the WebView a
 * secure context, which is what lets OPFS keep working unmodified inside it. This
 * module exists so the composition root (`src/renderer/main.web.tsx`) has a stable
 * factory to call regardless of which way the platform check goes — see that file's
 * runtime `Capacitor.isNativePlatform()` branch.
 *
 * Browser/WebView code: this module must never import a `node:` built-in.
 */

import type { Api } from '@shared/types'
import type { Platform } from '@renderer/platform'
import { AppError } from '@shared/errors'
import { createWebPlatform } from '../web'

const NATIVE_EXPORT_UNSUPPORTED_MESSAGE =
  'Exporting is not available in the Android app yet. Back up your library from the ' +
  'desktop app or from scriptorium-writer in a browser instead.'

/**
 * Wrap an {@link Api} so the three export methods reject instead of silently doing
 * nothing. Exported as a pure function (rather than inlined into
 * {@link createCapacitorPlatform}) purely so it can be unit-tested in node against a
 * hand-built fake `Api`, the same way `makeApiFromService` is tested in
 * `src/platform/web/index.test.ts` without booting OPFS.
 *
 * Why this guard exists: `createCapacitorPlatform()` delegates to the web platform, so
 * Android inherits `exportLibrary`'s `triggerDownload()` fallback (no
 * `showSaveFilePicker` in a WebView). `@capacitor/android` registers no
 * `DownloadListener`, so a WebView with none drops `blob:` downloads silently — no file,
 * no exception — while `exportLibrary` still resolves `{ canceled: false }`. In this
 * project reliability is priority #1, and `runLibraryBackup` would then stamp
 * `lastLibraryBackupAt` and clear the MP9 backup nudge for days, having written nothing.
 * A loud failure is strictly better than a silent false success, so this throws instead.
 *
 * Follows the existing `revealInFolder` precedent in `src/platform/web/index.ts`: throw
 * a plain, un-localized `AppError('UNSUPPORTED', ...)`. Renderer call sites already
 * catch and localize their own user-facing message from the error's presence/code, not
 * its `message` text (see `SettingsView.exportLibrary`, `useExport`), so this string is a
 * developer-facing fallback only, matching how `revealInFolder`'s message is treated.
 */
export function withNativeExportGuards(api: Api): Api {
  const unsupported = async (): Promise<never> => {
    throw new AppError('UNSUPPORTED', NATIVE_EXPORT_UNSUPPORTED_MESSAGE)
  }
  return {
    ...api,
    exportLibrary: unsupported,
    exportChapter: unsupported,
    exportStory: unsupported
  }
}

/**
 * Boot the Capacitor {@link Platform}. For MC1 this delegates to {@link createWebPlatform}
 * — storage is still OPFS, running inside the Android WebView rather than a desktop
 * browser tab — with the three export methods guarded (see {@link withNativeExportGuards}).
 * Import, and everything else on the web `Api`, is untouched: Capacitor's file chooser
 * backs `readImportFile` fine, so import keeps working on Android.
 *
 * TODO(MC2): implement real native export via `@capacitor/filesystem` + the Share sheet,
 * and remove `withNativeExportGuards`. Also swap the OPFS `FsPort` for one backed by
 * `@capacitor/filesystem` so chapter data lives in real Android app storage instead of
 * the WebView's OPFS sandbox. This module is deliberately the only file MC2 must change
 * — the seam (this factory, chosen at the composition root) is already in place.
 *
 * Two things for that future change to walk into with open eyes, not by surprise:
 * (a) `createWebPlatform()` hard-codes `new OpfsFsPort()` and the `'/userdata'` /
 * `'/library'` path literals inline, and `requestPersistentStorage` is module-private.
 * This module can reuse the exported `makeApiFromService`, but would otherwise duplicate
 * the `FileService` construction, putting those two path literals in two modules where
 * they can silently drift. Consider extracting something like
 * `createPlatformFromFsPort(fs)` out of `src/platform/web/index.ts` instead of
 * duplicating that wiring.
 * (b) `src/renderer/main.web.tsx` imports this module statically. That's free today (a
 * one-line delegating call), but once it pulls in `@capacitor/filesystem` that plugin lands in
 * the shared chunk every browser user downloads, even though they'll never run this
 * branch. Decide deliberately whether to switch that import to a dynamic
 * `await import('../platform/capacitor')` — noted here so it's a choice, not an
 * oversight.
 */
export async function createCapacitorPlatform(): Promise<Platform> {
  const platform = await createWebPlatform()
  return { ...platform, api: withNativeExportGuards(platform.api) }
}
