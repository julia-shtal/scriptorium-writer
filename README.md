# scriptorium-writer

A local-first desktop editor for writing long-form fiction, styled like the warm
pages of a book. Offline, crash-safe autosave, RU/EN spellcheck.

Built with **Electron + electron-vite + React + TypeScript + TipTap**. Single user,
offline-first. Priorities, in order: (1) reliability of data, (2) comfort of use,
(3) warm "book" aesthetics.

See `SPEC.md` for the full design and `TASKS.md` for the milestone breakdown.

## Requirements

- **Node.js ≥ 22.12 (LTS)** — required by the current Electron 43 / electron-builder
  26 toolchain, which `require()`s ESM-only dependencies (only supported on Node
  22.12+). On older Node, `npm run build:win` fails with `ERR_REQUIRE_ESM`.
  - Windows install: `winget install OpenJS.NodeJS.LTS` (currently installs Node 24
    LTS), then open a new terminal.
- npm 10+ (bundled with Node; Node 24 ships npm 11).

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` | Launch the app in development with HMR (renderer) and DevTools. |
| `npm run build` | Typecheck, then build main / preload / renderer into `out/`. |
| `npm run build:win` | Full build + package a Windows **NSIS** installer into `release/`. |
| `npm run start` | Preview the production build (`electron-vite preview`). |
| `npm run typecheck` | Type-check the node (main/preload/shared) and web (renderer) projects. |
| `npm run lint` | ESLint over `src` (`.ts`/`.tsx`). |
| `npm run test` | Run the Vitest unit suite (data layer) once. |
| `npm run test:watch` | Run Vitest in watch mode. |
| `npm run format` | Prettier-format `src`. |

## Getting started

```bash
npm install
npm run dev      # opens a window; the placeholder shows the result of window.api.ping()
```

> **npm 11 note:** npm 11 blocks package install scripts by default, so `npm install`
> may not download the Electron binary. If `npm run dev` fails with `Error: Electron
> uninstall`, fetch it once with `node node_modules/electron/install.js` (or allow it
> via `npm approve-scripts electron`), then re-run `npm run dev`.

`npm run dev` opens a window that displays `pong`, fetched over IPC — proving the
main → preload (contextBridge) → renderer path works end to end.

## Architecture

Standard Electron three-process split (see `SPEC.md` §3). The security boundary is
strict and must not be weakened:

- **main** (`src/main/`) — window lifecycle, IPC handlers, and (from M1) all
  filesystem I/O via `FileService`.
- **preload** (`src/preload/`) — a typed `contextBridge` `window.api` surface; thin
  wrappers over `ipcRenderer.invoke`.
- **renderer** (`src/renderer/`) — React UI. **Never imports `fs`, `path`, or any
  Node built-in.** All disk/OS work goes through `window.api`. Enforced by
  `contextIsolation: true` / `nodeIntegration: false`.

Shared domain types live once in `src/shared/types.ts` and are imported by all three
processes. Schema-version constants live in `src/shared/schema.ts`.

## Data layer (M1)

All persistence lives in the main-process `FileService` (`src/main/file-service.ts`)
and is exposed to the renderer as the typed `window.api` surface (contract in
`src/shared/types.ts`, registered in `src/main/ipc.ts`, wrapped in
`src/preload/index.ts`). The renderer never touches `fs`.

**Where data lives**

- **Library** (your stories) — a plain, syncable folder. Default:
  `Documents/Scriptorium-Writer/`. It is a normal directory you can back up, sync, or open
  in a file manager.
- **Settings** — per-machine, in Electron's `userData/settings.json`. Settings hold
  `libraryPath`, so each machine knows where its library is (override the library
  location by changing `libraryPath`). This is a deliberate choice: settings stay
  per-machine while the library travels.

**On-disk layout**

```
Scriptorium-Writer/               ← library root (libraryPath)
  stories/
    <story-id>/
      story.json                  ← StoryMeta + chapterOrder + schemaVersion
      chapters/
        01-slug.json              ← Chapter canon (ProseMirror JSON) — SOURCE OF TRUTH
      versions/
        <chapterId>/
          2026-07-09T10-15-00-123Z.json   ← per-chapter snapshots (pruned to a cap)
      notes/
        notes.json
  .trash/                         ← soft-deleted stories/chapters land here
```

`NN-slug` filenames are for human legibility only; the app always resolves chapters
by the stable `id` stored **inside** each file, never by trusting a filename, so
files may be renamed safely. The Markdown backup copy (`.md`) is **not** written yet
— that lands in M7 (a `// TODO(M7)` marks the slot in `saveChapter`).

**Reliability guarantees** (SPEC §5, enforced + unit-tested):

- **Atomic writes** — every data file is written to a temp file, `fsync`ed, then
  `rename`d over the target. A crash mid-write can never corrupt the existing file.
- **Version snapshots** — each successful `saveChapter` writes a timestamped snapshot
  and prunes to `maxVersionsPerChapter` (default 20).
- **Never blank corrupt data** — a canon that is missing or fails to parse is surfaced
  via `scanLibrary()` (with the newest restorable snapshot) and a typed
  `CHAPTER_CORRUPT` error, never silently overwritten.
- **Soft delete** — stories and chapters move to `.trash/`, never hard-deleted.
- Errors cross IPC as a typed `AppError` (code + message), not raw Node errors.

Run the data-layer tests with `npm run test`.

## Project layout

```
electron.vite.config.ts   # main / preload / renderer build config
electron-builder.yml      # Windows NSIS packaging config
tsconfig.json             # references tsconfig.node.json + tsconfig.web.json
src/
  main/
    index.ts              # app + window lifecycle, constructs FileService, wires IPC
    ipc.ts                # ipcMain.handle registrations → FileService (typed)
    file-service.ts       # ALL disk I/O: atomic writes, snapshots, scan/restore
    paths.ts              # library path resolution, slug/filename helpers
    atomic-write.ts       # tmp + fsync + rename atomic write helper
    word-count.ts         # word count from a ProseMirror doc (computed in main)
  preload/index.ts        # contextBridge → window.api (typed, decodes AppError)
  preload/index.d.ts      # global Window.api typing
  renderer/
    index.html
    main.tsx              # React entry
    app.tsx               # placeholder (ping check)
  shared/
    types.ts              # domain + IPC contract (single source of truth)
    schema.ts             # schemaVersion constants
    errors.ts             # typed AppError + IPC encode/decode
out/                      # build output (gitignored)
release/                  # packaged installers (gitignored)
```

Unit tests live next to their modules as `*.test.ts` (run by Vitest).

## Status

**M1 — Data layer.** The reliability backbone is in place: `FileService` with atomic
writes, library/story/chapter read-write, version snapshots + pruning, soft delete to
`.trash/`, corrupt/missing-canon startup scan, and the full typed `window.api` over
IPC. Unit-tested with Vitest (`npm run test`). Next up: the editor (M2), then
autosave/versions UI (M5) — see `TASKS.md`.

Earlier: **M0 — Project scaffold** (toolchain, window, IPC `ping`, shared type
skeleton).

### Known residual

- `vite@5.4.21` carries a low-severity, **dev-server-only** advisory
  (CVE-2026-39365, path traversal in optimized-deps `.map` handling). Vite 5 is
  pinned transitively by `electron-vite@2.3` (electron-vite 4/5, which use Vite 6/7,
  also require Node 22.12+). The dev server only binds locally for this offline app,
  so practical risk is negligible; revisit when moving to electron-vite 5.
