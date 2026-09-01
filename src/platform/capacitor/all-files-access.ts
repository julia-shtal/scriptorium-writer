/**
 * TS side of `AllFilesAccessPlugin.java` — the MANAGE_EXTERNAL_STORAGE ("All files access")
 * bridge, MC3.
 *
 * The permission itself is argued for in `android/app/src/main/AndroidManifest.xml`. The short
 * version, measured on the target tablet in MC2: without it a library the app cannot read looks
 * exactly like a library that is empty, and the app answered that by seeding a demo story on
 * top of the user's writing. Everything in this module exists so the renderer can tell those
 * two states apart before it touches anything.
 *
 * WebView code: this module must never import a `node:` built-in.
 */

import { registerPlugin } from '@capacitor/core'

export interface AllFilesAccessPlugin {
  check(): Promise<{ granted: boolean }>
  openSettings(): Promise<void>
}

/** Resolved lazily by Capacitor; on a non-Android host every call simply rejects with
 *  "not implemented on web", which is the case `hasAllFilesAccess` below is built to absorb. */
const AllFilesAccess = registerPlugin<AllFilesAccessPlugin>('AllFilesAccess')

/**
 * Is all-files access held right now?
 *
 * ANY failure — plugin missing, bridge not ready, an OEM throwing from
 * isExternalStorageManager, the web/desktop builds where this plugin does not exist — resolves
 * to **false**, never true and never a throw.
 *
 * That asymmetry is the whole point of MC3 and is not defensive boilerplate: a check that
 * failed is not evidence that the library is readable. Defaulting to `true` on error would
 * restore precisely the MC2 failure — the app proceeding on absent evidence, finding an empty
 * `listStories()`, and writing a fresh demo story over work it could not see. Defaulting to
 * `false` costs a false gate at worst, and the gate re-checks on resume, so the user can always
 * get out of it.
 *
 * Reads live state on every call for the same reason: the user grants this in system Settings
 * while the app is backgrounded, so the answer changes underneath us.
 */
export async function hasAllFilesAccess(): Promise<boolean> {
  try {
    const { granted } = await AllFilesAccess.check()
    return granted === true
  } catch (err) {
    console.warn('[all-files-access] check failed; treating access as NOT granted', err)
    return false
  }
}

/**
 * Route the user to the system all-files-access screen.
 *
 * Rejections propagate deliberately — unlike `hasAllFilesAccess`, swallowing here would leave
 * the user tapping a button that does nothing. The Java side already tries the per-app screen,
 * then the global one, and only rejects (code `NO_SETTINGS_SCREEN`) when this device has
 * neither; that rejection is the caller's cue to show written "Settings → Apps → Scriptorium →
 * All files access" instructions instead.
 */
export async function openAllFilesAccessSettings(): Promise<void> {
  await AllFilesAccess.openSettings()
}
