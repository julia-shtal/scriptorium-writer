# Scriptorium Writer

A local-first desktop editor for writing long-form fiction, styled like the warm
pages of a book. Offline, crash-safe autosave, RU/EN spellcheck.

Built with **Electron + electron-vite + React + TypeScript + TipTap**. Single user,
offline-first. Priorities, in order: (1) reliability of data, (2) comfort of use,
(3) warm "book" aesthetics.

This README has two parts:

- **🖋 For Writers / Для писателей** — if you just want to open the app and write,
  this is for you. No code, just "download → open → write." Available in English
  and Russian — pick your language below.
- **🛠 For Developers** — architecture, scripts, on-disk data format, and the
  milestone history (M0–M8). This is what the rest of this README exists for.

---

## 🖋 For Writers / Для писателей

**Choose a language / Выберите язык:**

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

The rest of this README is technical documentation: how to build the project from
source, how data is laid out on disk, the Electron process architecture, and what
shipped in each milestone.

### Requirements

- **Node.js ≥ 22.12 (LTS)** — required by the current Electron 43 / electron-builder
  26 toolchain, which `require()`s ESM-only dependencies (only supported on Node
  22.12+). On older Node, `npm run build:win` fails with `ERR_REQUIRE_ESM`.
  - Windows install: `winget install OpenJS.NodeJS.LTS` (currently installs Node 24
    LTS), then open a new terminal.
- npm 10+ (bundled with Node; Node 24 ships npm 11).

### Scripts

| Script               | What it does                                                           |
| --------------------- | ---------------------------------------------------------------------- |
| `npm run dev`        | Launch the app in development with HMR (renderer) and DevTools.        |
| `npm run build`      | Typecheck, then build main / preload / renderer into `out/`.           |
| `npm run build:win`  | Full build + package a Windows **NSIS** installer into `release/`.     |
| `npm run start`      | Preview the production build (`electron-vite preview`).                |
| `npm run typecheck`  | Type-check the node (main/preload/shared) and web (renderer) projects. |
| `npm run lint`       | ESLint over `src` (`.ts`/`.tsx`).                                      |
| `npm run test`       | Run the Vitest unit suite (data layer) once.                           |
| `npm run test:watch` | Run Vitest in watch mode.                                              |
| `npm run format`     | Prettier-format `src`.                                                 |

### Getting started (from source)

```
npm install
npm run dev      # opens the book-themed editor on a seeded demo chapter
```

> **npm 11 note:** npm 11 blocks package install scripts by default, so
> `npm install` may not download the Electron binary. If `npm run dev` fails with
> `Error: Electron uninstall`, fetch it once with
> `node node_modules/electron/install.js` (or allow it via
> `npm approve-scripts electron`), then re-run `npm run dev`.

`npm run dev` opens the book-framed writing surface. On first run the app seeds a
demo story so there is something to edit (a stand-in for the Library/Chapters
navigation that arrives in M6); edits are persisted through the M1 `window.api`,
proving the main → preload (contextBridge) → renderer path works end to end.

### Architecture

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

### Data layer (M1)

All persistence lives in the main-process `FileService` (`src/main/file-service.ts`)
and is exposed to the renderer as the typed `window.api` surface (contract in
`src/shared/types.ts`, registered in `src/main/ipc.ts`, wrapped in
`src/preload/index.ts`). The renderer never touches `fs`.

**Where data lives**

- **Library** (your stories) — a plain, syncable folder. Default:
  `Documents/Scriptorium-Writer/`. It is a normal directory you can back up, sync,
  or open in a file manager. Settings → «Экспортировать библиотеку» also bundles the
  whole folder into a single `.zip` in one click — see *Library export (M13)* below.
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

#### Chapter files: one canon, one human-readable shadow (M7)

The core idea: every chapter has exactly **one** file the app trusts, and **one**
plain-text copy that exists purely so a human (or any Markdown-aware tool) can read
it without opening the app.

- **`NN-slug.json` — the canon.** Lossless ProseMirror JSON. The *only* file the app
  ever reads back. Carries everything, including paragraph alignment.
- **`NN-slug.md` — the shadow.** A best-effort Markdown rendering, written right
  after the canon on every save: bold/italic/strike → standard Markdown, scene
  dividers → a `---` thematic break, footnotes → `[^n]` markers plus a definitions
  block. Paragraph alignment is dropped (Markdown has no way to express it) — safe,
  because the `.json` still has it.

