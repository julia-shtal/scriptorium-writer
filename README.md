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
| **Import / Export** | Import a `.md`/`.docx` file as one chapter or split by headings; export any chapter or the whole story to `.docx`/`.md`. |
| **Library backup** | One click zips the entire library folder (stories, snapshots, notes, `.trash/`) to a chosen path — atomic, read-only against your data. |
| **Auto-update** | Packaged builds check GitHub Releases in the background and offer a dismissible restart that routes through the same quit-guard flush. |

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
| `npm run build` | Typecheck, then build main / preload / renderer into `out/`. |
| `npm run build:win` | Full build + package a Windows **NSIS** installer into `release/`. |
| `npm run start` | Preview the production build (`electron-vite preview`). |
| `npm run typecheck` | Type-check the node (main/preload/shared) and web (renderer) projects. |
| `npm run lint` | ESLint over `src` (`.ts`/`.tsx`). |
| `npm run test` | Run the Vitest unit suite (data layer) once. |
| `npm run test:watch` | Run Vitest in watch mode. |
| `npm run format` | Prettier-format `src`. |

### Architecture

Standard Electron three-process split. The
security boundary is strict and must not be weakened:

- **main** (`src/main/`) — window lifecycle, IPC handlers, and all filesystem I/O via
  `FileService` (atomic writes, snapshots, scan/restore).
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
may be renamed safely. Alignment lives in the JSON canon (Markdown can't carry it),
which is why the canon is JSON, not Markdown.

### Project layout

```
electron.vite.config.ts   # main / preload / renderer build config
electron-builder.yml      # Windows NSIS packaging + GitHub publish (auto-update) config
src/
  main/                   # ALL disk I/O: FileService, atomic-write, snapshots, markdown/docx, auto-update, library-archive
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
**РАБОТА** (Editor, Chapters, Story info, Version history, Notes, Statistics) and **ОБЩЕЕ**
(Library, Settings). Chapters supports native HTML5 drag-to-reorder (no dependency). Notes
is a per-story codex (characters / locations / world / timeline + scratchpad), saved
debounced. Statistics shows totals, a per-chapter breakdown, and a daily writing streak
(streak data in renderer `localStorage`, not part of the canon). Settings apply live via
`settingsStore` — font, autosave interval, and spellcheck languages (through an
`applySpellLanguages` IPC) all take effect without a restart.

**Cleanup wand.** The toolbar wand (`src/renderer/editor/cleanup/`) runs an ordered set of
pure `(text) => string` rules over the selection — or the whole chapter when nothing is
selected — and applies them as **one undoable transaction** behind an inline diff preview.
Rules: collapse multiple spaces, normalize punctuation spacing, fix stray spaces in
hyphenated words, `-` → em dash `—`, trailing-whitespace trim, and straight double quotes
`"` → Russian guillemets «…». Span computation is a hand-rolled char-level diff (no new
dependency); text content only — marks and node structure are never altered. Preview is
decoration-only and suppresses autosave so no snapshot of the uncommitted state is taken.

**Find & Replace.** A non-modal bar for the open chapter (**Ctrl+F** / **Ctrl+H**, or the
🔍 toolbar button) rendered below the text so it shrinks the page rather than covering a
match. Live highlighting via ProseMirror decorations, an accurate `N / M` counter,
Enter/F3 navigation (wrapping), case-sensitive and whole-word (Cyrillic-aware) toggles.
Matching is literal substring, never spanning a paragraph break or footnote. Replace-all
runs in one transaction (one Ctrl+Z) reusing the wand's shared span-replace builder, so
autosave/dirty/snapshots react automatically.

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
<summary>Milestone history (M0–M13)</summary>

**M13 — Library export.** A one-click "Экспортировать библиотеку" action in Settings
streams the whole library folder into a single `.zip` via `archiver`, including `.trash/`,
reproducing the on-disk layout exactly on extraction; writes to a `.part` file and renames
over the destination only once complete.

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
