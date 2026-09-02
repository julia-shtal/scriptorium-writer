# Feature reference

Per-feature notes on how each capability actually works — the deep-dive companion to the
feature table in the README.

## Editor core

A TipTap 2 / ProseMirror surface styled as a parchment page
(`src/renderer/editor/`), themed via `book.css`. Content is ProseMirror JSON — the same
canon the data layer persists. The **Tab** control toggles a global `.indent-on` first-line
indent (a per-chapter view preference, not stored tab characters); the scene divider is a
real custom block node (`SceneDivider.ts`). State lives in two small Zustand stores
(`editorStore`, `uiStore`); word counting is single-sourced in `src/shared/word-count.ts`
so the on-screen count equals what main computes on save.

## Autosave and version history

Manual Save and autosave share one `flush()` write path:
a 2 s debounce, a 2 min dirty-interval, and lifecycle flushes (chapter switch, window
blur, before quit). A main-process **quit guard** delays exit until the renderer confirms
a final flush, or a 5 s safety timeout elapses. **Version History** opens the snapshot list
for the current chapter — preview read-only, or restore (which snapshots the current state
first). On startup, `scanLibrary()` flags any chapter whose canon is missing or won't parse
and offers a one-click restore from its newest snapshot; the corrupt file is never silently
overwritten.

## Footnotes

A custom inline-atom node (`Footnote.ts`); the toolbar `[?]` inserts one.
Each footnote stores only its text in the canon; the visible `[N]` marker is derived at
render by document order (`footnote-numbering.ts`), never stored — so inserting, deleting,
or moving footnotes always renumbers correctly. Hover a marker to read it; select it to
edit. Footnote text lives in an attribute, so it does not count toward the word count. The
Markdown mapping (`[^n]` + definitions) lives in `src/shared/footnote-markdown.ts`, reused
by the `.md` backup serializer.

## Spellcheck (offline, RU + EN)

Editor-only — it affects Chromium's underlines and
context menu, never persistence. Main starts a loopback HTTP server on `127.0.0.1` and
points `session.setSpellCheckerDictionaryDownloadURL` at it; the server matches Chromium's
version-suffixed request filename by **language prefix**, so the bundled `.bdic` is served
regardless of suffix — surviving Chromium version bumps. Dictionaries
(`resources/dictionaries/*.bdic`) are bundled via electron-builder `extraResources` so
offline spellcheck works in packaged builds too.

## Navigation and views

The sidebar drives a view router keyed on `uiStore.activeView`:
**WORK** (Editor, Chapters, Story info, Version history, Notes, Search, Statistics) and
**GENERAL** (Library, Settings). Chapters supports native HTML5 drag-to-reorder (no dependency). Notes
is a per-story codex (characters / locations / world / timeline + scratchpad), saved
debounced. Statistics shows totals, a per-chapter breakdown, and a daily writing streak
(streak data in renderer `localStorage`, not part of the canon). Settings apply live via
`settingsStore` — font, autosave interval, spellcheck languages (through an
`applySpellLanguages` IPC), and **UI language (RU / EN)** all take effect without a restart.

## UI localization (RU / EN)

Every static interface string and renderer-surfaced
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

## Cleanup wand

The toolbar wand (`src/renderer/editor/cleanup/`) runs an ordered set of
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

## Find and Replace

A non-modal bar for the open chapter (**Ctrl+F** / **Ctrl+H**, or the
🔍 toolbar button) rendered below the text so it shrinks the page rather than covering a
match. Live highlighting via ProseMirror decorations, an accurate `N / M` counter,
Enter/F3 navigation (wrapping), case-sensitive and whole-word (Cyrillic-aware) toggles.
Matching is literal substring, never spanning a paragraph break or footnote. Replace-all
runs in one transaction (one Ctrl+Z) reusing the wand's shared span-replace builder, so
autosave/dirty/snapshots react automatically.

## Full-text search

The "Search" sidebar view runs a read-only, in-memory sweep of the
open story on submit: every chapter's canon plus every Notes section (characters, locations,
world, timeline, scratch). Chapters and notes are read through `window.api` and never
written — a pure read that cannot corrupt the library; a chapter that fails to read is
skipped and surfaced as a soft "couldn't read part of the work" notice rather than
blanking results. Matching is literal, case-insensitive substring over the same canon
text-walker word count uses (`extractPlainText`), so the two always agree on "the text";
results are one row per source with an occurrence count and a context snippet. Clicking a
chapter result opens it in the editor and seeds the Find bar so the matches highlight
in place; a notes result lands on the Notes view.

## Import and export (.docx / .md)

Import a single `.md`/`.docx` file as one chapter, or
split it into one chapter per top-level heading, with a preview dialog before confirming.
Imported chapters go through the exact `createChapter` + `saveChapter` path (atomic writes
+ snapshots). Node-side file work stays in main — `mammoth` (`.docx` → HTML) and `docx`
(canon → `.docx` with native Word footnotes); doc-model parsing stays in the renderer.
Import is a one-time, lossy conversion (tables/images/comments dropped, with an honest
notice); marks, scene dividers and footnotes round-trip. Export reads canon only and writes
with the same temp-then-rename atomic write.

## Library export

Settings → "Export library" streams the entire library
folder into one `.zip` (via `archiver`), including `.trash/`, reproducing the on-disk
`stories/<story-id>/…` layout exactly. Read-only against the library; writes to a `.part`
file and renames over the destination only once complete, so a failure never touches the
source or leaves a truncated archive.

## Markdown backup (.md shadow)

Every successful chapter save also writes a
human-readable Markdown copy beside the `.json` canon, through the same temp-then-rename
atomic write (`src/data/markdown.ts`). Bold/italic/strike map to standard Markdown, the
scene divider to `---`, and footnotes to `[^n]` markers plus a definitions block (reusing
`src/shared/footnote-markdown.ts`); paragraph alignment is intentionally dropped — which is
why the canon stays JSON. The `.md` write is **best-effort**: a failure never fails the save
or touches the canon, surfacing only as a soft "the .md copy was not saved" warning, and
soft-delete / reorder keep the `.md` sibling in sync with its `.json`. v1 never re-imports
from `.md`.

## Typographic quotes

A cleanup-wand rule turns straight double quotes `"` into Russian
guillemets «…», pairing by open/close alternation per text node. Narrow by design: only
`"` (U+0022) is touched; single quotes/apostrophes are left alone. Runs after the em-dash
rule, through the same preview + single-transaction path.

## Auto-update

Packaged builds check GitHub Releases in the background via
`electron-updater`'s GitHub provider (no separate update server); `electron-builder.yml`
carries the `publish` block, and `npm run build:win` emits a `latest.yml` manifest. The
check never blocks launch (skipped in dev, fire-and-forget in packaged builds). A
downloaded update shows a dismissible footer notice; "Restart now" routes through the same
quit-guard flush as a normal quit, so no unsaved chapter is lost.

## Minimal footer mode

A persistent "Minimal footer" preference hides the
footer's info line (word count, save status, spellcheck badge) while keeping the
"Save" button. Stored as `Settings.hideEditorFooterInfo`, toggled from a Settings
checkbox and a chapter-header icon. A save **error** always overrides the hidden state and
brings the full info line (with "retry") back, so failures are never silent.
