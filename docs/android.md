# Android build

The Android tablet build: what it is, where it puts your files, the permission it takes
and why, how to build and sign it, and what has and has not been verified on a device.

**Status: unreleased beta.** It builds, installs, and runs, but on-device verification is
incomplete — see [Verification status](#verification-status).

## Contents

- [How the Android build relates to the web build](#how-the-android-build-relates-to-the-web-build)
- [Where things live on the device](#where-things-live-on-the-device)
- [Storage and permissions](#storage-and-permissions)
- [Uninstall behaviour](#uninstall-behaviour)
- [Export on Android](#export-on-android)
- [Moving between the PWA and the Android app](#moving-between-the-pwa-and-the-android-app)
- [Prerequisites and build loop](#prerequisites-and-build-loop)
- [The on-device FsPort contract harness](#the-on-device-fsport-contract-harness)
- [Icons, splash, and system bars](#icons-splash-and-system-bars)
- [Versioning](#versioning)
- [Release signing](#release-signing)
- [Updates](#updates)
- [Verification status](#verification-status)

## How the Android build relates to the web build

Capacitor wraps the same `dist-web` bundle from the [web build](web-pwa.md) in an Android
WebView container — one shared bundle that picks its platform implementation at the
composition root (`src/renderer/main.web.tsx`, the single runtime platform check in
the codebase). Storage under it is **not** OPFS: `CapacitorFsPort`
(`src/platform/capacitor/fs-port.ts`) writes ordinary files through
`@capacitor/filesystem`, so the library is a real folder you can open in the device's
file manager and copy over USB — which is the whole reason the Capacitor block exists.
Because a port sits in front of `FileService`, this is one new `FsPort`
implementation plus one swap at the composition root; the atomic write path, snapshot
pruning and recovery scan are the desktop code, unchanged, and `createWebPlatform` and
`createCapacitorPlatform` share a single `createPlatformFromFsPort` wiring helper so the
`'/userdata'` / `'/library'` literals live in exactly one place.

The WebView still runs on a secure-context origin (`androidScheme: 'https'` in
`capacitor.config.ts`, so the origin is `https://localhost`). That is no longer about
OPFS — it is what keeps the service worker, the update prompt and the rest of the
browser-side machinery from the PWA working inside the container. It is also why
there is no migration path from an installed PWA; see
[Moving between the PWA and the Android app](#moving-between-the-pwa-and-the-android-app).

## Where things live on the device

Three roots, each resolved once at boot into a plain
absolute path (`resolveCapacitorRoots`, `src/platform/capacitor/roots.ts`) and passed
to the plugin absolute thereafter, with the `directory` parameter omitted — so
`CapacitorFsPort` itself knows nothing about `Directory` and has the same shape as
`NodeFsPort`, which is what lets it pass the same contract suite. The `Directory`
constants live only in `roots.ts`, used once each, so they could have been changed in one
place — that was never needed. They are unchanged, which is what keeps
`android/app/src/main/res/xml/file_paths.xml` and its `<external-path>` element valid; that
coupling breaks at runtime when the user taps Share, not at build time.

| Root | On the device | Why there |
| --- | --- | --- |
| **Library** (your stories) | `Documents/Scriptorium-Writer` (`Directory.Documents`) | Visible in the file manager and over USB. Same tree as desktop: `stories/<id>/chapters/…`, `versions/`, `notes/`, `.trash/`. Reading it back after a reinstall, or reading files a PC put there, needs all-files access — see [Storage and permissions](#storage-and-permissions). |
| **Exports** | `Documents/Scriptorium-Writer-exports` (`Directory.Documents`) | A **sibling** of the library, never inside it — `readLibraryEntries` walks the library root recursively, so nested exports would make every archive swallow the previous ones. |
| **Settings / userdata** | app-private `Directory.Data` + `userdata/` | `settings.json` holds `libraryPath`, so settings must be findable *without* knowing `libraryPath` — which rules out putting them in the library folder, or anywhere else the user is expected to point at. `Directory.Data` also needs no permission at all, so even with all-files access withheld the app still reads its own settings and can show the permission gate rather than a dead screen. The trade is that app-private storage does not survive an uninstall; see below. |

## Storage and permissions

The tablet under test is an **Honor YLE-W09,
Android 16 / API 36**. The native project targets that exact level —
`compileSdkVersion`/`targetSdkVersion 36` — with a floor of `minSdkVersion 30`
(`android/variables.gradle`).

**Why the floor is 30 and not Capacitor's 24.** `MANAGE_EXTERNAL_STORAGE` and the
`Environment.isExternalStorageManager()` call that reads whether it was granted both arrive
in **API 30 (Android 11)**. Supporting 24–29 as well would mean a second storage path built
on legacy `WRITE_EXTERNAL_STORAGE` — an extra permission on the app's listing, a second
code path with different failure modes, and no device in existence on which to test it.
This is a sideloaded single-user tablet app; Android 11 (September 2020) is a floor that
costs nothing here. The comment in `variables.gradle` says the same thing, so nobody
lowers it back "helpfully".

**The app requests `MANAGE_EXTERNAL_STORAGE` — "All files access".** This is a large
permission for a writing app and it is taken deliberately, with
both sides of the trade written down.

*What it buys*, and nothing smaller buys either:

- **The library survives uninstall and reinstall.** Without it, the reinstalled app cannot
  read the files the previous install left in `Documents` — see the measurement below.
- **Files placed from a PC over USB are readable.** Unzipping a library export into
  `Documents/Scriptorium-Writer` from the Windows machine is the only restore path the app
  has on Android, and the desktop → tablet half of the round trip depends on it.

*What it costs:* **Google Play will not approve `MANAGE_EXTERNAL_STORAGE` for a writing
app** — it is granted to file-manager-class apps with a specific justification. So
distribution is **sideloaded APKs only**; Play remains closed as long as this permission is
held. The Storage Access Framework is the recorded alternative for the day that trade needs
revisiting, and it is deferred because URI-based paths do not fit `FsPort`'s
plain-absolute-path model without rewriting how the data layer handles paths.

*If the permission is denied:* the app **gates and does not touch the library at all**. It
shows a full-screen rationale with a route into the system All-files-access screen and
re-checks when it regains focus; there is no "continue anyway". That is not caution for its
own sake — without the permission the app is exactly as blind as the measurement below
describes, and the previous behaviour on that path was to write a fresh demo story on top of
work it could not see.

## Uninstall behaviour

Stated per platform, because they are not at parity. On Windows,
`deleteAppDataOnUninstall` is unset in `electron-builder.yml` and therefore defaults to
false, so the desktop `userData` folder under `AppData/Roaming` normally survives an
uninstall. On Android, `Directory.Data` does **not** survive one: uninstalling drops
`settings.json` with it, including `libraryPath` and `lastLibraryBackupAt`. The library
itself is a different question, and it is the question the all-files-access permission
exists to answer.

**Measured on the target tablet** (Honor YLE-W09, Android 16 / API 36,
`targetSdkVersion = 36`, **no storage permission declared**): the library files **survived
an uninstall on disk but the reinstalled app could no longer read them**. Uninstall clears
the MediaStore ownership of everything the app wrote (`owner_package_name` → NULL) and the
files keep the old install's uid with mode `770`; under scoped storage an app may only
reach files in shared storage that it owns. So `listStories()` came back **empty rather
than failing** — and an empty list is indistinguishable from a genuinely empty library, so
the app seeded a fresh demo story beside writing it could not see. Three of them
accumulated over one test session. The same mechanism made PC-placed files invisible,
which is why there was no restore path on Android at all.

**What all-files access changes, and what is still unconfirmed.** With the permission held,
the ownership rule does not apply, so a library written by a previous install — or unpacked
from the PC — should be readable again. The demo-seeding half of the failure is closed in
code regardless of what the OS does: `bootstrapLibrary` returns without seeding and without
stamping `demoSeeded` whenever access is withheld, and that is covered by the unit suite.
The durability half is a claim about Android, not about this repository, and it is
**pending device confirmation** (see [Verification status](#verification-status)).
Until it comes back confirmed, keep taking the `.zip` exports before any uninstall.

## Export on Android

Library, story, and chapter export write **real files** to
`Documents/Scriptorium-Writer-exports` via `@capacitor/filesystem`, then offer the
Android Share sheet (`@capacitor/share`) so the file can be sent on to Drive, mail, or
a cable-connected PC. This replaces the web export path, which is a dead end in a
WebView: `triggerDownload` (`src/platform/web/download.ts`) builds a `blob:` URL, and
`@capacitor/android` registers no `DownloadListener`, so the WebView drops that
download silently — no file, no error, and `lastLibraryBackupAt` stamped over nothing.

Three things about the native path are deliberate and load-bearing
(`src/platform/capacitor/native-export.ts`):

- **Write → verify → share, in that order.** A resolved `Share.share()` proves only
  that the user tapped a target app; Android never reports whether the receiver saved
  anything. Success — and therefore `lastLibraryBackupAt` — rests on our own `stat` of
  the file just written, and a short write throws `EXPORT_FAILED`. A failing or
  dismissed Share sheet is logged and ignored: the bytes are already safe on disk.
- **Filenames carry `YYYY-MM-DD-HHMM`.** Native has no browser `(1)` de-duplication, so
  minute precision is what stops a second export the same day landing on top of the
  first — and a partially-failed write over a previous good backup would destroy it.
- **The exports folder is a sibling of the library, never inside it.**
  `readLibraryEntries` walks the library root recursively, so exports nested inside it
  would make every archive swallow all previous archives. Guarded by
  `src/platform/capacitor/native-export.test.ts`.

Nothing prunes `Documents/Scriptorium-Writer-exports` — old archives accumulate until
the user deletes them, which is why Settings names the folder after a successful export.
`android/app/src/main/res/xml/file_paths.xml` must expose that folder (Capacitor's
FileProvider allows only the cache folder by default) or the Share sheet fails at
runtime when the button is tapped. Import is unaffected — Android's native file chooser
works and `.md`/`.docx` import functions normally on the tablet.

## Moving between the PWA and the Android app

**Export a zip, import it.** There is no
in-app migration, and that is a decision rather than an omission. OPFS is origin-keyed;
the Capacitor WebView's origin is `https://localhost` (see `androidScheme` above), while
a PWA installed from a dev server or any hosted URL sits on a different origin
altogether. The native app therefore cannot see the PWA's OPFS data at all — a
PWA→native migration is not merely awkward to write, it is impossible from inside the
app. The supported route is **Export library** → `.zip` on one side, import on the other,
in either direction, which is a further reason native export had to land in the same
milestone as native storage rather than after it.

Any OPFS data left on a device by the earlier container builds is left exactly where it is,
on purpose. No cleanup code deletes storage the app no longer reads: the disk cost is
trivial, and the blast radius of a bug in code whose job is to delete things is someone's
writing.

## Prerequisites and build loop

Needed only for the Android app; desktop-only work needs none of it.

- **Android Studio** — SDK manager, Gradle sync, and on-device deployment all go
  through it. Only the `android/` directory is opened there; IntelliJ IDEA remains the
  editor for everything under `src/`.
- **JDK 21** — pinned by the generated project (`android/app/capacitor.build.gradle`,
  `sourceCompatibility`/`targetCompatibility VERSION_21`). Android Studio bundles a
  compatible JDK, so a separate install usually isn't needed.
- **Android SDK Platform 36**, minimum API 30 — set in `android/variables.gradle`
  (`compileSdkVersion`/`targetSdkVersion 36`, `minSdkVersion 30`). Install via Android
  Studio's SDK Manager. Capacitor itself only needs API 24; the floor was raised from 24
  to 30 because the all-files-access permission the library depends on, and the
  `Environment.isExternalStorageManager()` call that reads its state, are both API 30+.
  See [Storage and permissions](#storage-and-permissions).
- **USB debugging enabled on the tablet** (Settings → About → tap Build number 7
  times to unlock Developer options, then enable USB debugging) for `npm run
  run:android` and on-device testing.

The loop and its failure modes:

- **Build loop:** `npm run sync:android` → `npm run open:android` → Run in Android
  Studio. `npm run run:android` builds, syncs, and deploys straight to a connected
  device without opening the IDE — but only after Android Studio has opened the
  project at least once. Opening it writes the gitignored `android/local.properties`
  with the SDK location (`android/.gitignore`), which Gradle needs and which
  doesn't exist on a fresh clone; without it, or an `ANDROID_HOME` environment
  variable set some other way, `run:android` fails with `SDK location not found`.
  After that first open, `run:android` works standalone.
- **`npm run open:android` does not build or sync.** It only opens Android Studio.
  `android/app/src/main/assets/public` (the copied web assets Android runs) is
  gitignored and doesn't exist on a fresh clone, so opening the project and hitting
  Run before ever running `sync:android` produces an installable APK with a blank
  white screen and no error — if a sync has completed at least once before. On a
  truly fresh clone Gradle fails earlier and louder instead: `android/settings.gradle`
  points at `capacitor-cordova-android-plugins/`, which is gitignored and only created
  by `cap sync`, so Gradle settings evaluation fails outright (a red error pane, not a
  running app). Either symptom, the fix is the same: run `sync:android` (or
  `run:android`) first. On a non-fresh clone that has synced before, skipping the sync
  instead silently ships whatever the last sync copied — not necessarily your current
  code.
- **Re-run `npx cap sync` after any dependency change** (`npm install` that touches
  a Capacitor plugin, an `@capacitor/*` version bump, etc.) — sync doesn't just copy
  the web bundle, it also installs the native (Gradle) dependencies a Capacitor
  plugin needs. `npm run sync:android` does this for you.
- **A freshly installed APK can still be running the previous build.** Android app
  updates preserve app data, including the service worker registration and its
  Cache Storage precache. With `registerType: 'prompt'`, the old service worker keeps
  controlling navigation and serving the old shell after installing a new APK until
  the in-app update strip is accepted ("Update") or app data is cleared. If the app
  looks unchanged after installing a new build, accept the update prompt, or clear
  the app's data (or uninstall and reinstall), before concluding the change didn't
  land.
- `android/` is committed to the repo on purpose — standard Capacitor practice; it's
  hand-editable native project configuration that shouldn't be regenerated from
  scratch. `android/app/src/main/assets/public`, the copied web assets inside it, is
  gitignored and regenerated by every sync.
- The Android application ID, `com.juliashtal.scriptoriumwriter` (`capacitor.config.ts`),
  is **permanent** — it follows Java package naming rules (no hyphens, hence not
  `scriptorium-writer`), and changing it later produces a different app that cannot
  upgrade over an installed one. This is separate from the desktop `appId`
  (`com.scriptorium-writer.app` in `electron-builder.yml`) — different platform,
  different namespace, no conflict — so "the app ID" always means this Android one
  unless the desktop one is named explicitly.

## The on-device FsPort contract harness

Dev only. `CapacitorFsPort` is the third
implementation to run the shared contract cases in `src/data/fs-port.contract.ts` — the
payoff of the port design. No test runner can reach it, though: the Node project
can't load the Capacitor bridge, browser mode is headless Chromium with no native plugin,
and Vitest doesn't run inside an Android WebView. So the device run is a DEV-gated
console global (`src/platform/capacitor/dev-fs-port-contract.ts`), not a debug view — a
view would need a permanent `ViewId` / `uiStore.activeView` entry that must never be
reachable in production, whereas a global has no such footprint and gives real stack
traces.

- **Getting it onto the device:** `npm run sync:android:dev`, then Run from Android
  Studio. This builds a *development-mode* bundle, because `dist-web` is a production
  build and the harness is compiled out of it by design (below). Note that
  `vite build --mode development` alone is **not** enough — Vite derives
  `import.meta.env.DEV` from `NODE_ENV`, which a plain `vite build` forces to
  `production` regardless of `--mode`. `build:web:dev` sets `NODE_ENV=development` via
  `cross-env` first; that env var is what actually includes the harness.
- **Driving it:** attach `chrome://inspect` to the app's WebView and run
  `await __fsPortContract()`. It prints a `console.table` of every case, the resolved
  roots, and a `passed/total` line. The case count must match the node run — a case
  silently skipped on device is a failure, not a pass.
- **Read the coverage caveat it prints.** Every case runs its scratch directory under
  `roots.userdata` (`Directory.Data`), which needs no runtime permission, so a clean run
  says nothing about `roots.library` (`Directory.Documents`) — the permission-sensitive
  root this whole storage design exists for.
- **Release builds cannot contain it, mechanically.** The call site is behind
  `import.meta.env.DEV` **and** a dynamic `await import()`
  (`src/renderer/main.web.tsx`). `npm run build:web` statically replaces the flag with
  `false`, so Rollup drops the module from `dist-web` entirely; a top-level static import
  would keep it in the bundle even though the branch is unreachable, which is why the
  dynamic import is the whole mechanism rather than a style preference. It is checkable
  rather than trusted — after a production `npm run build:web`,
  `grep -rn "SCRIPTORIUM_DEV_FSPORT_HARNESS" dist-web/` must find nothing.
- Capacitor live-reload would iterate faster but was rejected: it puts a `server.url` into
  `capacitor.config.ts` that must never reach a release build.

## Icons, splash, and system bars

**One generator, three platforms.** `npm run gen:icon`
(`scripts/gen-icon.mjs`) is the only command that regenerates artwork, and it emits all
three targets from the same drawing code: the desktop `resources/icons/icon.ico` (7 sizes),
the three PWA PNGs in `src/renderer/public/icons/`, and **15 Android launcher PNGs** — five
densities (`mipmap-mdpi` … `mipmap-xxxhdpi`) × `ic_launcher_foreground` /
`ic_launcher` / `ic_launcher_round`. Those mipmaps are tracked files, not build output, so
running the script is an edit to the working tree; re-run it after any change to the art.

- **`@capacitor/assets` was deliberately not used**, though it is the obvious tool. It
  wants `sharp` (a native-binary devDependency) plus a 1024px source PNG that does not
  exist in this repo — the art has only ever existed as code. The generator already draws
  the same artwork with zero dependencies, so the choice was between adding a native
  toolchain to consume a source asset that would first have to be invented, or extending
  the generator. Same single-source-of-truth intent, different tool.
- **Adaptive icon** (API 26+): `ic_launcher_foreground.png` on a 108dp canvas
  (108/162/216/324/432 px) with the mark inside the **centre 66%**, transparent elsewhere;
  `mipmap-anydpi-v26/ic_launcher{,_round}.xml` composes `@color/ic_launcher_background`
  underneath. 66% is the guaranteed-visible 72dp of that 108dp canvas — anything outside it
  can be cropped, and the launcher additionally *parallaxes* the layer, moving the visible
  window around. This replaced Capacitor's template
  vector drawables (`drawable-v24/ic_launcher_foreground.xml`,
  `drawable/ic_launcher_background.xml`), now deleted.
- **Legacy icon** (pre-API 26): `ic_launcher` / `ic_launcher_round` on a 48dp canvas
  (48/72/96/144/192 px), opaque frame background, art at 86% because nothing crops these;
  the round one is circle-masked in the generator.
- **66% and the PWA maskable icon's 80% are different numbers on purpose.** They answer to
  different specs — the Android adaptive-icon safe zone and the W3C maskable-icon safe zone
  — and the adaptive one additionally has to survive parallax. Do not "unify" them.

**Splash.** Eleven checked-in `splash.png` files (`drawable/` plus five densities ×
two orientations) are gone, replaced by a single `res/drawable/splash.xml` layer-list:
frame colour, launcher mark centred. A layer-list is resolution- and
orientation-independent, so the density buckets bought nothing but eleven binaries to keep
in sync with the art. **A `splash.png` and a `splash.xml` cannot coexist in one drawable
bucket** — same resource name, duplicate-resource build error — which is why the PNGs are
deleted rather than left behind, and why `android-theme.test.ts` fails if one creeps back.

What actually paints the launch screen is `windowSplashScreenBackground` on
`AppTheme.NoActionBarLaunch` (androidx `core-splashscreen`), which covers both the API 31+
and the API 24–30 path from one attribute. `@drawable/splash` is reached through
`android:background` — a *View* attribute, not a window one — so it is close to inert; it
is kept because Capacitor's inherited theme references it and the reference must resolve,
and it draws the same thing so the two can never disagree on screen.

**One colour, six copies, one test.** `#3a2a1d` — `--book-frame` — is declared in
`src/renderer/theme/book.css`, as `THEME_COLOR` in `src/renderer/pwa/manifest.ts`, as the
`FRAME` byte literals in `scripts/gen-icon.mjs`, in `res/values/colors.xml`
(`scriptorium_frame`), in `res/values/ic_launcher_background.xml`, and as
`android.backgroundColor` in `capacitor.config.ts`. Nothing links them: Gradle cannot import
a `.ts` module and neither can a dependency-free `.mjs` script, and Capacitor's config takes
a hex string, not a resource reference. So **`src/platform/capacitor/android-theme.test.ts`
is the enforcement mechanism, not a nicety** — it reads each file off disk and compares
against `THEME_COLOR`. (It does not read `book.css` back; that token is the one copy still
held by convention alone.)

**No white flash, in three stages.** Each stage of launch has its own background and all
three are the frame colour:

| Stage | Set by |
| --- | --- |
| Launch screen, before the activity exists | `windowSplashScreenBackground` on `AppTheme.NoActionBarLaunch` |
| Between splash teardown and the WebView's first paint — and behind the transparent system bars, which `SystemBars.setStyle` copies from here onto the decor view | `android:windowBackground` on `AppTheme.NoActionBar` (was `@null`, i.e. Android white) |
| The WebView's own background | `android.backgroundColor` in `capacitor.config.ts` |

**System bars: core plugin, no extra dependencies.** Neither `@capacitor/status-bar`
nor `@capacitor/keyboard` is installed. Capacitor 8 ships **`SystemBars` as a core plugin
inside `@capacitor/android`**
(`capacitor/src/main/java/com/getcapacitor/plugin/SystemBars.java`), and it already styles
both bars, pads the WebView by the
system-bar insets on API 35+, corrects for the IME, and injects `--safe-area-inset-*` CSS
variables. Installing either suggested plugin would add a second thing fighting for the
same window flags, for behaviour that is already there.

- `plugins.SystemBars.style: 'DARK'` in `capacitor.config.ts`. **In Capacitor's vocabulary
  `DARK` names the background, not the icons** — it maps to
  `setAppearanceLightStatusBars(false)`, i.e. *light* icons, which is what a `#3a2a1d`
  frame needs. Left unset the style follows the device's light/dark setting, so a
  light-mode device draws dark icons on dark leather.
- **Edge-to-edge is deliberately off.** With `insetsHandling` at its `'css'` default and no
  `viewport-fit=cover` in `src/renderer/index.web.html`, `SystemBars` pads the WebView's
  parent by the insets and web content never sits under system UI — nothing in the renderer
  has to know about safe areas. Turning it truly on means adding `viewport-fit=cover` *and*
  reworking the top and bottom bars against `--safe-area-inset-*`: renderer work, for no
  gain on a tablet whose UI is already a dark inset panel inside the same frame colour.

## Versioning

**`package.json` is the only place the semver lives.**
`android/app/build.gradle` reads `package.json` at configure time with Groovy's
`JsonSlurper`. `versionName` is the `version` field verbatim; `versionCode` is
`major * 10000 + minor * 100 + patch` — **`1.6.0` → `10600`**. The packing has been confirmed
by reading it back out of a real APK, at 1.5.0 → 10500 (see
[Verification status](#verification-status)); `npm run verify:apk` now makes that read-back a
routine pre-upload check rather than a one-off.
A second hand-edited copy of the version in Gradle is a copy that drifts, and the failure is
quiet: the desktop release says 1.6.0 while the APK still claims 1.0, and nobody finds out
until an install is refused.

- **Anything the packing can't represent fails the build**, loudly, with a
  `GradleException`: a version string that is not strict `MAJOR.MINOR.PATCH`, or any
  component ≥ 100 (two digits each, so a minor of 100 would carry into the major's digits).
  A silently-wrong `versionCode` gives an APK that either cannot install over its
  predecessor at all, or — if an older build ends up outranking a newer one — installs
  *over* it as a silent downgrade, which on this app means someone's library meeting older
  storage code.
- Project convention is unchanged: **features bump minor, verification builds bump patch.**
- `src/platform/capacitor/android-version.test.ts` re-implements the packing in TypeScript
  and asserts no literal `versionName` / `versionCode` has been reintroduced into
  `build.gradle` — so a well-meaning "let me just bump it here" edit fails in `npm test`
  rather than at the next release.

**Cutting a release build.**

1. Bump `version` in `package.json`.
2. `npm run build:web`.
3. `npx cap sync android` — or `npm run sync:android`, which does steps 2 and 3 together.
4. Build the signed release in Android Studio, or
   `./android/gradlew.bat -p android :app:assembleRelease`, which lands at
   `android/app/build/outputs/apk/release/app-release.apk` (~4.6 MB). `:app:bundleRelease`
   for an `.aab`.
5. Install on the device and verify.

**Do not skip step 3, even when only native config changed.**
`android/app/src/main/assets/capacitor.config.json` is *generated* and gitignored — it is
what the app actually reads at runtime. Every edit to
`capacitor.config.ts`, including `backgroundColor` and the `SystemBars` style above,
reaches the device only through a `cap sync`. Skip it and the change is silently inert on
device: the build succeeds, the APK installs, and the setting simply isn't there. This
compounds the service-worker staleness trap above — between the two, a "nothing changed"
result after installing a new APK is more likely to be a sync or a stale worker than a
broken change.

## Release signing

Release signing is configured in
`android/app/build.gradle` from `android/keystore.properties`;
`android/keystore.properties.example` is the committed template and documents each key.

- **`*.jks`, `*.keystore` and `keystore.properties` are gitignored at the repository
  root**, which uncomments what Capacitor's own `android/.gitignore` ships commented out.
  Only the `.example` is tracked.
- **The signing key is the app's identity, and there is no recovery.** Android identifies an
  installed app by the pair (`applicationId`, signing key). Under Play App Signing that pair is
  Google's to keep: an *upload* key that is lost can be rotated, because the authority sits with
  the store. This app is distributed by its author — sideloaded from GitHub Releases, never
  Play (the all-files-access permission closes that door; see
  [Storage and permissions](#storage-and-permissions)) — and sideloading has no such authority
  behind it. The key that signs the APK **is** what the device compares on every upgrade. Lose
  it and no future build can ever update an existing install of
  `com.juliashtal.scriptoriumwriter`: the only route to a newer version is uninstall and
  reinstall, which discards `Directory.Data` — `settings.json` with `libraryPath` and
  `lastLibraryBackupAt` — though the library under `Documents` survives (see
  [Uninstall behaviour](#uninstall-behaviour)). Leak it and anyone can publish an "update" that
  devices accept without complaint. So: exactly one copy, outside the repository, backed up
  somewhere durable together with its passwords.
- **Users get no platform check, so give them one.** Play vets the publisher before an app
  reaches anyone; a sideloaded APK vets nothing — a downloaded file is just a downloaded file,
  and the install dialog says nothing about who built it. Two published values close that gap:
  the release certificate's **SHA-256 fingerprint**, quoted in this section and committed to
  `android/release-fingerprint.txt`, and the APK's own **SHA-256 checksum**, published on each
  release. Neither exists yet — nothing has been released, so there is no certificate to quote;
  both are written down as part of cutting the first release. A user can then confirm both
  before installing:

  ```bash
  sha256sum Scriptorium-Writer-1.6.0.apk
  apksigner verify --print-certs Scriptorium-Writer-1.6.0.apk
  ```

  The checksum is per file and differs with every build; **the fingerprint never changes across
  releases**, because it is the key. A fingerprint that has moved means a different key signed
  the APK — a compromise, or a key that was replaced — and after the first release, replacing
  it is not a thing that can be done quietly: every existing install would have to be
  uninstalled first. A changed fingerprint is a reason to stop, not to update.
- **`npm run verify:apk` is the author-side half of that same check.**
  `scripts/verify-apk.mjs`, run by hand on the built APK before it is uploaded, asserts that
  the APK is signed at all; that it carries a v2 or v3 signature, since a v1-only APK on
  `minSdk 30` means the signing config did not apply the way it was meant to; and that
  `versionCode`/`versionName` read back out of the artifact (via `aapt2`, skipped with a note
  if it isn't installed) match `package.json`, which catches a stale APK left in
  `android/app/build/outputs/` by an earlier build. It prints the certificate's SHA-256
  fingerprint and, once `android/release-fingerprint.txt` exists, requires the APK to match it
  — so the published fingerprint is enforced rather than remembered. That file is committed
  once, after the first release build, from the digest the script prints; until then the
  comparison is skipped with a note and the rest still runs. The script needs `ANDROID_HOME`
  (or `ANDROID_SDK_ROOT`) set, and reads only public certificate material — never the keystore.
- **Gradle applies the signing config only when `keystore.properties` exists**, and warns
  in the build log when it doesn't. A keystore-less fresh clone therefore still configures
  — Gradle sync and debug builds work — instead of failing outright, while an unsigned
  release APK, which looks identical to a signed one until a device refuses to install it, is
  never a silent outcome. A half-filled `keystore.properties` fails immediately rather than
  surfacing much later as an opaque "keystore was tampered with". A warning in a build log is
  easy to scroll past, which is the other reason `npm run verify:apk` exists: it turns "was
  this signed?" into an answer before upload rather than after.
- This is **not** Windows code signing. Different certificate, different issuing
  authority, different purpose: Android release signing is a self-signed identity key you
  generate and keep; Windows code signing is a CA-issued certificate you buy to satisfy
  SmartScreen. They look alike and are not.

## Updates

**There is no auto-update on Android, and that is a platform gap rather than an omission.**
The desktop has `electron-updater`; a sideloaded APK has no equivalent — nothing polls
a feed, nothing prompts. **Updates are manual reinstalls:** download the newer APK from the
GitHub release, check it against the published checksum and fingerprint
([Release signing](#release-signing)), and install it over the old one. It must carry a higher
`versionCode` and be signed with the **same key**, or Android refuses the install outright
rather than offering to replace the app — which is also why a lost key strands every existing
install rather than merely inconveniencing the next build. (The in-app "Update" strip
from the PWA is a *service-worker* update of the web bundle inside an already
installed APK — a different mechanism at a different layer, and not a way to ship native
changes.)

## Verification status

What has been checked, from the build output: a signed release APK builds and reports
`versionCode='10500' versionName='1.5.0'` for `com.juliashtal.scriptoriumwriter`, signed by
`CN=Julia Shtal`; its resource table carries `color/scriptorium_frame`,
`color/ic_launcher_background`, `drawable/splash`, and all five densities of each mipmap.
That was read off the build output by hand; the signature and version half of it is now
`npm run verify:apk` ([Release signing](#release-signing)), which is the check that has to pass
before an APK is uploaded anywhere.

Everything below needs eyes on a physical tablet and **has not been checked yet**:

- the launcher mask on both round and squircle launchers;
- the splash screen and the absence of a white flash on launch;
- `versionName` as shown in Android's app-info screen;
- installing a new APK over an older one and confirming the library is preserved;
- the central storage claim — that with all-files access held, a library written by a
  previous install, or unpacked from a PC, is readable after uninstall and reinstall.

Until those come back confirmed, treat the Android build as beta and keep `.zip` exports.
