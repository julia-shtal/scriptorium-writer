// Capacitor config for the Android wrapper around the MP3 web build (dist-web). MC1 wraps
// the existing PWA bundle in a native container without changing storage — OPFS is still
// in use until MC2 swaps it for @capacitor/filesystem, so the WebView must stay a secure
// context or OPFS silently stops working. `androidScheme: 'https'` is Capacitor's default,
// but it's set explicitly here (rather than left implicit) so that fact stays visible and
// doesn't get "cleaned up" by someone who doesn't know why it matters.
//
// appId is permanent: it's the Android application ID (Java package naming rules — no
// hyphens, which is why it isn't `scriptorium-writer`) and changing it later produces a
// different app that cannot upgrade over an installed one.
import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.juliashtal.scriptoriumwriter',
  appName: 'Scriptorium Writer',
  // Must match vite.web.config.ts's build.outDir. A mismatch either errors loudly (dir
  // missing) or silently syncs a stale leftover directory — keep the two in sync by hand.
  webDir: 'dist-web',
  android: {
    // The app makes zero network requests after load, so this makes any accidental
    // http:// subresource fail loudly instead of silently loading over an insecure origin.
    allowMixedContent: false
  },
  server: {
    // Explicit, not relying on default: keeps the WebView on a secure-context origin
    // (needed for OPFS, still the storage backend until MC2).
    // TODO(MC2): once OPFS is replaced by @capacitor/filesystem, re-check whether this
    // still needs to be forced or can revert to Capacitor's implicit default. Mind what
    // changing it costs: androidScheme (and server.hostname) determine the WebView's
    // ORIGIN, and OPFS is origin-keyed — change either and the existing library becomes
    // unreachable (not deleted, just invisible), which would also make an OPFS->native
    // migration silently find nothing to migrate.
    androidScheme: 'https'
  }
  // TODO(MC4): only SplashScreen *plugin options* would land here (under a `plugins` key).
  // The icon/splash assets themselves are generated into android/app/src/main/res/, and
  // release signing lives in android/app/build.gradle + key.properties — not in this file.
}

export default config
