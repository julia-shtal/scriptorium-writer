// Web/Android renderer entry: boots the Platform (OPFS storage) then renders the shared
// App. Electron entry is main.electron.tsx. This single entry serves both the PWA and
// the Capacitor (Android) build off the same dist-web bundle — see the `isNative` check
// below.
import React from 'react'
import { createRoot } from 'react-dom/client'
import { Capacitor } from '@capacitor/core'
import '@fontsource/pt-serif/400.css'
import '@fontsource/pt-serif/400-italic.css'
import '@fontsource/pt-serif/700.css'
import '@fontsource/pt-sans/400.css'
import '@fontsource/pt-sans/700.css'
import './theme/book.css'
import App from './app'
import { WebUpdateNotice } from './components/WebUpdateNotice'
import { setPlatform } from './platform'
import { createWebPlatform } from '../platform/web'
import { createCapacitorPlatform } from '../platform/capacitor'

const container = document.getElementById('root')
if (!container) {
  throw new Error('Root container #root not found')
}

// The one runtime platform check in the codebase (MC1): the PWA and the Capacitor
// Android app share the exact same dist-web bundle, so the composition root — here, and
// nowhere else — is where they diverge. Hoisted to a const so both `boot()` and the
// failure path below read the same single check rather than each calling
// `Capacitor.isNativePlatform()` independently.
const isNative = Capacitor.isNativePlatform()

const boot = async (): Promise<void> => {
  // `createCapacitorPlatform()` still delegates to `createWebPlatform()` for MC1
  // (OPFS-backed); see `src/platform/capacitor/index.ts` for the TODO(MC2) that
  // replaces it.
  const platform = isNative ? await createCapacitorPlatform() : await createWebPlatform()
  setPlatform(platform)
  createRoot(container).render(
    <React.StrictMode>
      <App />
      <WebUpdateNotice />
    </React.StrictMode>
  )
}

boot().catch((err: unknown) => {
  // The web/Android entry's one unique risk is async boot failure; never leave a blank
  // page or WebView (MP3 acceptance: "must not be blank or throw on boot"). Plain DOM so
  // the failure path needs no React. Covers both branches above — a Capacitor boot
  // failure must not leave a blank native WebView either, and the recovery instructions
  // and diagnostics differ from the web case: a WebView has no address bar, no
  // pull-to-refresh, and no F5, so "reload the page" is not actionable there, and
  // console.error only reaches logcat / chrome://inspect, which this user cannot get to
  // on a tablet — so the error text itself is appended to the on-screen message, since
  // that is the only diagnostic the user can see or report back.
  console.error('Platform failed to boot', err)
  const recovery = isNative
    ? 'Failed to start. Please close the app and open it again.'
    : 'Failed to start. Please reload the page.'
  // Land the contract-critical text first: it cannot throw. Only then enrich it with the
  // error detail — String() is safe for every value a real rejection here can carry, but a
  // throw at this exact point would leave the blank screen the contract forbids.
  container.textContent = recovery
  try {
    container.textContent = `${recovery} (${String(err)})`
  } catch {
    /* keep the bare recovery message */
  }
})
