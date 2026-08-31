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
    allowMixedContent: false,
    // MC4: the WebView's OWN background, i.e. what is on screen after the native splash
    // hands off but before the bundle's first paint. Default is WebView white, which on a
    // dark-leather app reads as a flash. Same #3a2a1d as `--book-frame` /
    // `THEME_COLOR` (src/renderer/pwa/manifest.ts) and as @color/scriptorium_frame in
    // android/app/src/main/res/values/colors.xml — the three are asserted equal by
    // src/platform/capacitor/android-theme.test.ts. Capacitor takes a hex string here, not
    // a resource reference, so this is one place the literal genuinely has to be repeated.
    backgroundColor: '#3a2a1d'
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
  },
  plugins: {
    // Capacitor 8 ships SystemBars as a CORE plugin in @capacitor/android — this is why
    // @capacitor/status-bar is deliberately NOT installed: it would be a second thing
    // fighting for the same window flags, for behaviour already present.
    //
    // 'DARK' names the BACKGROUND, not the icons: it maps to
    // setAppearanceLightStatusBars(false), i.e. LIGHT icons — which is what a #3a2a1d
    // frame needs. Left unset the style is 'DEFAULT', which follows the system light/dark
    // setting, so a device in light mode would draw dark icons on dark leather.
    //
    // insetsHandling is left at its 'css' default and edge-to-edge stays OFF. Under 'css'
    // with no `viewport-fit=cover` in src/renderer/index.web.html, SystemBars pads the
    // WebView's parent by the system-bar insets, so web content never sits under system
    // UI and nothing in the renderer has to know about safe areas. Going true
    // edge-to-edge would mean adding viewport-fit=cover AND reworking the top and bottom
    // bars against the injected --safe-area-inset-* variables — renderer work with no
    // payoff on a tablet whose UI is already a dark inset panel inside the same frame
    // colour. Revisit only if the design ever wants content bleeding under the bars.
    SystemBars: { style: 'DARK' }
  }
}

export default config
