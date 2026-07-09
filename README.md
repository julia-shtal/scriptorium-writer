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
  - Windows install: `winget install OpenJS.NodeJS.LTS`, then open a new terminal.
- npm 10+ (ships with Node 22).

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` | Launch the app in development with HMR (renderer) and DevTools. |
| `npm run build` | Typecheck, then build main / preload / renderer into `out/`. |
| `npm run build:win` | Full build + package a Windows **NSIS** installer into `release/`. |
| `npm run typecheck` | Type-check the node (main/preload/shared) and web (renderer) projects. |
| `npm run lint` | ESLint over `src` (`.ts`/`.tsx`). |
| `npm run format` | Prettier-format `src`. |

## Getting started

```bash
npm install
npm run dev      # opens a window; the placeholder shows the result of window.api.ping()
```

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

## Project layout

```
electron.vite.config.ts   # main / preload / renderer build config
electron-builder.yml      # Windows NSIS packaging config
tsconfig.json             # references tsconfig.node.json + tsconfig.web.json
src/
  main/index.ts           # app + window lifecycle, IPC (ping)
  preload/index.ts        # contextBridge → window.api
  preload/index.d.ts      # global Window.api typing
  renderer/
    index.html
    main.tsx              # React entry
    app.tsx               # placeholder (ping check)
  shared/
    types.ts              # domain + IPC contract (single source of truth)
    schema.ts             # schemaVersion constants
out/                      # build output (gitignored)
release/                  # packaged installers (gitignored)
```

## Status

**M0 — Project scaffold.** Toolchain, window, IPC `ping`, and the shared type
skeleton are in place. Later milestones add the data layer (M1), editor (M2),
autosave/versions (M5), and the rest — see `TASKS.md`.

### Known residual

- `vite@5.4.21` carries a low-severity, **dev-server-only** advisory
  (CVE-2026-39365, path traversal in optimized-deps `.map` handling). Vite 5 is
  pinned transitively by `electron-vite@2.3` (electron-vite 4/5, which use Vite 6/7,
  also require Node 22.12+). The dev server only binds locally for this offline app,
  so practical risk is negligible; revisit when moving to electron-vite 5.
