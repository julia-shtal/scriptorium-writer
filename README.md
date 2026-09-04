<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/readme/banner-dark.svg">
    <img src="assets/readme/banner-light.svg" alt="Scriptorium Writer" width="760">
  </picture>
</p>

# Scriptorium Writer

*A desktop writing room for long-form fiction — offline, crash-safe, and warm to look at.*
*Electron · React · TypeScript · TipTap. Single user, offline-first, Windows.*

<p align="center">
  <a href="#install"><picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/readme/sprite-quill-dark.svg">
    <img src="assets/readme/sprite-quill.svg" width="20" alt="">
  </picture> For writers</a> ·
  <a href="#development"><picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/readme/sprite-dividers-dark.svg">
    <img src="assets/readme/sprite-dividers.svg" width="20" alt="">
  </picture> For developers</a> ·
  <a href="#reliability-first"><picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/readme/sprite-seal-dark.svg">
    <img src="assets/readme/sprite-seal.svg" width="20" alt="">
  </picture> Reliability first</a> ·
  <a href="#data-on-disk"><picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/readme/sprite-pages-dark.svg">
    <img src="assets/readme/sprite-pages.svg" width="20" alt="">
  </picture> Data on disk</a>
</p>

<p align="center">
  <a href="#platform-status">Platform status</a> ·
  <a href="docs/">Documentation</a> ·
  <a href="../../releases/latest">Download</a>
</p>

> **Writing a book and just want the app?**
> Read the setup guide in [English](docs/writers-guide.en.md) or
> [Русский](docs/writers-guide.ru.md). No development tools required.

<p align="center">✳✳✳</p>

## What it is

**Scriptorium Writer** is a local-first desktop app for writing long books. It looks like a
warm parchment page in a leather frame, saves constantly and safely, keeps a full version
history of every chapter, and checks spelling in **Russian and English at the same time** —
all completely offline. Your stories live in a plain, syncable folder on your own computer,
one file per chapter, not locked inside a database. Priorities, in order: **(1) reliability
of your data, (2) comfort of writing, (3) warm "book" aesthetics.**

## Reliability first

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

## Features

| Capability | What it does |
| --- | --- |
| **Book-themed editor** | Parchment TipTap page: marks, alignment, undo/redo, first-line-indent toggle, `✳✳✳` dividers, focus mode. |
| **Autosave & quit guard** | 2 s debounce + 2 min interval + lifecycle flush, all on manual Save's write path; never exits with unsaved work. |
| **Version history** | A timestamped snapshot per save; preview an older draft read-only, or restore it (snapshotting the current state first). |
| **Footnotes** | Inline footnotes with `[N]` markers auto-numbered by document order — hover to read, select to edit; lossless round-trip. |
| **Offline spellcheck (RU + EN)** | Simultaneous RU + EN Chromium spellcheck from bundled dictionaries, with suggestions and add-to-dictionary — no network. |
| **Navigation & views** | Sidebar router: Editor, Chapters (drag-to-reorder), Story info, Notes, Search, Statistics, Library, Settings. |
| **Cleanup wand** | Text-cleanup rules (spacing, punctuation, `-`→`—`, quotes→«…») applied as one undoable transaction behind a preview. |
| **Find & Replace** | Non-modal bar with live highlighting, case-sensitive and whole-word toggles, and a single-transaction Replace-all. |
| **Full-text search** | Read-only sweep of every chapter and every notes section for a phrase, with hit counts, snippets, and jump-to-match. |
| **Import / Export** | Import a `.md`/`.docx` as one chapter or split by headings; export any chapter or the whole story to `.docx`/`.md`. |
| **Library backup** | One click zips the whole library folder (stories, snapshots, notes, `.trash/`) to a chosen path — atomic, read-only. |
| **Auto-update** | Packaged builds check GitHub Releases in the background and offer a restart routed through the quit-guard flush. |
| **UI language (RU / EN)** | Switch the whole interface between Russian and English live from Settings — never touches your story text. |

Per-feature detail: [docs/features.md](docs/features.md).

## Platform status

| Platform | Status | How it ships |
| --- | --- | --- |
| Windows 10/11 | Stable — current release 1.5.0 | NSIS installer, auto-update |
| Browser / PWA | Unreleased, works | Self-hosted |
| Android tablet | Unreleased, beta — on-device verification incomplete | Sideloaded APK, manual updates |

Detail: [docs/web-pwa.md](docs/web-pwa.md) and [docs/android.md](docs/android.md).

<p align="center">✳✳✳</p>

## Install

