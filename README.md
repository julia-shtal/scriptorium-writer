<!-- Hero -->

<p align="center">
  <b><a href="#-for-writers--для-писателей">🖋 For writers</a></b> ·
  <b><a href="#-for-developers">🛠 For developers</a></b> ·
  <b><a href="#why-its-different--reliability-first">🛡 Reliability first</a></b> ·
  <b><a href="https://github.com/julia-shtal/scriptorium-writer/releases/latest">⬇ Download</a></b>
</p>

<p align="center">
  <i>A desktop writing room for long-form fiction — offline, crash-safe, and warm to look at.<br>
  Electron · React · TypeScript · TipTap. Single user, offline-first, Windows.</i>
</p>

---

## What it is

**Scriptorium Writer** is a local-first desktop app for writing long books. It looks
like a warm parchment page in a leather frame, saves constantly and safely, keeps a
full version history of every chapter, and checks spelling in **Russian and English at
the same time** — all completely offline.

Your stories live in a plain, syncable folder on your own computer — one file per
chapter — not locked inside a database. Priorities, in order: **(1) reliability of your
data, (2) comfort of writing, (3) warm "book" aesthetics.**


## Why it's different — reliability first

Most of this app exists to make sure you never lose a word. Manual **Save** and every
kind of autosave share **one** write path, and that path is always atomic — so a crash,
a full disk, or closing the laptop mid-save can never corrupt what you already wrote.

- **JSON canon + Markdown shadow.** Each chapter is stored as lossless ProseMirror
  JSON (the *only* file the app reads back) plus a best-effort `.md` copy any tool can
  read. The `.md` write can fail without ever endangering the canon.
- **Atomic writes only.** Temp file → `fsync` → `rename`. Never written in place.
- **Version snapshots** on every successful save, pruned to a configurable cap — roll
  any chapter back to an older draft from inside the app.
- **Never blanks corrupt data.** A missing or unparseable canon triggers a one-click
  recovery from the newest snapshot; the bad file is never overwritten silently.
- **Quit guard.** Closing the app waits for a final flush (or a 5-second safety
  timeout) so a stuck window can never lose your last keystrokes — or wedge shut.

## What's inside

| Capability | What it does |
| --- | --- |
| **Book-themed editor** | TipTap/ProseMirror parchment page: italic/bold/strike, alignment, undo/redo, a first-line-indent toggle, `✳✳✳` scene dividers, and a distraction-free **focus mode**. |
| **Autosave & quit guard** | 2 s debounce + 2 min dirty-interval + lifecycle flush, all sharing manual Save's single write path; the quit guard never lets the app exit with unsaved work. |
| **Version history** | A timestamped snapshot per save; preview any older draft read-only, or restore it (restoring snapshots the current state first). |
| **Footnotes** | Inline footnotes with `[N]` markers auto-numbered by document order — hover to read, select to edit; round-trip losslessly. |
| **Offline spellcheck (RU + EN)** | Simultaneous Russian + English Chromium spellcheck from bundled dictionaries, with native suggestions and add-to-dictionary — no network. |
| **Navigation & views** | Sidebar router: Editor, Chapters (native drag-to-reorder), Story info, Notes codex, Statistics + writing streak, Library, Settings — settings apply live. |
| **Cleanup wand** | Runs pluggable text-cleanup rules (spacing, punctuation, `-`→`—` em dash, straight `"` → «guillemets») over a selection or the whole chapter as one undoable transaction behind a diff preview. |
| **Find & Replace** | Non-modal bar with live highlighting, case-sensitive / whole-word (Cyrillic-aware) toggles, and a single-transaction Replace-all. |
| **Full-text search** | Read-only «Поиск» view sweeps every chapter's canon and all Notes sections for a phrase, listing per-source hit counts with context snippets; a chapter hit opens the chapter with the Find bar seeded to highlight in place. |
| **Import / Export** | Import a `.md`/`.docx` file as one chapter or split by headings; export any chapter or the whole story to `.docx`/`.md`. |
| **Library backup** | One click zips the entire library folder (stories, snapshots, notes, `.trash/`) to a chosen path — atomic, read-only against your data. |
| **Auto-update** | Packaged builds check GitHub Releases in the background and offer a dismissible restart that routes through the same quit-guard flush. |
| **UI language (RU / EN)** | Switch the whole interface between Русский and English live from Settings — no restart. Defaults to Russian; only the app's own chrome and system messages change, never your story text. |

---

## 🖋 For Writers / Для писателей

If you just want to open the app and write — this part is for you. No code: download,
open, write. Available in English and Russian.

<details>
<summary><strong>🇬🇧 Read in English</strong></summary>

**What this is.** A Windows app for writing long fiction comfortably: a warm,
book-page look, autosave, version history (roll back to an older draft of a
chapter), footnotes, and spellcheck in Russian and English at the same time — all
of it working offline.

### How to install

