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
npm run dev      # opens the book-themed editor on a seeded demo chapter
```

> **npm 11 note:** npm 11 blocks package install scripts by default, so `npm install`
> may not download the Electron binary. If `npm run dev` fails with `Error: Electron
> uninstall`, fetch it once with `node node_modules/electron/install.js` (or allow it
> via `npm approve-scripts electron`), then re-run `npm run dev`.

`npm run dev` opens the book-framed writing surface. On first run the app seeds a demo
story so there is something to edit (a stand-in for the Library/Chapters navigation that
arrives in M6); edits are persisted through the M1 `window.api`, proving the
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
        01-slug.md                ← Human-readable Markdown backup (lossy, write-only)
      versions/
        <chapterId>/
          2026-07-09T10-15-00-123Z.json   ← per-chapter snapshots (pruned to a cap)
      notes/
        notes.json
  .trash/                         ← soft-deleted stories/chapters land here
```

`NN-slug` filenames are for human legibility only; the app always resolves chapters
by the stable `id` stored **inside** each file, never by trusting a filename, so
files may be renamed safely.

### Chapter files: `.json` canon + `.md` backup (M7)

Every successful chapter save writes two files with the same `NN-slug` stem:

- **`NN-slug.json`** — the ProseMirror JSON **canon**. Canonical, lossless, and the
  only file the app ever reads back. It carries everything, including paragraph
  alignment.