Download the Windows installer from the
[Releases](https://github.com/julia-shtal/scriptorium-writer/releases/latest) page.

Windows will show a "Windows protected your PC" warning because the installer has no paid
code-signing certificate yet — click "More info", then "Run anyway".

No-code walkthroughs: [English](docs/writers-guide.en.md) ·
[Russian](docs/writers-guide.ru.md).

<p align="center">✳✳✳</p>

## Development

### Requirements

- **Node.js ≥ 22.12 (LTS)** — the Electron 43 / electron-builder 26 toolchain `require()`s
  ESM-only dependencies, so on older Node `npm run build:win` fails with `ERR_REQUIRE_ESM`.
  Windows: `winget install OpenJS.NodeJS.LTS`, then open a new terminal.
- npm 10+ (bundled with Node; Node 24 ships npm 11).
- Building the Android app additionally needs Android Studio, JDK 21 and SDK Platform 36 —
  see [docs/android.md](docs/android.md).

### Quick start

```bash
npm install
npm run dev      # opens the book-themed editor on a seeded demo chapter
```

> **npm 11 note:** npm 11 blocks package install scripts by default, so
> `npm install` may not download the Electron binary. If `npm run dev` fails with
> `Error: Electron uninstall`, fetch it once with
> `node node_modules/electron/install.js` (or allow it via
> `npm approve-scripts electron`), then re-run `npm run dev`.

### Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Launch the app in development with HMR and DevTools. |
| `npm run dev:web` | Launch the browser build on a LAN-reachable dev server. |
| `npm run build` | Typecheck, then build main / preload / renderer into `out/`. |
| `npm run build:web` | Typecheck, then build the browser bundle into `dist-web/`. |
| `npm run build:win` | Full build + package a Windows NSIS installer into `release/`. |
| `npm run start` | Preview the production build (`electron-vite preview`). |
| `npm run typecheck` | Type-check the node (main/preload/shared) and web (renderer) projects. |
| `npm run lint` | ESLint over `src` (`.ts`/`.tsx`). |
| `npm run test` | Run the Vitest unit suite once (data layer, Node env). |
| `npm run test:watch` | Run Vitest in watch mode. |
| `npm run test:browser` | Run the browser-only suite in real Chromium via Vitest browser mode. |
| `npm run format` | Prettier-format `src`. |
| `npm run sync:android` | Build the web bundle, then `npx cap sync android`. |
| `npm run build:web:dev` | Build the browser bundle in development mode (keeps the DEV harness). |
| `npm run sync:android:dev` | `build:web:dev` + `npx cap sync android` — the on-device debug loop. |
| `npm run open:android` | `npx cap open android`. Does not build or sync first. |
| `npm run run:android` | Build the web bundle, then `npx cap run android` (syncs and deploys). |

## Architecture

- **main** (`src/main/`) — window lifecycle, IPC handlers, spellcheck, docx/zip, and the
  Electron wiring that hands `FileService` a Node filesystem port.
- **data** (`src/data/`) — the platform-neutral data layer: atomic writes, snapshots,
  scan/restore, Markdown backup. All disk work goes through an injected `FsPort`.
- **platform** (`src/platform/{node,web,capacitor}/`) — one `FsPort` implementation each,
  over `node:fs`, OPFS, and `@capacitor/filesystem`. All three pass one shared contract.
- **preload** (`src/preload/`) — a typed `contextBridge` `window.api` surface; thin
  wrappers over `ipcRenderer.invoke`.
- **renderer** (`src/renderer/`) — React UI. **Never imports `fs`, `path`, or any Node
  built-in.** Enforced by `contextIsolation: true` / `nodeIntegration: false`.
- **shared** (`src/shared/`) — domain types (the IPC contract), schema-version constants,
  errors, and the word-count and footnote-markdown helpers, imported by all three processes.

Detail: [docs/architecture.md](docs/architecture.md).

## Data on disk

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

`NN-slug` filenames are for human legibility only; the app always resolves chapters by the
stable `id` stored **inside** each file, so files may be renamed safely. Because they exist
to be read by a human they follow the chapter title — renaming a chapter renames its `.json`
and `.md` on the next save, and reordering renumbers the `NN-` prefixes. Per-platform roots
are in [docs/architecture.md](docs/architecture.md).

<p align="center">✳✳✳</p>

## Documentation

- [docs/writers-guide.en.md](docs/writers-guide.en.md) — install and use the app, no code.
- [docs/writers-guide.ru.md](docs/writers-guide.ru.md) — the same guide in Russian.
- [docs/architecture.md](docs/architecture.md) — processes, the filesystem port, data
  locations, repository layout.
- [docs/android.md](docs/android.md) — the tablet build: storage, permissions, signing,
  verification status.
- [docs/web-pwa.md](docs/web-pwa.md) — the browser build, OPFS, offline and update
  behaviour, backups.
- [docs/features.md](docs/features.md) — per-feature notes on how each capability works.
- [docs/CHANGELOG.md](docs/CHANGELOG.md) — released versions, newest first.

## License

All rights reserved. The source is published for reference; no licence to use, copy, or
distribute is granted.

<p align="center">✳✳✳</p>

<p align="center">
  <sub>Issues & questions → <a href="https://github.com/julia-shtal/scriptorium-writer/issues">github.com/julia-shtal/scriptorium-writer/issues</a></sub>
</p>
