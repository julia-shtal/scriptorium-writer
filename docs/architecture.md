# Architecture

How the processes are split, how the filesystem port keeps one data layer running on
three platforms, where the data lives, and what the repository contains.

## Process split

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
  `@capacitor/filesystem` for Android, which plugged in here without touching the
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

## The `FsPort` and its composition roots

The data layer never chooses its filesystem. Each build has a composition root that picks
an implementation and hands it in:

- Electron — `src/main/`, `NodeFsPort`.
- Browser — `main.web.tsx` → `createWebPlatform()`, `OpfsFsPort`.
- Android — `main.web.tsx` → `createCapacitorPlatform()`, `CapacitorFsPort`.

`createWebPlatform` and `createCapacitorPlatform` share a single `createPlatformFromFsPort`
wiring helper, so the `'/userdata'` / `'/library'` literals live in exactly one place, and
`src/renderer/main.web.tsx` holds the single runtime platform check in the codebase.

All three implementations are held to one shared suite, `src/data/fs-port.contract.ts`:
the Node cases run under Vitest's node project, the OPFS cases in real Chromium via
`npm run test:browser`, and the Capacitor cases on the device through a DEV-only harness
(see [android.md](android.md)). A port that passes the contract can be swapped in without
touching the atomic write path, snapshot pruning, or the recovery scan.

## Where data lives

- **Library** (your stories) — a plain, syncable folder. Default:
  `Documents/Scriptorium-Writer/`. A normal directory you can back up, sync, or open
  in a file manager. Settings → "Export library" also bundles the whole
  folder into a single `.zip` in one click.
- **Settings** — per-machine, in Electron's `userData/settings.json`, which holds
  `libraryPath` so each machine knows where its library is. Deliberate: settings stay
  per-machine while the library travels.

On Android the same split holds with different roots — library in
`Documents/Scriptorium-Writer`, exports in the sibling `Documents/Scriptorium-Writer-exports`,
settings in app-private `Directory.Data`. Two things differ from Windows: reaching the
library needs the all-files-access permission, and the uninstall behaviour is **not** the
same. Settings there shows the location as "Documents / Scriptorium-Writer" with no
reveal-in-folder control, because the raw `/storage/emulated/0/…` path means nothing to a
tablet user and Android has no reliable universal file-manager intent to reveal it with.
See [Storage and permissions](android.md#storage-and-permissions) for the detail.

In the browser build the library lives in OPFS instead, which is evictable — see
[web-pwa.md](web-pwa.md).

## On-disk layout

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

## Project layout

```
electron.vite.config.ts   # main / preload / renderer build config
vite.web.config.ts        # browser build target (dist-web), reuses src/renderer
vitest.config.ts          # Vitest projects: node suite + browser-mode suite
electron-builder.yml      # Windows NSIS packaging + GitHub publish (auto-update) config
capacitor.config.ts       # Android container config: appId, scheme, SystemBars, colours
android/                  # Capacitor's Gradle project — hand-editable, tracked on purpose
resources/                # bundled at package time: dictionaries/ (.bdic), icons/
scripts/                  # gen-icon.mjs — desktop .ico, PWA PNGs, Android mipmaps
src/
  main/                   # Electron wiring: IPC, spellcheck, docx/zip, auto-update, library-archive
  data/                   # Platform-neutral data layer: FileService, atomic-write, snapshots, markdown, paths (injected FsPort — no Node imports)
  platform/node/          # NodeFsPort — the Node/Electron FsPort implementation (only place in the data path that touches node:fs)
  platform/web/           # OpfsFsPort (+ opfs-worker) over OPFS, and MemoryFsPort scaffolding — browser FsPort implementations (no node: imports)
  platform/capacitor/     # Capacitor (Android): composition root, FsPort over @capacitor/filesystem, native export + Share sheet
  preload/                # contextBridge → window.api (typed, decodes AppError)
  renderer/
    theme/book.css        # book theme tokens + page-stack texture
    i18n/                 # RU/EN string dictionary + pluralization
    pwa/                  # web manifest + service-worker update notice
    store/                # zustand stores: editorStore, storyStore, settingsStore, uiStore
    editor/               # TipTap editor, toolbar, footer, SceneDivider + Footnote, cleanup wand, find & replace, import
    views/                # Editor, Library, Chapters, StoryInfo, Notes, Search, Statistics, Settings, VersionHistory
    components/           # AppFrame (leather frame + grid), Sidebar
  shared/                 # types.ts (IPC contract), schema.ts, errors.ts, word-count.ts, footnote-markdown.ts
```

Unit tests live next to their modules as `*.test.ts` (run by Vitest).