- **`NN-slug.md`** — a **human-readable Markdown backup**. Written best-effort right
  after the canon: bold/italic/strike map to standard Markdown, scene dividers to a
  `---` thematic break, and footnotes to `[^n]` markers plus a definitions block.
  **Paragraph alignment is dropped** (Markdown can't represent it) — this is expected
  and acceptable because the `.json` retains it.

The `.md` is **write-only in v1**: it's a backup you (or a Markdown editor) can read,
but the app never re-imports or repairs from it. If the `.md` write ever fails, the
save still succeeds — the `.json` canon is untouched and the editor shows a soft
"копия .md не сохранена" warning.

The `.md` sibling stays in sync with its canon across the chapter lifecycle: soft-delete
moves both files into `.trash/`, and reordering chapters renames both files' `NN` ordinal
prefixes in lockstep so a `.json`/`.md` pair never mismatches or orphans.

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

## Editor (M2)

The writing surface is a **TipTap 2/ProseMirror** editor styled as a parchment book
page (`src/renderer/editor/`), themed entirely with CSS tokens in
`src/renderer/theme/book.css` (palette + page-stack texture from SPEC §10, no hard-coded
colours elsewhere). Its content is ProseMirror JSON — the same canon the M1 data layer
persists.

- **Toolbar** — italic/bold/strike, align left/center/right, undo/redo, a **Tab**
  control that toggles the first-line indent (a per-chapter *view* preference applied as
  a global `.indent-on` CSS class — it does **not** insert tab characters), a `✳✳✳`
  scene-divider (a real custom block node, `SceneDivider.ts`), a `[?]` **footnote**
  button (live — see M3 below), and the cleanup **wand** (live — see M8 below).
- **Footer** — live word count (chapter + selection), a manual **Save** button wired to
  `window.api.saveChapter`, and placeholders for autosave status (M5) and spellcheck
  languages (M4).
- **Focus mode** hides the sidebar and editor chrome; the collapsible sidebar lists the
  SPEC §10 views (only *Editor* is live in M2 — the rest arrive in M6).

State lives in two small Zustand stores (`src/renderer/store/`): `editorStore` (open
chapter, dirty flag, word count, save) and `uiStore` (focus/sidebar/active view). Word
counting is **single-sourced** in `src/shared/word-count.ts` so the on-screen count
equals the count main computes on save. Autosave timers, the quit/switch flush guard,
and version-history UI are intentionally deferred to M5.

## Autosave & version history (M5)

Manual **Save** and autosave share a single write path — there is only one way a
chapter reaches disk. Autosave itself layers three triggers on top of that path:

- **Debounce** — 2 seconds after typing stops.
- **Interval** — every 2 minutes while the chapter is dirty, even mid-typing.
- **Lifecycle flush** — on chapter switch, window blur, and before the app quits.

**Quit guard** — closing the app does not exit immediately. Main asks the renderer to
flush any unsaved changes and delays quitting until it confirms the write is done, or
until a 5-second safety timeout elapses (so a stuck renderer can never wedge the app
open). This guarantees no keystrokes are lost to a closed window.

**Version History** — the history icon in the editor header (a temporary home; it
moves into the sidebar in M6) opens the snapshot list for the current chapter. Pick a
snapshot to preview it read-only, or restore it. Restoring first snapshots the
*current* state (so the version you're leaving is never lost), then writes the
restored content as the new canon.

**Crash recovery** — on startup, `scanLibrary()` flags any chapter whose canon is
missing or fails to parse. The affected chapter is offered for one-click restore from
its newest snapshot; the corrupt file itself is **never** silently overwritten —
restoring reopens the chapter once the newest good snapshot is back in place.

## Footnotes (M3)

Footnotes are a custom **inline atom** TipTap node (`src/renderer/editor/extensions/Footnote.ts`).
The toolbar `[?]` button inserts one at the cursor. Each footnote stores only its text
in the JSON canon (`{ "type": "footnote", "attrs": { "text": "…" } }`); the visible
`[N]` marker number is **derived at render** by document order (`footnote-numbering.ts`),
never stored — so inserting, deleting, or moving footnotes always renumbers correctly.

- **Hover** a marker to read its text in a popover; **select** the marker to edit the
  text in a compact field, closing with `×` or `Esc` (`FootnoteView.tsx`).
- Footnote text lives in an *attribute*, not a text node, so it does **not** count
  toward the chapter word count (by design).
- Footnotes round-trip losslessly through save/reload and appear unchanged in version
  snapshots (the node is registered in the shared `bookExtensions`, used by both the
  live editor and the read-only history preview).
- The Markdown mapping (`[^n]` markers + `[^n]:` definitions) lives in the shared
  helper `src/shared/footnote-markdown.ts`, reused by the M7 `.md` backup serializer
  (`src/main/markdown.ts`) so marker numbers always match the definitions block.

## Spellcheck (offline, M4)

Spellcheck is **editor-only** — it affects Chromium's underlines and the context menu
in the editable surface. It never touches persistence; the `.json` canon (and the M7
`.md` backup) are unaffected.

**Provenance** — `resources/dictionaries/ru.bdic` and `resources/dictionaries/en-US.bdic`
were extracted from the `hunspell_dictionaries.zip` release asset for `electron@43.1.0`
(source filenames `ru-RU-3-0.bdic` and `en-US-10-1.bdic`; the version suffix is stripped
when bundling). Note the naming quirk: that release names the Russian dictionary
`ru-RU`, not `ru` — the prefix-matching described below handles this transparently, so
the stripped `ru.bdic` still serves any `ru-...`-prefixed request.

**How it works offline** — main starts a loopback HTTP server bound to `127.0.0.1` and
points `session.setSpellCheckerDictionaryDownloadURL` at it. The server matches
Chromium's version-suffixed request filename (e.g. `ru-RU-3-0.bdic`) by **language
prefix**, so it serves the bundled `.bdic` regardless of the suffix Chromium asks for —
this survives Chromium version bumps without touching the bundled files. Chromium
caches the dictionary in `userData/Dictionaries` after first use.

**Manual verification (network disabled):**

1. Disable the network. Launch the app. Type a misspelled Russian word and a misspelled
   English word in one paragraph → both underline red.
2. Right-click a misspelled word → correct suggestions appear; click one → it replaces
   the word.
3. Click "Добавить в словарь" (Add to dictionary) → the underline disappears; restart
   the app → the word stays un-underlined (persisted in `userData`).

**Packaging note:** `resources/` (including `resources/dictionaries/`) is bundled via
electron-builder's `extraResources` so offline spellcheck also works in the packaged
app, not just `npm run dev`.

## Navigation & views (M6)

The sidebar drives a view router in `app.tsx` keyed on `uiStore.activeView`. Two sections:
**РАБОТА** (Editor, Chapters, Story info, Version history, Notes, Statistics — scoped to
the open story) and **ОБЩЕЕ** (Library, Settings). The sidebar collapses to give the
editor full width; the Version-history item carries a badge with the open chapter's
snapshot count.

- **Library** — all stories with status, chapter/word counts and last-edited; create,
  open, and soft-delete (inline confirm, no blocking `window.confirm`).
- **Chapters** — the open story's chapters with **native HTML5 drag-to-reorder**
  (persisted via `reorderChapters`; no drag-and-drop dependency), inline rename, add,
  open, soft-delete.
- **Story info** — title, description, tags, status → `updateStoryMeta`.
- **Notes** — per-story codex (characters / locations / world / timeline + a scratchpad),
  loaded via `readNotes` and saved debounced (500 ms) via `saveNotes`.
- **Statistics** — total words, per-chapter breakdown, and a daily writing streak. Streak
  data lives in renderer `localStorage` (`scriptorium:activeDays`) — lightweight, cleared
  with app data; not part of the file canon.
- **Settings** — autosave interval, spellcheck languages (bundled `ru` / `en-US`), editor
  font family/size, max versions per chapter, and the library path (read-only + reveal).

**Live settings.** Changes apply without a restart via `settingsStore`: font family/size
set CSS custom properties (`--editor-font-family` / `--editor-font-size`) the editor
consumes; autosave interval re-arms the timer through `editorStore.configureAutosave`;
spellcheck languages update the footer label and re-check the live Chromium session
through a new `applySpellLanguages` IPC (main calls `session.setSpellCheckerLanguages`),
so the renderer never touches `session` directly.

State is split across small Zustand stores: `storyStore` (open story + chapter list —
the shared truth for Chapters / Story info / the editor switcher), `settingsStore`,
`editorStore`, and `uiStore`.

## Cleanup wand (M8)

The toolbar **wand** (`src/renderer/editor/cleanup/`) runs a minimal, pluggable set of
text-cleanup rules over the current selection — or the whole chapter when nothing is
selected — and applies them as **one undoable transaction** behind an inline diff
preview.

- **Rules** (`rules.ts`) are an ordered list of pure `(text) => string` transforms, each
  a discrete entry so a later milestone can expose per-rule Settings toggles
  (`// TODO(post-v1)`): collapse multiple spaces, normalize spacing around
  `, . ; : ! ?`, fix stray spaces in hyphenated words, ` - ` → em dash ` — `, and trim
  trailing whitespace per line. No quote typography yet (deferred).
- **Span computation** (`computeSpans.ts`) walks the text nodes overlapping the range and
  turns each node's rule output into tight edit spans via a **hand-rolled char-level diff**
  (no new dependency). Footnote markers and `hard_break` are natural run boundaries; a
  partial selection **rounds up to the full boundary text node** (the rules are
  context-sensitive), documented in the function's JSDoc. Text content only — marks and
  node structure are never altered.
- **Preview** is decoration-only: `wandPreviewPlugin.ts` shows the old text struck through
  (`--muted`) with the proposed new text inline (`--accent`); the editor goes read-only and
  autosave is suppressed via the `editorStore.wandPreviewActive` flag so no snapshot of the
  uncommitted state is taken.
- A fixed **action bar** (`WandActionBar.tsx`, not a modal) confirms (Enter) or cancels
  (Esc). Confirm builds a single `tr` — spans applied rightmost-first, each preserving the
  marks at its position, tagged `wandCleanup` — so the whole cleanup is one Ctrl+Z. Cancel
  leaves the document byte-identical. Zero proposed edits show a brief "Нечего чистить" note
  instead of entering preview.

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
  preload/index.ts        # contextBridge → window.api (typed, decodes AppError)
  preload/index.d.ts      # global Window.api typing
  renderer/
    index.html
    main.tsx              # React entry (imports fonts + book.css)
    app.tsx               # app shell: bootstrap + sidebar-driven view router
    theme/book.css        # book theme tokens + page-stack texture
    store/                # zustand stores: editorStore, storyStore, settingsStore, uiStore, bootstrap
    editor/               # TipTap editor, toolbar, footer, SceneDivider + Footnote nodes
    views/                # EditorView, Library, Chapters, StoryInfo, Notes, Statistics, Settings, VersionHistory
    components/           # AppFrame (leather frame + grid), Sidebar
  shared/
    types.ts              # domain + IPC contract (single source of truth)
    schema.ts             # schemaVersion constants
    errors.ts             # typed AppError + IPC encode/decode
    word-count.ts         # word count from a ProseMirror doc (shared by main + renderer)
    footnote-markdown.ts  # footnote → Markdown mapping helper (used by main/markdown.ts, M7)
out/                      # build output (gitignored)
release/                  # packaged installers (gitignored)
```

Unit tests live next to their modules as `*.test.ts` (run by Vitest).

## Status

**M7 — Markdown backup export.** Every successful chapter save now also writes a
human-readable `.md` backup beside the `.json` canon (bold/italic/strike, scene dividers
as `---`, footnotes as `[^n]` + definitions; paragraph alignment intentionally dropped).
The write is best-effort: a failure never fails the save or touches the canon, and
surfaces as a soft "копия .md не сохранена" warning in the editor footer. Soft-delete and
chapter reordering keep the `.md` sibling in sync with its `.json`. See the *Chapter
files: `.json` canon + `.md` backup (M7)* section above.

Earlier:

- **M6 — Navigation & views.** The sidebar-driven view router and all remaining views
  (Library, Chapters with drag-to-reorder, Story info, Notes, Statistics, Settings) around
  the editor + version-history views, each persisting through the M1 `window.api`.
  Settings apply live (font, autosave interval, spellcheck languages via a new
  `applySpellLanguages` IPC). See the *Navigation & views (M6)* section above.
- **M4 — Spellcheck (RU + EN, offline).** Simultaneous Russian + English Chromium
  spellcheck served from bundled `.bdic` dictionaries by a loopback prefix-matching
  server, with a native suggestion / add-to-dictionary context menu. See the *Spellcheck
  (offline, M4)* section above.
- **M3 — Footnotes.** A custom inline-atom footnote node with an auto-numbered `[N]`
  marker (numbering derived by document order, never stored), a hover popover to read the
  text and a select-to-edit field to change it, wired to the toolbar `[?]` button. Text is
  stored losslessly in the JSON canon and survives save/reload and version snapshots; the
  Markdown mapping (`[^n]` + definitions) is reused by the M7 `.md` backup serializer.
- **M5 — Autosave + version history.** A single `flush()` write path shared by manual
  Save, a 2s debounce, a 2min dirty-interval, and lifecycle flushes (chapter switch,
  window blur, before quit); a main-process quit guard that delays exit until the
  renderer confirms a final flush (or a 5s safety timeout); a Version History view
  (preview read-only, restore-with-snapshot); and a startup crash-recovery prompt that
  restores a corrupt/missing chapter from its newest snapshot without ever silently
  overwriting the bad file.
- **M2 — Editor core.** The TipTap writing surface: book-themed parchment page, toolbar
  (marks, alignment, undo/redo, indent toggle, scene divider), live word count, focus
  mode, a collapsible sidebar, and a manual Save that persists through the M1
  `window.api` and reloads identically. A demo story is seeded on first run as a
  stand-in for the Library/Chapters navigation (M6).
- **M1 — Data layer.** The reliability backbone: `FileService` with atomic writes,
  library/story/chapter read-write, version snapshots + pruning, soft delete to
  `.trash/`, corrupt/missing-canon startup scan, and the full typed `window.api` over
  IPC. Unit-tested with Vitest (`npm run test`).
- **M0 — Project scaffold** (toolchain, window, IPC `ping`, shared type skeleton).

### Known residual

- `vite@5.4.21` carries a low-severity, **dev-server-only** advisory
  (CVE-2026-39365, path traversal in optimized-deps `.map` handling). Vite 5 is
  pinned transitively by `electron-vite@2.3` (electron-vite 4/5, which use Vite 6/7,
  also require Node 22.12+). The dev server only binds locally for this offline app,
  so practical risk is negligible; revisit when moving to electron-vite 5.
