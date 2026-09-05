# Web build and PWA

The same React renderer also builds as a plain browser app, installable as a PWA. This
page covers the build target, OPFS storage, offline and update behaviour, HTTPS in
development, touch adaptations, and backups against storage eviction.

**Status: unreleased.** It works, but it has never been tagged or published.

## The web build target

The same React renderer also builds as a plain browser app — a second Vite target
(`vite.web.config.ts`) that reuses `src/renderer` with a browser composition root
(`main.web.tsx` → `createWebPlatform()`), no Electron, no preload.

- `npm run dev:web` — serves the web build at the root URL (`http://localhost:5173/`),
  with `--host` so a tablet on the same LAN can reach it. Storage is **OPFS-backed**
  (Origin Private File System), so your stories **persist across page reloads**.
- `npm run build:web` — typechecks, then bundles the browser build into `dist-web/`.
- `npm run verify:web` — checks a built `dist-web/`: that the entry HTML was renamed to
  `index.html` (Capacitor requires that name), that the manifest is complete, English, and
  points only at icons that exist, that the service worker precaches the shell but not the
  unreachable `archiver` chunk, and that the bundle is still inside its size budgets. It
  prints the measured sizes and the margin left against each budget.
- `npm run preview:web` — serves the built `dist-web/` so a production bundle can actually be
  looked at before release. Note that `vite preview` serves plain HTTP, so **the service worker
  will not register there**: preview verifies the bundle's *shape* (the HTML entry loads, the
  app boots, assets resolve), while installability and offline behaviour are verified on the
  real HTTPS host.

The Electron build is unchanged and still owns `src/renderer/index.html`
(→ `main.electron.tsx`).

## OPFS and the worker write path

The persistent browser `FsPort` — `OpfsFsPort` (Origin Private File System) — is
implemented in `src/platform/web/`, proven against the shared `FsPort` contract in
real Chromium, and wired into `createWebPlatform()`. Because the reliable OPFS
write path (`createSyncAccessHandle`) is worker-only, writes are delegated to
`opfs-worker.ts` (with per-path serialization so overlapping saves to the same file
never collide); reads/dir-ops run on the main thread. OPFS has no separate fsync
barrier, so each `writeFile` `flush()`es before close — durability lives inside the
write, which keeps `atomicWriteFile`'s tmp+rename atomic.

Import/export work in the web build too: import reads a `.md`/`.docx` via a file
picker, chapter/story/library export download files to the browser's Downloads folder
(library export is a `.zip` built with `fflate`; desktop still uses `archiver`). The
`.docx` importer sanitises Word's HTML by parsing it against the editor schema — the
same boundary on every platform.

Spellcheck in the web build is provided by the device's own system (e.g. the
Android keyboard), not by the app's bundled dictionaries — the desktop build is
unaffected and still checks offline with the bundled Hunspell dictionaries.

## PWA: install, offline, updates

The web build is an installable, offline-capable PWA:

- **Install:** open the served URL in Chrome and choose "Install app" /
  add-to-home-screen. It launches standalone (no browser chrome) with the book icon and
  the leather-frame splash colour (`--book-frame`).
- **Offline:** a service worker (`vite-plugin-pwa`, Workbox `generateSW`) precaches the
  app shell (JS/CSS/bundled fonts/icons). After the first load the app opens with no
  network — the library lives in OPFS. There is intentionally **no** runtime network
  caching, because the app makes no network requests after load.
- **Updates:** `registerType: 'prompt'` — a new deploy shows a dismissible "a new version
  is available" strip (`WebUpdateNotice`) instead of reloading unprompted; the user taps
  "Update" when ready. This is separate from the desktop `UpdateNotice`, sharing only
  the visual style.
- **Dev over HTTPS:** `npm run dev:web` uses `vite-plugin-mkcert` to serve HTTPS, required
  for service-worker registration and OPFS persistence when testing from a tablet on the
  LAN. The first time, install the mkcert local CA on the tablet (or tap through the
  certificate warning).
- **Icons:** `npm run gen:icon` emits the desktop `.ico` and the PWA PNGs (192, 512, and a
  512 maskable) into `src/renderer/public/icons/` from one source of truth.

## Touch adaptations

On touch devices the web build adapts without changing the desktop UI: hover-only
controls become visible, tap targets grow to ~44px, and the editor column uses dynamic
viewport height (`dvh` + `interactive-widget=resizes-content`) so the soft keyboard never
covers the Find & Replace or cleanup bars. These are gated on `(pointer: coarse)`, so the
desktop layout is unchanged.

## Backups against storage eviction

The browser stores your library in OPFS, which the
browser can evict under storage pressure and which is removed if you clear site data or
uninstall the PWA. Settings shows whether persistent storage was granted and how much
space is in use; the library view nudges you to save a `.zip` backup when the last one is
over a week old (dismissible, and it stays away for a week). Use **Export library**
(Settings) or the nudge button to save a copy — to a folder you choose where the browser
supports `showSaveFilePicker`, otherwise to Downloads (the path Chrome for Android uses).
The last successful export is recorded as `lastLibraryBackupAt` in settings. All of this is
**web-only**: it is gated on the `evictableStorage` capability flag, which is true only in
a browser tab. Desktop and the Android app both store the library as ordinary files, so
neither shows the nudge and neither shows the Storage/quota readout — a
`navigator.storage.estimate()` figure means nothing in a WebView writing to `Documents`.
(The flag is deliberately not the older `managedSpellcheck === false` proxy: that one is
*also* false on Android, because Android genuinely has no app-managed spellchecker, so
reusing it would have named the wrong risk.)