Two things follow from "the app only reads the canon":

- The `.md` write can fail without consequence — the save still succeeds, the canon
  is untouched, and the editor just shows a soft "копия .md не сохранена" warning.
- The `.md` is **write-only in v1**: nothing re-imports or repairs from it. It's
  there for you, not for the app.

The pair stays a pair through the chapter's whole lifecycle: soft-delete moves both
into `.trash/` together, and reordering chapters renames both files' `NN` ordinal
prefixes in lockstep, so a `.json`/`.md` pair never mismatches or orphans.

**Reliability guarantees** (SPEC §5, enforced + unit-tested):

- **Atomic writes** — every data file is written to a temp file, `fsync`ed, then
  `rename`d over the target. A crash mid-write can never corrupt the existing file.
- **Version snapshots** — each successful `saveChapter` writes a timestamped snapshot
  and prunes to `maxVersionsPerChapter` (default 20).
- **Never blank corrupt data** — a canon that is missing or fails to parse is
  surfaced via `scanLibrary()` (with the newest restorable snapshot) and a typed
  `CHAPTER_CORRUPT` error, never silently overwritten.
- **Soft delete** — stories and chapters move to `.trash/`, never hard-deleted.
- Errors cross IPC as a typed `AppError` (code + message), not raw Node errors.

Run the data-layer tests with `npm run test`.

### Editor (M2)

The writing surface is a **TipTap 2/ProseMirror** editor styled as a parchment book
page (`src/renderer/editor/`), themed entirely with CSS tokens in
`src/renderer/theme/book.css` (palette + page-stack texture from SPEC §10, no
hard-coded colours elsewhere). Its content is ProseMirror JSON — the same canon the
M1 data layer persists.

- **Toolbar** — italic/bold/strike, align left/center/right, undo/redo, a **Tab**
  control that toggles the first-line indent (a per-chapter *view* preference
  applied as a global `.indent-on` CSS class — it does **not** insert tab
  characters), a `✳✳✳` scene-divider (a real custom block node, `SceneDivider.ts`),
  a `[?]` **footnote** button (live — see M3 below), and the cleanup **wand** (live —
  see M8 below).
- **Footer** — live word count (chapter + selection), a manual **Save** button wired
  to `window.api.saveChapter`, and placeholders for autosave status (M5) and
  spellcheck languages (M4).
- **Focus mode** hides the sidebar and editor chrome; the collapsible sidebar lists
  the SPEC §10 views (only *Editor* is live in M2 — the rest arrive in M6).

State lives in two small Zustand stores (`src/renderer/store/`): `editorStore` (open
chapter, dirty flag, word count, save) and `uiStore` (focus/sidebar/active view).
Word counting is **single-sourced** in `src/shared/word-count.ts` so the on-screen
count equals the count main computes on save. Autosave timers, the quit/switch flush
guard, and version-history UI are intentionally deferred to M5.

### Autosave & version history (M5)

Manual **Save** and autosave share a single write path — there is only one way a
chapter reaches disk. Autosave itself layers three triggers on top of that path:

- **Debounce** — 2 seconds after typing stops.
- **Interval** — every 2 minutes while the chapter is dirty, even mid-typing.
- **Lifecycle flush** — on chapter switch, window blur, and before the app quits.

**Quit guard** — closing the app does not exit immediately. Main asks the renderer
to flush any unsaved changes and delays quitting until it confirms the write is
done, or until a 5-second safety timeout elapses (so a stuck renderer can never
wedge the app open). This guarantees no keystrokes are lost to a closed window.