1. Open the [**Releases**](https://github.com/julia-shtal/scriptorium-writer/releases/latest) page.
2. Under **Assets**, download `Scriptorium Writer Setup <version>.exe`.
3. Run the downloaded file.
4. Windows will likely show a **"Windows protected your PC"** warning — that's
   expected; the installer just doesn't have a paid code-signing certificate yet.
   Click **"More info"**, then **"Run anyway"**.
5. Go through the normal install wizard — the defaults are fine. A shortcut appears
   on the desktop and in the Start menu.
6. Launch Scriptorium Writer. The first run opens a demo chapter, just so there's
   something to look at — delete it and start your own story whenever you like.

### Where your stories live

Every story lives in a plain folder on your computer:

```
Documents/Scriptorium-Writer/
```

It's a normal folder, not a locked-away database inside the app. You can:

- copy it to a USB drive;
- sync it through OneDrive, Dropbox, Google Drive, or anything similar;
- open it in File Explorer and see what's inside (one file per chapter).

### If something goes wrong

- Every save creates a version snapshot — older drafts of a chapter never disappear;
  you can view and restore them from **version history** inside the app.
- The app never overwrites a good file with a broken one — if something's wrong, it
  offers to restore the chapter from its last good snapshot.
- If you close the app while it's still saving, it waits for the save to finish
  before it actually closes.

If a problem isn't solved by any of this, [open an issue on
GitHub](https://github.com/julia-shtal/scriptorium-writer/issues) or reach out to
the author directly.

</details>

<details>
<summary><strong>🇷🇺 Читать по-русски</strong></summary>

**Что это.** Программа для Windows, в которой удобно писать длинные истории: тёплое
оформление под книжную страницу, автосохранение, история версий (можно откатиться к
более старому варианту главы), сноски, орфография сразу на русском и английском — и
всё это работает без интернета.

### Как установить

1. Откройте страницу [**Releases**](https://github.com/julia-shtal/scriptorium-writer/releases/latest).
2. В разделе **Assets** скачайте файл `Scriptorium Writer Setup <версия>.exe`.
3. Запустите скачанный файл.
4. Windows, скорее всего, покажет предупреждение **«Windows защитил ваш
   компьютер»** — это нормально, просто у установщика пока нет платной цифровой
   подписи. Нажмите **«Дополнительно»**, затем **«Выполнить в любом случае»**.
5. Пройдите обычный мастер установки — можно оставить все настройки по умолчанию.
   На рабочем столе и в меню «Пуск» появится ярлык.
6. Запустите Scriptorium Writer. При первом запуске откроется демонстрационная
   глава — просто чтобы было с чем начать. Её можно удалить и начать свою историю.

### Где хранятся ваши истории

Все истории лежат в обычной папке на компьютере:

```
Документы/Scriptorium-Writer/
```

Это обычная папка, а не закрытая база данных где-то внутри программы. Её можно:

- скопировать на флешку;
- синхронизировать через Яндекс.Диск, Dropbox, Google Диск или любой похожий сервис;
- открыть в проводнике и посмотреть, что внутри (там по одному файлу на главу).

### Если что-то пошло не так

- Каждое сохранение создаёт снимок версии — старые варианты главы никуда не
  пропадают, их можно посмотреть и вернуть через **историю версий** внутри
  программы.
- Программа никогда не сохраняет повреждённый файл поверх исправного — если
  что-то не так, она предложит восстановить главу из последнего исправного снимка.
- Если закрыть программу во время печати, она сама дождётся, пока сохранение
  закончится, и только потом закроется.

Если проблема не решается этими шагами — [создайте issue на
GitHub](https://github.com/julia-shtal/scriptorium-writer/issues) или напишите
автору напрямую.

</details>

---

## 🛠 For Developers

Architecture, scripts, the on-disk data format, and how the pieces fit together.
Design source of truth: [`docs/SPEC.md`](docs/SPEC.md).

### Requirements

- **Node.js ≥ 22.12 (LTS)** — required by the current Electron 43 / electron-builder
  26 toolchain, which `require()`s ESM-only dependencies (only supported on Node
  22.12+). On older Node, `npm run build:win` fails with `ERR_REQUIRE_ESM`.
  - Windows install: `winget install OpenJS.NodeJS.LTS` (currently installs Node 24
    LTS), then open a new terminal.
- npm 10+ (bundled with Node; Node 24 ships npm 11).

Needed only if you're building the Android app (skip these for desktop-only work):

- **Android Studio** — SDK manager, Gradle sync, and on-device deployment all go
  through it. Only the `android/` directory is opened there; IntelliJ IDEA remains the
  editor for everything under `src/`.
- **JDK 21** — pinned by the generated project (`android/app/capacitor.build.gradle`,
  `sourceCompatibility`/`targetCompatibility VERSION_21`). Android Studio bundles a
  compatible JDK, so a separate install usually isn't needed.
- **Android SDK Platform 36**, minimum API 30 — set in `android/variables.gradle`
  (`compileSdkVersion`/`targetSdkVersion 36`, `minSdkVersion 30`). Install via Android
  Studio's SDK Manager. Capacitor itself only needs API 24; MC3 raised the floor from 24
  to 30 because the all-files-access permission the library depends on, and the
  `Environment.isExternalStorageManager()` call that reads its state, are both API 30+.
  See "Storage and permissions on Android (MC3)" below.
- **USB debugging enabled on the tablet** (Settings → About → tap Build number 7
  times to unlock Developer options, then enable USB debugging) for `npm run
  run:android` and on-device testing.

### Getting started (from source)

```bash
npm install
npm run dev      # opens the book-themed editor on a seeded demo chapter
```

`npm run dev` opens the book-framed writing surface. On first run the app seeds a
demo story so there is something to edit; edits persist through the `window.api`
IPC bridge, proving the main → preload (contextBridge) → renderer path end to end.

> **npm 11 note:** npm 11 blocks package install scripts by default, so
> `npm install` may not download the Electron binary. If `npm run dev` fails with
> `Error: Electron uninstall`, fetch it once with
> `node node_modules/electron/install.js` (or allow it via
> `npm approve-scripts electron`), then re-run `npm run dev`.

### Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Launch the app in development with HMR (renderer) and DevTools. |
| `npm run dev:web` | Launch the browser build (MP3) on a LAN-reachable dev server (see below). |
| `npm run build` | Typecheck, then build main / preload / renderer into `out/`. |
| `npm run build:web` | Typecheck, then build the browser bundle into `dist-web/`. |
| `npm run build:win` | Full build + package a Windows **NSIS** installer into `release/`. |
| `npm run start` | Preview the production build (`electron-vite preview`). |
| `npm run typecheck` | Type-check the node (main/preload/shared) and web (renderer) projects. |
| `npm run lint` | ESLint over `src` (`.ts`/`.tsx`). |
| `npm run test` | Run the Vitest unit suite (data layer, Node env) once. |
| `npm run test:watch` | Run Vitest in watch mode. |
| `npm run test:browser` | Run the browser-only suite (`*.browser.test.ts`, e.g. the OPFS `FsPort` contract) in real Chromium via Vitest browser mode. |
| `npm run format` | Prettier-format `src`. |
| `npm run sync:android` | Build the web bundle, then `npx cap sync android` (copies `dist-web` into the native project and installs any native plugin dependencies). |
| `npm run build:web:dev` | Build the browser bundle in **development** mode (`NODE_ENV=development`), which is what keeps the DEV-only on-device harness in the output. Not for release. |
| `npm run sync:android:dev` | `build:web:dev` + `npx cap sync android` — the debug loop that puts `window.__fsPortContract()` on the tablet (see Android build below). |
| `npm run open:android` | `npx cap open android` — opens the project in Android Studio. **Does not build or sync first** (see Android build below). |
| `npm run run:android` | Build the web bundle, then `npx cap run android` (syncs and deploys to a connected/USB-debugging-enabled device or emulator). |

### Web build (MP3)

The same React renderer also builds as a plain browser app — a second Vite target
(`vite.web.config.ts`) that reuses `src/renderer` with a browser composition root
(`main.web.tsx` → `createWebPlatform()`), no Electron, no preload.

- `npm run dev:web` — serves the web build at the root URL (`http://localhost:5173/`),
  with `--host` so a tablet on the same LAN can reach it. Storage is **OPFS-backed**
  (Origin Private File System), so your stories **persist across page reloads**.
- `npm run build:web` — typechecks, then bundles the browser build into `dist-web/`.

The persistent browser `FsPort` — `OpfsFsPort` (Origin Private File System) — is
implemented in `src/platform/web/`, proven against the shared `FsPort` contract in
real Chromium, and wired into `createWebPlatform()` (MP4). Because the reliable OPFS
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

#### PWA (MP7)

The web build is an installable, offline-capable PWA:

- **Install:** open the served URL in Chrome and choose "Установить приложение" /
  add-to-home-screen. It launches standalone (no browser chrome) with the book icon and
  the leather-frame splash colour (`--book-frame`).
- **Offline:** a service worker (`vite-plugin-pwa`, Workbox `generateSW`) precaches the
  app shell (JS/CSS/bundled fonts/icons). After the first load the app opens with no
  network — the library lives in OPFS. There is intentionally **no** runtime network
  caching, because the app makes no network requests after load.
- **Updates:** `registerType: 'prompt'` — a new deploy shows a dismissible "Доступна
  новая версия" strip (`WebUpdateNotice`) instead of reloading unprompted; the user taps
  "Обновить" when ready. This is separate from the desktop `UpdateNotice`, sharing only
  the visual style.
- **Dev over HTTPS:** `npm run dev:web` uses `vite-plugin-mkcert` to serve HTTPS, required
  for service-worker registration and OPFS persistence when testing from a tablet on the
  LAN. The first time, install the mkcert local CA on the tablet (or tap through the
  certificate warning).
- **Icons:** `npm run gen:icon` emits the desktop `.ico` and the PWA PNGs (192, 512, and a
  512 maskable) into `src/renderer/public/icons/` from one source of truth.

On touch devices the web build adapts without changing the desktop UI: hover-only
controls become visible, tap targets grow to ~44px, and the editor column uses dynamic
viewport height (`dvh` + `interactive-widget=resizes-content`) so the soft keyboard never
covers the Find & Replace or cleanup bars. These are gated on `(pointer: coarse)`, so the
desktop layout is unchanged.

**Backups on the web build (MP9).** The browser stores your library in OPFS, which the
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

The Electron build is unchanged and still owns `src/renderer/index.html`
(→ `main.electron.tsx`).

Spellcheck in the web build is provided by the device's own system (e.g. the
Android keyboard), not by the app's bundled dictionaries — the desktop build is
unaffected and still checks offline with the bundled Hunspell dictionaries.

#### Android build (MC1–MC4)

Capacitor wraps the same `dist-web` bundle from the web build above in an Android
WebView container — one shared bundle that picks its platform implementation at the
composition root (`src/renderer/main.web.tsx:36`, the single runtime platform check in
the codebase). Storage under it is **not** OPFS: `CapacitorFsPort`
(`src/platform/capacitor/fs-port.ts`) writes ordinary files through
`@capacitor/filesystem`, so the library is a real folder you can open in the device's
file manager and copy over USB — which is the whole reason the Capacitor block exists.
Because MP2 put a port in front of `FileService`, this is one new `FsPort`
implementation plus one swap at the composition root; the atomic write path, snapshot
pruning and recovery scan are the desktop code, unchanged, and `createWebPlatform` and
`createCapacitorPlatform` share a single `createPlatformFromFsPort` wiring helper so the
`'/userdata'` / `'/library'` literals live in exactly one place.

The WebView still runs on a secure-context origin (`androidScheme: 'https'` in
`capacitor.config.ts`, so the origin is `https://localhost`). That is no longer about
OPFS — it is what keeps the service worker, the update prompt and the rest of the
browser-side machinery from the PWA section working inside the container. It is also why
there is no migration path from an installed PWA; see "Moving between the PWA and the
Android app" below.

**Where things live on Android.** Three roots, each resolved once at boot into a plain
absolute path (`resolveCapacitorRoots`, `src/platform/capacitor/roots.ts:105`) and passed
to the plugin absolute thereafter, with the `directory` parameter omitted — so
`CapacitorFsPort` itself knows nothing about `Directory` and has the same shape as
`NodeFsPort`, which is what lets it pass the same contract suite. The `Directory`
constants live only in `roots.ts`, used once each, so MC3 could have changed them in one
place — it did not need to. They are unchanged, which is what keeps
`android/app/src/main/res/xml/file_paths.xml` and its `<external-path>` element valid; that
coupling breaks at runtime when the user taps Share, not at build time.

| Root | On the device | Why there |
| --- | --- | --- |
| **Library** (your stories) | `Documents/Scriptorium-Writer` (`Directory.Documents`) | Visible in the file manager and over USB. Same tree as desktop: `stories/<id>/chapters/…`, `versions/`, `notes/`, `.trash/`. Reading it back after a reinstall, or reading files a PC put there, needs all-files access — see MC3 below. |
| **Exports** | `Documents/Scriptorium-Writer-exports` (`Directory.Documents`) | A **sibling** of the library, never inside it — `readLibraryEntries` walks the library root recursively, so nested exports would make every archive swallow the previous ones. |
| **Settings / userdata** | app-private `Directory.Data` + `userdata/` | `settings.json` holds `libraryPath`, so settings must be findable *without* knowing `libraryPath` — which rules out putting them in the library folder, or anywhere else the user is expected to point at. `Directory.Data` also needs no permission at all, so even with all-files access withheld the app still reads its own settings and can show the permission gate rather than a dead screen. The trade is that app-private storage does not survive an uninstall; see below. |

**Storage and permissions on Android (MC3).** The tablet under test is an **Honor YLE-W09,
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

**The app requests `MANAGE_EXTERNAL_STORAGE` — "All files access", «Доступ ко всем
файлам».** This is a large permission for a writing app and it is taken deliberately, with
both sides of the trade written down.

*What it buys*, and nothing smaller buys either:

- **The library survives uninstall and reinstall.** Without it, the reinstalled app cannot
  read the files the previous install left in `Documents` — see the measurement below.
- **Files placed from a PC over USB are readable.** Unzipping a library export into
  `Documents/Scriptorium-Writer` from the Windows machine is the only restore path the app
  has on Android, and the desktop → tablet half of the round trip depends on it.

*What it costs:* **Google Play will not approve `MANAGE_EXTERNAL_STORAGE` for a writing
app** — it is granted to file-manager-class apps with a specific justification. So MC6
distribution is **sideloaded APKs only** (`docs/mobile/MC6-distribution.md`, Option A);
Play remains closed as long as this permission is held. The Storage Access Framework is the
recorded alternative for the day that trade needs revisiting (`docs/TASKS-backlog.md`), and
it is deferred because URI-based paths do not fit `FsPort`'s plain-absolute-path model
without rewriting how the data layer handles paths.

*If the permission is denied:* the app **gates and does not touch the library at all**. It
shows a full-screen rationale with a route into the system All-files-access screen and
re-checks when it regains focus; there is no "continue anyway". That is not caution for its
own sake — without the permission the app is exactly as blind as the MC2 measurement below
describes, and the previous behaviour on that path was to write a fresh demo story on top of
work it could not see.

**Uninstalling — stated per platform, because they are not at parity.** On Windows,
`deleteAppDataOnUninstall` is unset in `electron-builder.yml` and therefore defaults to
false, so the desktop `userData` folder under `AppData/Roaming` normally survives an
uninstall. On Android, `Directory.Data` does **not** survive one: uninstalling drops
`settings.json` with it, including `libraryPath` and `lastLibraryBackupAt`. The library
itself is a different question, and it is the question MC3 exists to answer.

**Measured in MC2, on the target tablet** (Honor YLE-W09, Android 16 / API 36,
`targetSdkVersion = 36`, **no storage permission declared**): the library files **survived
an uninstall on disk but the reinstalled app could no longer read them**. Uninstall clears
the MediaStore ownership of everything the app wrote (`owner_package_name` → NULL) and the
files keep the old install's uid with mode `770`; under scoped storage an app may only
reach files in shared storage that it owns. So `listStories()` came back **empty rather
than failing** — and an empty list is indistinguishable from a genuinely empty library, so
the app seeded a fresh demo story beside writing it could not see. Three of them
accumulated over one MC2 test session. The same mechanism made PC-placed files invisible,
which is why there was no restore path on Android at all.

**What MC3 changes, and what is still unconfirmed.** With all-files access held, the
ownership rule does not apply, so a library written by a previous install — or unpacked
from the PC — should be readable again. The demo-seeding half of the failure is closed in
code regardless of what the OS does: `bootstrapLibrary` returns without seeding and without
stamping `demoSeeded` whenever access is withheld, and that is covered by the unit suite.
The durability half is a claim about Android, not about this repository, and it is
**pending device confirmation** — scenario 3 of
[`docs/mobile/MC3-device-acceptance.md`](docs/mobile/MC3-device-acceptance.md) is the check,
and only the tablet can answer it. Until that checklist comes back filled in, keep taking
the `.zip` exports before any uninstall.

**Export on Android (MC2).** Library, story, and chapter export write **real files** to
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

**Moving between the PWA and the Android app: export a zip, import it.** There is no
in-app migration, and that is a decision rather than an omission. OPFS is origin-keyed;
the Capacitor WebView's origin is `https://localhost` (see `androidScheme` above), while
a PWA installed from a dev server or any hosted URL sits on a different origin
altogether. The native app therefore cannot see the PWA's OPFS data at all — a
PWA→native migration is not merely awkward to write, it is impossible from inside the
app. The supported route is **Export library** → `.zip` on one side, import on the other,
in either direction, which is a further reason native export had to land in the same
milestone as native storage rather than after it.

Any MC1-era OPFS data still sitting on a device is left exactly where it is, on purpose.
No cleanup code deletes storage the app no longer reads: the disk cost is trivial, and
the blast radius of a bug in code whose job is to delete things is someone's writing.

- **Build loop:** `npm run sync:android` → `npm run open:android` → Run in Android
  Studio. `npm run run:android` builds, syncs, and deploys straight to a connected
  device without opening the IDE — but only after Android Studio has opened the
  project at least once. Opening it writes the gitignored `android/local.properties`
  with the SDK location (`android/.gitignore:27`), which Gradle needs and which
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
  the in-app update strip is accepted («Обновить») or app data is cleared. If the app
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

**The on-device `FsPort` contract harness (dev only).** `CapacitorFsPort` is the third
implementation to run the shared contract cases in `src/data/fs-port.contract.ts` — the
payoff of the MP2 port design. No test runner can reach it, though: the Node project
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
  root the milestone exists for.
- **Release builds cannot contain it, mechanically.** The call site is behind
  `import.meta.env.DEV` **and** a dynamic `await import()`
  (`src/renderer/main.web.tsx:45`). `npm run build:web` statically replaces the flag with
  `false`, so Rollup drops the module from `dist-web` entirely; a top-level static import
  would keep it in the bundle even though the branch is unreachable, which is why the
  dynamic import is the whole mechanism rather than a style preference. It is checkable
  rather than trusted — after a production `npm run build:web`,
  `grep -rn "SCRIPTORIUM_DEV_FSPORT_HARNESS" dist-web/` must find nothing.
- Capacitor live-reload would iterate faster but was rejected: it puts a `server.url` into
  `capacitor.config.ts` that must never reach a release build.

**Icons: one generator, three platforms (MC4).** `npm run gen:icon`
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

**Splash (MC4).** Eleven checked-in `splash.png` files (`drawable/` plus five densities ×
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

**One colour, six copies, one test (MC4).** `#3a2a1d` — `--book-frame` — is declared in
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

**System bars: core plugin, no extra dependencies (MC4).** Neither `@capacitor/status-bar`
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

**Versioning: `package.json` is the only place the semver lives (MC4).**
`android/app/build.gradle` reads `package.json` at configure time with Groovy's
`JsonSlurper`. `versionName` is the `version` field verbatim; `versionCode` is
`major * 10000 + minor * 100 + patch` — **`1.5.0` → `10500`**, confirmed in the built APK.
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
`android/app/src/main/assets/capacitor.config.json` is *generated* and gitignored
(`android/.gitignore:99`) — it is what the app actually reads at runtime. Every edit to
`capacitor.config.ts`, including `backgroundColor` and the `SystemBars` style above,
reaches the device only through a `cap sync`. Skip it and the change is silently inert on
device: the build succeeds, the APK installs, and the setting simply isn't there. This
compounds the service-worker staleness trap above — between the two, a "nothing changed"
result after installing a new APK is more likely to be a sync or a stale worker than a
broken change.

**Keystore and signing (MC4).** Release signing is configured in
`android/app/build.gradle` from `android/keystore.properties`;
`android/keystore.properties.example` is the committed template and documents each key.

- **`android/scriptorium-upload.jks` and `android/keystore.properties` are gitignored and
  must never be committed.** Verified with `git check-ignore -v`: both are caught by the
  repo-root `.gitignore` (`*.jks`, `keystore.properties`), which uncomments what Capacitor's
  own `android/.gitignore:57` ships commented out. Only the `.example` is tracked.
- **Back the keystore up somewhere durable and outside the repository.** Android identifies
  an installed app by (`applicationId`, signing key). Lose the key and no future build can
  ever update `com.juliashtal.scriptoriumwriter`; leak it and anyone can publish an
  "update" that devices will accept.
- **Gradle applies the signing config only when `keystore.properties` exists**, and warns
  in the build log when it doesn't. A keystore-less fresh clone therefore still configures
  — Gradle sync and debug builds work — instead of failing outright, while an unsigned
  release APK, which looks identical to a signed one until a device or Play rejects it, is
  never a silent outcome. A half-filled `keystore.properties` fails immediately rather than
  surfacing much later as an opaque "keystore was tampered with".
- **The current keystore uses a placeholder password, and it was generated in an
  AI-assisted session, so it exists in an assistant transcript. Treat it as public.**
  Regenerating the keystore costs nothing *right now* — nothing has been distributed, so no
  install exists to break. After the first APK goes to anyone, the same change costs every
  installed user an uninstall-and-reinstall, which on Android also loses `settings.json`
  (see the uninstall caveat above). The window is open and it closes on first distribution.
- This is **not** the Windows code-signing item (M11 in the local `docs/TASKS-backlog.md`,
  which is gitignored and not browsable on GitHub). Different certificate, different issuing
  authority, different purpose: Android release signing is a self-signed identity key you
  generate and keep; Windows code signing is a CA-issued certificate you buy to satisfy
  SmartScreen. They look alike and are not.

**There is no auto-update on Android, and that is a platform gap rather than an omission.**
The desktop has `electron-updater` (M12); a sideloaded APK has no equivalent — nothing polls
a feed, nothing prompts. **Updates are manual reinstalls:** install an APK with a higher
`versionCode` over the old one. It must be signed with the **same key**, or Android refuses
the install outright rather than offering to replace the app. (The in-app «Обновить» strip
from the PWA section is a *service-worker* update of the web bundle inside an already
installed APK — a different mechanism at a different layer, and not a way to ship native
changes.)

**What MC4 verified, and what it did not.** A signed release APK builds and reports
`versionCode='10500' versionName='1.5.0'` for `com.juliashtal.scriptoriumwriter`, signed by
`CN=Julia Shtal`; its resource table carries `color/scriptorium_frame`,
`color/ic_launcher_background`, `drawable/splash`, and all five densities of each mipmap.
Everything that needs eyes on a screen — the launcher mask on both round and squircle
launchers, the splash and the absence of a white flash, `versionName` in Android's app-info
screen, and install-over-preserving the library — is **on-device verification and belongs to
MC5**; none of it has been checked yet.

### Architecture

Standard Electron three-process split. The
security boundary is strict and must not be weakened:

- **main** (`src/main/`) — window lifecycle, IPC handlers, spellcheck, docx/zip, and
  the Electron wiring that hands `FileService` a Node filesystem port.
- **data** (`src/data/`) — the platform-neutral data layer: `FileService` (atomic
  writes, snapshots, scan/restore), Markdown backup, path helpers. All disk work goes
  through an injected `FsPort` (`src/data/fs-port.ts`) — no direct Node imports, with one
  remaining exception: `exportLibraryArchive` still reaches into `src/main/library-archive`
  (Node + `archiver`), to be hoisted behind a port in a later milestone.
- **platform** (`src/platform/node/`, `src/platform/web/`, `src/platform/capacitor/`) —
  per-platform `FsPort` implementations. `NodeFsPort` (a thin adapter over
  `node:fs/promises`) for Electron; `OpfsFsPort` (+ `opfs-worker.ts`) over the browser
  Origin Private File System, plus `MemoryFsPort` scaffolding; `CapacitorFsPort` over
  `@capacitor/filesystem` for Android (MC2), which plugged in here without touching the
  data layer, exactly as the port design intended. All three pass the same
  `src/data/fs-port.contract.ts` cases.
- **preload** (`src/preload/`) — a typed `contextBridge` `window.api` surface; thin
  wrappers over `ipcRenderer.invoke`.
- **renderer** (`src/renderer/`) — React UI. **Never imports `fs`, `path`, or any Node
  built-in.** All disk/OS work goes through `window.api`. Enforced by
  `contextIsolation: true` / `nodeIntegration: false`.

Shared domain types live once in `src/shared/types.ts` and are imported by all three
processes; schema-version constants live in `src/shared/schema.ts`. The book theme is
driven entirely by CSS tokens in `src/renderer/theme/book.css` (palette + page-stack
texture — no hard-coded colours elsewhere).

### Where data lives

- **Library** (your stories) — a plain, syncable folder. Default:
  `Documents/Scriptorium-Writer/`. A normal directory you can back up, sync, or open
  in a file manager. Settings → «Экспортировать библиотеку» also bundles the whole
  folder into a single `.zip` in one click.
- **Settings** — per-machine, in Electron's `userData/settings.json`, which holds
  `libraryPath` so each machine knows where its library is. Deliberate: settings stay
  per-machine while the library travels.

On Android the same split holds with different roots — library in
`Documents/Scriptorium-Writer`, exports in the sibling `Documents/Scriptorium-Writer-exports`,
settings in app-private `Directory.Data`. Two things differ from Windows: reaching the
library needs the all-files-access permission, and the uninstall behaviour is **not** the
same. Settings there shows the location as «Документы / Scriptorium-Writer» with no
reveal-in-folder control, because the raw `/storage/emulated/0/…` path means nothing to a
tablet user and Android has no reliable universal file-manager intent to reveal it with.
See "Storage and permissions on Android (MC3)" above.

**On-disk layout**

```
Scriptorium-Writer/               ← library root (libraryPath)
  stories/
    <story-id>/
      story.json                  ← StoryMeta + chapterOrder + schemaVersion
      chapters/
        01-slug.json              ← Chapter canon (ProseMirror JSON) — SOURCE OF TRUTH
        01-slug.md                ← Human-readable Markdown backup (lossy, write-only)
      versions/
        <chapterId>/
          2026-07-09T10-15-00-123Z.json   ← per-chapter snapshots (pruned to a cap)
      notes/
        notes.json
  .trash/                         ← soft-deleted stories/chapters land here
```

`NN-slug` filenames are for human legibility only; the app always resolves chapters by
the stable `id` stored **inside** each file, never by trusting a filename — so files
may be renamed safely. Because they exist to be read by a human, they **follow the
chapter title**: renaming a chapter renames its `.json` and `.md` on the next save (and
reordering renumbers the `NN-` prefixes). The one thing that never changes is the
`versions/<chapterId>/` folder — that id is the chapter's identity, so it keeps the slug
of whatever the chapter was called when it was created. Alignment lives in the JSON canon
(Markdown can't carry it), which is why the canon is JSON, not Markdown.

### Project layout

```
electron.vite.config.ts   # main / preload / renderer build config
electron-builder.yml      # Windows NSIS packaging + GitHub publish (auto-update) config
src/
  main/                   # Electron wiring: IPC, spellcheck, docx/zip, auto-update, library-archive
  data/                   # Platform-neutral data layer: FileService, atomic-write, snapshots, markdown, paths (injected FsPort — no Node imports)
  platform/node/          # NodeFsPort — the Node/Electron FsPort implementation (only place in the data path that touches node:fs)
  platform/web/           # OpfsFsPort (+ opfs-worker) over OPFS, and MemoryFsPort scaffolding — browser FsPort implementations (no node: imports)
  platform/capacitor/     # Capacitor (Android): composition root, FsPort over @capacitor/filesystem, native export + Share sheet
  preload/                # contextBridge → window.api (typed, decodes AppError)
  renderer/
    theme/book.css        # book theme tokens + page-stack texture
    store/                # zustand stores: editorStore, storyStore, settingsStore, uiStore
    editor/               # TipTap editor, toolbar, footer, SceneDivider + Footnote, cleanup wand, find & replace, import
    views/                # Editor, Library, Chapters, StoryInfo, Notes, Statistics, Settings, VersionHistory
    components/           # AppFrame (leather frame + grid), Sidebar
  shared/                 # types.ts (IPC contract), schema.ts, errors.ts, word-count.ts, footnote-markdown.ts
out/                      # build output (gitignored)
release/                  # packaged installers (gitignored)
assets/readme/            # README hero + diagrams (SVG)
```

Unit tests live next to their modules as `*.test.ts` (run by Vitest).

### Feature reference (deep dive)

<details>
<summary>Expand — per-feature notes on how each capability works</summary>

**Editor core.** A TipTap 2 / ProseMirror surface styled as a parchment page
(`src/renderer/editor/`), themed via `book.css`. Content is ProseMirror JSON — the same
canon the data layer persists. The **Tab** control toggles a global `.indent-on` first-line
indent (a per-chapter view preference, not stored tab characters); the scene divider is a
real custom block node (`SceneDivider.ts`). State lives in two small Zustand stores
(`editorStore`, `uiStore`); word counting is single-sourced in `src/shared/word-count.ts`
so the on-screen count equals what main computes on save.

**Autosave & version history.** Manual Save and autosave share one `flush()` write path:
a 2 s debounce, a 2 min dirty-interval, and lifecycle flushes (chapter switch, window
blur, before quit). A main-process **quit guard** delays exit until the renderer confirms
a final flush, or a 5 s safety timeout elapses. **Version History** opens the snapshot list
for the current chapter — preview read-only, or restore (which snapshots the current state
first). On startup, `scanLibrary()` flags any chapter whose canon is missing or won't parse
and offers a one-click restore from its newest snapshot; the corrupt file is never silently
overwritten.

**Footnotes.** A custom inline-atom node (`Footnote.ts`); the toolbar `[?]` inserts one.
Each footnote stores only its text in the canon; the visible `[N]` marker is derived at
render by document order (`footnote-numbering.ts`), never stored — so inserting, deleting,
or moving footnotes always renumbers correctly. Hover a marker to read it; select it to
edit. Footnote text lives in an attribute, so it does not count toward the word count. The
Markdown mapping (`[^n]` + definitions) lives in `src/shared/footnote-markdown.ts`, reused
by the `.md` backup serializer.

**Spellcheck (offline, RU + EN).** Editor-only — it affects Chromium's underlines and
context menu, never persistence. Main starts a loopback HTTP server on `127.0.0.1` and
points `session.setSpellCheckerDictionaryDownloadURL` at it; the server matches Chromium's
version-suffixed request filename by **language prefix**, so the bundled `.bdic` is served
regardless of suffix — surviving Chromium version bumps. Dictionaries
(`resources/dictionaries/*.bdic`) are bundled via electron-builder `extraResources` so
offline spellcheck works in packaged builds too.

**Navigation & views.** The sidebar drives a view router keyed on `uiStore.activeView`:
**РАБОТА** (Editor, Chapters, Story info, Version history, Notes, Search, Statistics) and
**ОБЩЕЕ** (Library, Settings). Chapters supports native HTML5 drag-to-reorder (no dependency). Notes
is a per-story codex (characters / locations / world / timeline + scratchpad), saved
debounced. Statistics shows totals, a per-chapter breakdown, and a daily writing streak
(streak data in renderer `localStorage`, not part of the canon). Settings apply live via
`settingsStore` — font, autosave interval, spellcheck languages (through an
`applySpellLanguages` IPC), and **UI language (RU / EN)** all take effect without a restart.

**UI localization (RU / EN).** Every static interface string and renderer-surfaced
system/error message lives in a hand-rolled, dependency-free dictionary at
`src/renderer/i18n/strings.ts` (parallel `ru` / `en` trees), read through the reactive
`useT()` hook. The active language is `Settings.language`. On a **genuine first run** it is
seeded from the OS locale (`app.getLocale()` — English → `'en'`, otherwise `'ru'`); any
existing install keeps its stored value, and one predating the `language` key stays Russian
(`readSettings`' merge-over-defaults never applies the OS seed). `en` is typed against
`typeof ru`, so a missing/extra key fails `npm run typecheck`, and `strings.test.ts` asserts
identical `ru`/`en` key sets at runtime. Dates render per-locale (`ru-RU` / `en-US`), and
counts are properly pluralized per language — a tiny `plural()` engine (`src/renderer/i18n/plural.ts`)
applies the Russian one/few/many rule and English singular/plural, so word/chapter counts read
"1 слово / 2 слова / 5 слов" and "1 word / 2 words". **Author content — story/chapter/notes
text, titles, footnote text — is never routed through the dictionary and never changes with the
switch.** New chapters seed a language-appropriate default title *at creation time*
(`«Глава 3»` / `"Chapter 3"`, numbered by the position the chapter takes in the story), which
then becomes ordinary author data; existing titles are never rewritten. The first-run demo story stays Russian by design (its body is a Russian
writing sample).

**Cleanup wand.** The toolbar wand (`src/renderer/editor/cleanup/`) runs an ordered set of
pure `(text) => string` rules over the selection — or the whole chapter when nothing is
selected — and applies them as **one undoable transaction** behind an inline diff preview.
Rules: collapse multiple spaces, normalize punctuation spacing, fix stray spaces in
hyphenated words, `-` → em dash `—`, trailing-whitespace trim, and straight double quotes
`"` → Russian guillemets «…». A separate paragraph-start pass also converts a leading
dialogue hyphen (`- Слово` → `— Слово`), applied by `computeSpans.ts` only to a paragraph's
first text node so mid-paragraph hyphens and `-нибудь` stay untouched. Span computation is a
hand-rolled char-level diff (no new dependency); text content only — marks and node
structure are never altered. Preview is decoration-only and suppresses autosave so no
snapshot of the uncommitted state is taken.

**Find & Replace.** A non-modal bar for the open chapter (**Ctrl+F** / **Ctrl+H**, or the
🔍 toolbar button) rendered below the text so it shrinks the page rather than covering a
match. Live highlighting via ProseMirror decorations, an accurate `N / M` counter,
Enter/F3 navigation (wrapping), case-sensitive and whole-word (Cyrillic-aware) toggles.
Matching is literal substring, never spanning a paragraph break or footnote. Replace-all
runs in one transaction (one Ctrl+Z) reusing the wand's shared span-replace builder, so
autosave/dirty/snapshots react automatically.

**Full-text search.** The «Поиск» sidebar view runs a read-only, in-memory sweep of the
open story on submit: every chapter's canon plus every Notes section (characters, locations,
world, timeline, scratch). Chapters and notes are read through `window.api` and never
written — a pure read that cannot corrupt the library; a chapter that fails to read is
skipped and surfaced as a soft "couldn't read part of the work" notice rather than
blanking results. Matching is literal, case-insensitive substring over the same canon
text-walker word count uses (`extractPlainText`), so the two always agree on "the text";
results are one row per source with an occurrence count and a context snippet. Clicking a
chapter result opens it in the editor and seeds the M15 Find bar so the matches highlight
in place; a notes result lands on the Notes view.

**Import & export (.docx / .md).** Import a single `.md`/`.docx` file as one chapter, or
split it into one chapter per top-level heading, with a preview dialog before confirming.
Imported chapters go through the exact `createChapter` + `saveChapter` path (atomic writes
+ snapshots). Node-side file work stays in main — `mammoth` (`.docx` → HTML) and `docx`
(canon → `.docx` with native Word footnotes); doc-model parsing stays in the renderer.
Import is a one-time, lossy conversion (tables/images/comments dropped, with an honest
notice); marks, scene dividers and footnotes round-trip. Export reads canon only and writes
with the same temp-then-rename atomic write.

**Library export.** Settings → «Экспортировать библиотеку» streams the entire library
folder into one `.zip` (via `archiver`), including `.trash/`, reproducing the on-disk
`stories/<story-id>/…` layout exactly. Read-only against the library; writes to a `.part`
file and renames over the destination only once complete, so a failure never touches the
source or leaves a truncated archive.

**Markdown backup (.md shadow).** Every successful chapter save also writes a
human-readable Markdown copy beside the `.json` canon, through the same temp-then-rename
atomic write (`src/data/markdown.ts`). Bold/italic/strike map to standard Markdown, the
scene divider to `---`, and footnotes to `[^n]` markers plus a definitions block (reusing
`src/shared/footnote-markdown.ts`); paragraph alignment is intentionally dropped — which is
why the canon stays JSON. The `.md` write is **best-effort**: a failure never fails the save
or touches the canon, surfacing only as a soft «копия .md не сохранена» warning, and
soft-delete / reorder keep the `.md` sibling in sync with its `.json`. v1 never re-imports
from `.md`.

**Typographic quotes.** A cleanup-wand rule turns straight double quotes `"` into Russian
guillemets «…», pairing by open/close alternation per text node. Narrow by design: only
`"` (U+0022) is touched; single quotes/apostrophes are left alone. Runs after the em-dash
rule, through the same preview + single-transaction path.

**Auto-update.** Packaged builds check GitHub Releases in the background via
`electron-updater`'s GitHub provider (no separate update server); `electron-builder.yml`
carries the `publish` block, and `npm run build:win` emits a `latest.yml` manifest. The
check never blocks launch (skipped in dev, fire-and-forget in packaged builds). A
downloaded update shows a dismissible footer notice; "Restart now" routes through the same
quit-guard flush as a normal quit, so no unsaved chapter is lost.

**Minimal footer mode.** A persistent «Минимальная нижняя панель» preference hides the
footer's info line (word count, save status, spellcheck badge) while keeping the
«Сохранить» button. Stored as `Settings.hideEditorFooterInfo`, toggled from a Settings
checkbox and a chapter-header icon. A save **error** always overrides the hidden state and
brings the full info line (with «повторить») back, so failures are never silent.

</details>

<details>
<summary>Milestone history (M0–M23)</summary>

**M23 — Cleanup wand: leading dialogue dash.** A separate paragraph-start pass converts a
leading dialogue hyphen (`- Слово` → `— Слово`, the Russian dialogue convention) to an em
dash, applied by `computeSpans.ts` only to a paragraph's first text node — so mid-paragraph
hyphens (still the existing `-`→`—` rule's job) and hyphenated words like `-нибудь` are left
untouched.

**M22 — Stable «Сохранить» button.** Removes the save-button opacity flicker that fired on
every autosave tick (most visible in minimal footer mode, where the button is the only
footer element). Purely cosmetic — the underlying `flush()` already serializes concurrent
saves, so nothing in the data-layer save path changed.

**M21 — Editor scroll containment.** Contains scrolling to the writing surface so the
toolbar and chapter header (title, chapter switcher, history/focus/export icons) stay put
while typing near the bottom of a long chapter, with reliable caret auto-follow. Scoped to
the editor view only; other views' scrolling is unchanged.

**M20 — Minimal footer mode.** A persistent «Минимальная нижняя панель» preference
(`Settings.hideEditorFooterInfo`) that hides the footer's info line (word count, save
status, spellcheck badge) while keeping the «Сохранить» button. A save **error** overrides
the hidden state so failures are never silent.

**M17 — Quote typography (wand rule).** A new wand rule converting straight double quotes
`"` to Russian guillemets «…» by open/close alternation per text node; narrow by design —
only `"` (U+0022) is touched, apostrophes/single quotes are left alone. Runs after the
em-dash rule through the same preview + single-transaction path.

**M16 — Full-text search.** A read-only «Поиск» sidebar view that sweeps the whole open
story on submit — every chapter's canon plus every Notes section — for a literal,
case-insensitive substring, returning one row per source with an occurrence count and a
context snippet. Reuses the shared canon walker (`extractPlainText`, factored out of the
word-count code so search and word count agree on "the text") and never calls a write API,
so it cannot corrupt the library; a chapter that fails to read is skipped and reported as a
soft notice. A chapter hit opens the chapter and seeds the M15 Find bar to highlight matches
in place; a notes hit lands on the Notes view.

**M15 — Find & Replace.** A non-modal in-chapter find/replace bar (**Ctrl+F** / **Ctrl+H**)
with live decoration highlighting, an accurate `N / M` counter, Enter/F3 wrapping
navigation, case-sensitive and whole-word (Cyrillic-aware) toggles, and a single-transaction
Replace-all reusing the wand's shared span-replace builder — so autosave/dirty/snapshots
react automatically.

**M14 — Import & export (.docx / .md).** Import a `.md`/`.docx` file as one chapter or split
it by top-level headings, and export any chapter or the whole story to `.docx` with native
Word footnotes (also includes the M14.1 UX consolidation). Imports go through the exact
`createChapter` + `saveChapter` atomic-write path; export reads canon only and never touches
the source library.

**M13 — Library export.** A one-click "Экспортировать библиотеку" action in Settings
streams the whole library folder into a single `.zip` via `archiver`, including `.trash/`,
reproducing the on-disk layout exactly on extraction; writes to a `.part` file and renames
over the destination only once complete.

**M12 — Auto-update.** Packaged builds check GitHub Releases in the background via
`electron-updater`'s GitHub provider (no separate update server). The check never blocks or
delays launch (skipped in dev, fire-and-forget in packaged builds); a downloaded update
shows a dismissible restart notice that routes through the M5 quit-guard flush.

**M10 — electron-vite 5 / Vite upgrade.** Moved the build toolchain onto
`electron-vite@5` (Vite 7 / Vitest 3), clearing the old dev-server-only Vite advisory
flagged under *Known residual*; the M4 spellcheck dict-server and `configureSpellcheck()`
ordering were verified unchanged, and `npm audit` now reports 0 vulnerabilities.

**M9 — Packaging & release.** A Windows **NSIS** installer with app icon and per-user
install, bundling `resources/dictionaries` so offline spellcheck works in the packaged app,
plus a "Reveal library in Explorer" action in Settings.

**M8 — Cleanup wand (minimal rules).** The toolbar wand runs a pluggable, ordered set of
pure text-cleanup rules over the selection — or the whole chapter when nothing is selected
— behind an inline diff preview, applied as a single undoable transaction that preserves
marks and never alters node structure.

**M7 — Markdown backup export.** Every successful chapter save also writes a
human-readable `.md` backup beside the `.json` canon (paragraph alignment intentionally
dropped). Best-effort: a failure never fails the save or touches the canon, and surfaces as
a soft "копия .md не сохранена" warning. Soft-delete and reordering keep the `.md` sibling
in sync with its `.json`.

**M6 — Navigation & views.** The sidebar-driven view router and all remaining views
(Library, Chapters with drag-to-reorder, Story info, Notes, Statistics, Settings) around
the editor + version-history views. Settings apply live (font, autosave interval,
spellcheck languages via a new `applySpellLanguages` IPC).

**M5 — Autosave + version history.** A single `flush()` write path shared by manual Save, a
2 s debounce, a 2 min dirty-interval, and lifecycle flushes; a main-process quit guard that
delays exit until the renderer confirms a final flush (or a 5 s timeout); a Version History
view; and a startup crash-recovery prompt that restores a corrupt/missing chapter from its
newest snapshot without ever silently overwriting the bad file.

**M4 — Spellcheck (RU + EN, offline).** Simultaneous Russian + English Chromium spellcheck
served from bundled `.bdic` dictionaries by a loopback prefix-matching server, with a native
suggestion / add-to-dictionary context menu.

**M3 — Footnotes.** A custom inline-atom footnote node with an auto-numbered `[N]` marker
(numbering derived by document order, never stored), a hover popover to read the text and a
select-to-edit field to change it, wired to the toolbar `[?]` button. Text is stored
losslessly in the canon and survives save/reload and version snapshots.

**M2 — Editor core.** The TipTap writing surface: book-themed parchment page, toolbar
(marks, alignment, undo/redo, indent toggle, scene divider), live word count, focus mode, a
collapsible sidebar, and a manual Save that persists through `window.api` and reloads
identically. A demo story is seeded on first run.

**M1 — Data layer.** The reliability backbone: `FileService` with atomic writes,
library/story/chapter read-write, version snapshots + pruning, soft delete to `.trash/`,
corrupt/missing-canon startup scan, and the full typed `window.api` over IPC. Unit-tested
with Vitest.

**M0 — Project scaffold** (toolchain, window, IPC `ping`, shared type skeleton).

</details>

### Known residual

- None. The build toolchain runs on `electron-vite@5` / `vite@7` / `vitest@3`, and
  `npm audit` reports **0 vulnerabilities**.

---

<p align="center">
  <sub>Issues & questions → <a href="https://github.com/julia-shtal/scriptorium-writer/issues">github.com/julia-shtal/scriptorium-writer/issues</a></sub>
</p>
