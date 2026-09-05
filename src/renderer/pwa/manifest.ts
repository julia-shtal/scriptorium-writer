/**
 * PWA web app manifest (MP7). Single source of truth: imported by `vite.web.config.ts`
 * (handed to vite-plugin-pwa) and by the node test. Pure data — no DOM, no plugin
 * imports — so it is safe to import from both the build config and Vitest.
 *
 * Colours come from the `--book-frame` theme token so the Android splash and status bar
 * are continuous with the app's own leather frame. `start_url`/`scope` are '.' to match
 * `base: './'` (also keeps the later Capacitor file://-like origin working). No
 * `orientation` lock — a tablet writing app must work both ways (MP8 tunes them).
 *
 * Language (M29): `description` is a single string a manifest cannot localise, and it is what
 * the install dialog and the Android app list show before anyone has chosen a language — so it
 * follows the README's language (English) while the application itself switches at runtime.
 */
export const THEME_COLOR = '#3a2a1d' // --book-frame

export const manifest = {
  name: 'Scriptorium Writer',
  short_name: 'Scriptorium',
  description: 'A writing room for long-form fiction — offline and crash-safe',
  lang: 'en',
  dir: 'ltr',
  display: 'standalone',
  start_url: '.',
  scope: '.',
  background_color: THEME_COLOR,
  theme_color: THEME_COLOR,
  icons: [
    { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
  ]
} as const