**Version History** — the history icon in the editor header (a temporary home; it
moves into the sidebar in M6) opens the snapshot list for the current chapter. Pick a
snapshot to preview it read-only, or restore it. Restoring first snapshots the
*current* state (so the version you're leaving is never lost), then writes the
restored content as the new canon.

**Crash recovery** — on startup, `scanLibrary()` flags any chapter whose canon is
missing or fails to parse. The affected chapter is offered for one-click restore
from its newest snapshot; the corrupt file itself is **never** silently
overwritten — restoring reopens the chapter once the newest good snapshot is back
in place.

### Footnotes (M3)

Footnotes are a custom **inline atom** TipTap node
(`src/renderer/editor/extensions/Footnote.ts`). The toolbar `[?]` button inserts one
at the cursor. Each footnote stores only its text in the JSON canon
(`{ "type": "footnote", "attrs": { "text": "…" } }`); the visible `[N]` marker
number is **derived at render** by document order (`footnote-numbering.ts`), never
stored — so inserting, deleting, or moving footnotes always renumbers correctly.

- **Hover** a marker to read its text in a popover; **select** the marker to edit
  the text in a compact field, closing with `×` or `Esc` (`FootnoteView.tsx`).
- Footnote text lives in an *attribute*, not a text node, so it does **not** count
  toward the chapter word count (by design).
- Footnotes round-trip losslessly through save/reload and appear unchanged in
  version snapshots (the node is registered in the shared `bookExtensions`, used by
  both the live editor and the read-only history preview).
- The Markdown mapping (`[^n]` markers + `[^n]:` definitions) lives in the shared
  helper `src/shared/footnote-markdown.ts`, reused by the M7 `.md` backup serializer
  (`src/main/markdown.ts`) so marker numbers always match the definitions block.

### Spellcheck (offline, M4)

Spellcheck is **editor-only** — it affects Chromium's underlines and the context
menu in the editable surface. It never touches persistence; the `.json` canon (and
the M7 `.md` backup) are unaffected.

**Provenance** — `resources/dictionaries/ru.bdic` and
`resources/dictionaries/en-US.bdic` were extracted from the `hunspell_dictionaries.zip`
release asset for `electron@43.1.0` (source filenames `ru-RU-3-0.bdic` and
`en-US-10-1.bdic`; the version suffix is stripped when bundling). Note the naming
quirk: that release names the Russian dictionary `ru-RU`, not `ru` — the
prefix-matching described below handles this transparently, so the stripped
`ru.bdic` still serves any `ru-...`-prefixed request.

**How it works offline** — main starts a loopback HTTP server bound to `127.0.0.1`
and points `session.setSpellCheckerDictionaryDownloadURL` at it. The server matches
Chromium's version-suffixed request filename (e.g. `ru-RU-3-0.bdic`) by **language
prefix**, so it serves the bundled `.bdic` regardless of the suffix Chromium asks
for — this survives Chromium version bumps without touching the bundled files.
Chromium caches the dictionary in `userData/Dictionaries` after first use.

**Manual verification (network disabled):**

1. Disable the network. Launch the app. Type a misspelled Russian word and a
   misspelled English word in one paragraph → both underline red.
2. Right-click a misspelled word → correct suggestions appear; click one → it
   replaces the word.
3. Click "Добавить в словарь" (Add to dictionary) → the underline disappears;
   restart the app → the word stays un-underlined (persisted in `userData`).

**Packaging note:** `resources/` (including `resources/dictionaries/`) is bundled
via electron-builder's `extraResources` so offline spellcheck also works in the
packaged app, not just `npm run dev`.

### Navigation & views (M6)

The sidebar drives a view router in `app.tsx` keyed on `uiStore.activeView`. Two
sections: **РАБОТА** (Editor, Chapters, Story info, Version history, Notes,
Statistics — scoped to the open story) and **ОБЩЕЕ** (Library, Settings). The
sidebar collapses to give the editor full width; the Version-history item carries a
badge with the open chapter's snapshot count.

- **Library** — all stories with status, chapter/word counts and last-edited;
  create, open, and soft-delete (inline confirm, no blocking `window.confirm`).
- **Chapters** — the open story's chapters with **native HTML5 drag-to-reorder**
  (persisted via `reorderChapters`; no drag-and-drop dependency), inline rename,
  add, open, soft-delete.
- **Story info** — title, description, tags, status → `updateStoryMeta`.
- **Notes** — per-story codex (characters / locations / world / timeline + a
  scratchpad), loaded via `readNotes` and saved debounced (500 ms) via `saveNotes`.
- **Statistics** — total words, per-chapter breakdown, and a daily writing streak.
  Streak data lives in renderer `localStorage` (`scriptorium:activeDays`) —
  lightweight, cleared with app data; not part of the file canon.
- **Settings** — autosave interval, spellcheck languages (bundled `ru` / `en-US`),
  editor font family/size, max versions per chapter, and the library path
  (read-only + reveal).

**Live settings.** Changes apply without a restart via `settingsStore`: font
family/size set CSS custom properties (`--editor-font-family` /
`--editor-font-size`) the editor consumes; autosave interval re-arms the timer
through `editorStore.configureAutosave`; spellcheck languages update the footer
label and re-check the live Chromium session through a new `applySpellLanguages`
IPC (main calls `session.setSpellCheckerLanguages`), so the renderer never touches
`session` directly.

State is split across small Zustand stores: `storyStore` (open story + chapter
list — the shared truth for Chapters / Story info / the editor switcher),
`settingsStore`, `editorStore`, and `uiStore`.

### Cleanup wand (M8)

The toolbar **wand** (`src/renderer/editor/cleanup/`) runs a minimal, pluggable set
of text-cleanup rules over the current selection — or the whole chapter when
nothing is selected — and applies them as **one undoable transaction** behind an
inline diff preview.

- **Rules** (`rules.ts`) are an ordered list of pure `(text) => string` transforms,
  each a discrete entry so a later milestone can expose per-rule Settings toggles
  (`// TODO(post-v1)`): collapse multiple spaces, normalize spacing around
  `, . ; : ! ?`, fix stray spaces in hyphenated words, `-` → em dash `—`, and trim
  trailing whitespace per line. No quote typography yet (deferred).
- **Span computation** (`computeSpans.ts`) walks the text nodes overlapping the
  range and turns each node's rule output into tight edit spans via a **hand-rolled
  char-level diff** (no new dependency). Footnote markers and `hard_break` are
  natural run boundaries; a partial selection **rounds up to the full boundary text
  node** (the rules are context-sensitive), documented in the function's JSDoc.
  Text content only — marks and node structure are never altered.
- **Preview** is decoration-only: `wandPreviewPlugin.ts` shows the old text struck
  through (`--muted`) with the proposed new text inline (`--accent`); the editor
  goes read-only and autosave is suppressed via the `editorStore.wandPreviewActive`
  flag so no snapshot of the uncommitted state is taken.
- A fixed **action bar** (`WandActionBar.tsx`, not a modal) confirms (Enter) or
  cancels (Esc). Confirm builds a single `tr` — spans applied rightmost-first, each
  preserving the marks at its position, tagged `wandCleanup` — so the whole cleanup
  is one Ctrl+Z. Cancel leaves the document byte-identical. Zero proposed edits show
  a brief "Нечего чистить" note instead of entering preview.

### Auto-update (M12)

Packaged builds check for updates in the background on launch via
[`electron-updater`](https://www.electron.build/auto-update) and its **GitHub
provider** — no separate update server. `electron-builder.yml` carries the
`publish` block that points the updater at the releases of this repo:

```yaml
publish:
  provider: github
  owner: julia-shtal
  repo: scriptorium-writer
```

`npm run build:win` also emits a `latest.yml` manifest into `release/`; upload it
alongside the installer when you cut a GitHub Release so the updater can see the
newest version. Releases are matched by the `version` in `package.json`.

- **Graceful degradation (mandatory).** The update check can never delay or block
  launch. It is skipped entirely in dev (`app.isPackaged` guard — `electron-updater`
  throws under `npm run dev`), and in packaged builds the check is fire-and-forget
  with any failure (offline / GitHub unreachable / rate-limited) caught and logged.
  This mirrors the M4 spellcheck rule. See `src/main/auto-update.ts` (Electron-free,
  dependency-injected, unit-tested) and its thin adapter in `src/main/index.ts`.
- **Never restarts over unsaved work.** When an update finishes downloading, a small
  **dismissible** notice (`src/renderer/components/UpdateNotice.tsx`, a footer strip —
  not a blocking modal) offers *Перезапустить* / *Позже*. "Restart now" does **not**
  call `quitAndInstall()` directly; it routes through the same **quit-guard flush**
  as a normal quit (`window.lifecycle.restartToUpdate()` → main runs the renderer
  flush handshake, disarms the guard, then installs), so no unsaved chapter is lost.
- **Best paired with code signing (M11).** Auto-update works while the app is
  unsigned, but each downloaded, unsigned installer still trips Windows SmartScreen —
  which undercuts the "just click update" experience. This task is **not blocked** on
  M11; signing simply makes the update flow quiet. Once M11 lands, no auto-update
  change is needed.

### Library export (M13)

Settings → **«Экспортировать библиотеку»** opens a native save dialog and streams
the *entire* library folder into one `.zip` at the chosen path — a full-fidelity
backup, not a partial one:

- **Everything, byte-for-byte.** Every story, chapter canon + `.md` shadow, version
  snapshot, and notes file, laid out exactly as on disk — including `.trash/`
  (soft-deleted stories/chapters). Extracting the archive reproduces the original
  `stories/<story-id>/…` structure with nothing renamed or dropped.
- **Read-only, always.** Export only reads from the library; it never modifies it.
  A failure (disk full, permissions) surfaces as a friendly in-app notice and never
  touches the source data.
- **Streamed, not blocking.** Built on [`archiver`](https://www.npmjs.com/package/archiver)
  (deflate) in the main process (`src/main/library-archive.ts`), writing to a
  `.part` file and renaming over the destination only once the archive is fully
  written — the same temp-then-rename pattern as every other write in this app — so
  a large library never freezes the UI and a crash mid-export never leaves a
  truncated `.zip` at the destination path.

### Import & export chapters as .docx/.md (M14)

Chapter I/O now works in both directions, at two granularities, alongside the
existing `.md` safety shadow (which stays a write-only backup):

- **Import.** Chapters view → **«Импортировать…»** picks a single `.md`/`.docx` file and
  opens a preview dialog. Choose **«Одним файлом → одна глава»** to append it as one
  chapter, or **«Разбить по заголовкам на отдельные главы»** to split it into one chapter
  per top-level heading (Markdown `#` / Word *Heading 1*), titled from each heading, in
  document order. The dialog previews exactly which chapters will be created before you
  confirm; content before the first heading becomes an empty-title chapter — never
  dropped. Cancelling creates nothing.
- **Export.** Both live behind a download control. Per-chapter: the download icon on each
  Chapters row (revealed on hover / keyboard focus) offers **.docx** / **.md** for that
  chapter. Whole-story and per-chapter export also live in the editor's **⋯** export menu,
  which compiles every chapter (in `chapterOrder`) into one file, each title a *Heading 1*.
  These are plain, editable files — not manuscript formatting.

How it stays reliable and keeps the process boundary clean:

- **Same write path.** Imported chapters go through the *exact* `createChapter` +
  `saveChapter` path as any other chapter — atomic writes and version snapshots
  included. No bypass.
- **Split responsibilities.** Node-side file work stays in main:
  [`mammoth`](https://www.npmjs.com/package/mammoth) turns `.docx` bytes into HTML
  (`src/main/docx-import.ts`), and [`docx`](https://www.npmjs.com/package/docx) builds
  `.docx` from the canon with **native Word footnotes** (`src/main/docx-export.ts`).
  Doc-model parsing stays in the renderer — HTML/Markdown → ProseMirror JSON via
  TipTap's `generateJSON` and a small inverse-of-`markdown.ts` Markdown reader
  (`src/renderer/editor/import/`). The editor schema has no heading node, so headings
  become split boundaries/titles and any leftover heading text is flattened to a
  paragraph rather than lost.
- **Lossy, not lossless — and honest about it.** Import is a one-time conversion;
  tables, images, comments and tracked changes are dropped and surface a
  «часть форматирования могла не сохраниться» notice (never a failure). Marks
  (bold/italic/strike), scene dividers and footnotes round-trip.
- **Export never touches the library.** It reads canon only and writes the generated
  `.docx` to the user-chosen path with the same temp-then-rename atomic write used
  everywhere else, so a failed export can't corrupt anything.

### Project layout

```
electron.vite.config.ts   # main / preload / renderer build config
electron-builder.yml      # Windows NSIS packaging + GitHub publish (auto-update) config
tsconfig.json             # references tsconfig.node.json + tsconfig.web.json
src/
  main/
    index.ts              # app + window lifecycle, constructs FileService, wires IPC
    ipc.ts                # ipcMain.handle registrations → FileService (typed)
    file-service.ts       # ALL disk I/O: atomic writes, snapshots, scan/restore
    paths.ts              # library path resolution, slug/filename helpers
    atomic-write.ts       # tmp + fsync + rename atomic write helper
    auto-update.ts        # M12 background auto-update coordinator (Electron-free, DI)
    library-archive.ts    # M13 zips the whole library folder to a user-chosen path
    markdown.ts           # M7 chapter → .md backup serializer
    docx-import.ts        # M14 .docx bytes → HTML via mammoth (+ Heading-1 style map)
    docx-export.ts        # M14 canon → .docx via docx.js (native footnotes)
  preload/index.ts        # contextBridge → window.api (typed, decodes AppError)
  preload/index.d.ts      # global Window.api typing
  renderer/
    index.html
    main.tsx              # React entry (imports fonts + book.css)
    app.tsx               # app shell: bootstrap + sidebar-driven view router
    theme/book.css        # book theme tokens + page-stack texture
    store/                # zustand stores: editorStore, storyStore, settingsStore, uiStore, bootstrap
    editor/               # TipTap editor, toolbar, footer, SceneDivider + Footnote nodes
    editor/cleanup/       # M8 cleanup wand: rules, span diff, preview plugin, action bar
    editor/import/        # M14 import: markdown/html → ProseMirror JSON, split, orchestration
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

### Known residual

- None. The build toolchain runs on `electron-vite@5` / `vite@7` / `vitest@3`,
  and `npm audit` reports **0 vulnerabilities**. This clears the earlier
  dev-server-only `vite@5` advisory (CVE-2026-39365), which is gone now that no
  part of the dependency tree pins Vite 5.

### Version History (M0–M8)

<details>
<summary>Expand — what was done at each milestone</summary>

**M13 — Library export.** A one-click "Экспортировать библиотеку" action in
Settings streams the whole library folder into a single `.zip` via `archiver`,
including `.trash/`, reproducing the on-disk `stories/<story-id>/…` layout exactly
on extraction. Read-only against the library; writes to a `.part` file and renames
over the destination only once complete, so failures never touch the source or
leave a truncated archive. See the *Library export (M13)* section above.

**M8 — Cleanup wand (minimal rules).** The toolbar wand runs a pluggable, ordered
set of pure text-cleanup rules (collapse spaces, punctuation spacing, stray hyphen
spaces, `-` → em dash, trailing-whitespace trim) over the selection — or the whole
chapter when nothing is selected — behind an inline diff preview, applied as a
single undoable transaction that preserves marks and never alters node structure.
See the *Cleanup wand (M8)* section above.

**M7 — Markdown backup export.** Every successful chapter save also writes a
human-readable `.md` backup beside the `.json` canon (bold/italic/strike, scene
dividers as `---`, footnotes as `[^n]` + definitions; paragraph alignment
intentionally dropped). The write is best-effort: a failure never fails the save or
touches the canon, and surfaces as a soft "копия .md не сохранена" warning in the
editor footer. Soft-delete and chapter reordering keep the `.md` sibling in sync
with its `.json`. See the *Chapter files* section above.

**M6 — Navigation & views.** The sidebar-driven view router and all remaining
views (Library, Chapters with drag-to-reorder, Story info, Notes, Statistics,
Settings) around the editor + version-history views, each persisting through the
M1 `window.api`. Settings apply live (font, autosave interval, spellcheck languages
via a new `applySpellLanguages` IPC). See the *Navigation & views (M6)* section
above.

**M4 — Spellcheck (RU + EN, offline).** Simultaneous Russian + English Chromium
spellcheck served from bundled `.bdic` dictionaries by a loopback prefix-matching
server, with a native suggestion / add-to-dictionary context menu. See the
*Spellcheck (offline, M4)* section above.

**M3 — Footnotes.** A custom inline-atom footnote node with an auto-numbered `[N]`
marker (numbering derived by document order, never stored), a hover popover to read
the text and a select-to-edit field to change it, wired to the toolbar `[?]`
button. Text is stored losslessly in the JSON canon and survives save/reload and
version snapshots; the Markdown mapping (`[^n]` + definitions) is reused by the M7
`.md` backup serializer.

**M5 — Autosave + version history.** A single `flush()` write path shared by
manual Save, a 2s debounce, a 2min dirty-interval, and lifecycle flushes (chapter
switch, window blur, before quit); a main-process quit guard that delays exit until
the renderer confirms a final flush (or a 5s safety timeout); a Version History
view (preview read-only, restore-with-snapshot); and a startup crash-recovery
prompt that restores a corrupt/missing chapter from its newest snapshot without
ever silently overwriting the bad file.

**M2 — Editor core.** The TipTap writing surface: book-themed parchment page,
toolbar (marks, alignment, undo/redo, indent toggle, scene divider), live word
count, focus mode, a collapsible sidebar, and a manual Save that persists through
the M1 `window.api` and reloads identically. A demo story is seeded on first run as
a stand-in for the Library/Chapters navigation (M6).

**M1 — Data layer.** The reliability backbone: `FileService` with atomic writes,
library/story/chapter read-write, version snapshots + pruning, soft delete to
`.trash/`, corrupt/missing-canon startup scan, and the full typed `window.api` over
IPC. Unit-tested with Vitest (`npm run test`).

**M0 — Project scaffold** (toolchain, window, IPC `ping`, shared type skeleton).

</details>
