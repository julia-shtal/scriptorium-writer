# Changelog

Released versions, newest first. Dates are the release tag dates.

## 1.7.0 — unreleased

- Settings → "Import library…" (Windows, web, Android) restores or merges a library `.zip`
  from any platform, with a per-story preview (new, identical, conflict, invalid) and a
  choice for conflicts: keep both, replace (the old copy goes to `.trash/`), or skip.
  Archives from 1.6.0 import too.
- Library exports now carry a `manifest.json` header with the format and app versions.
- Fixed: deleting a story in the web app (PWA) failed because OPFS had no directory
  rename.

See [architecture.md](architecture.md#library-import).

## 1.6.0 — 2026-09-05

- The web build is released: it runs in the browser, installs as a PWA, and works offline.
  The library lives in the browser's private storage, so the app reminds you to save a
  `.zip` backup when the last one is over a week old — see [web-pwa.md](web-pwa.md).
- An Android tablet build, in beta, as a sideloaded APK on the release page. The library
  lives in `Documents/Scriptorium-Writer`, so it survives a reinstall and can be copied
  over USB — see [android.md](android.md).
- The Windows desktop app is unchanged.

## 1.5.0 — 2026-08-02

- Full RU/EN interface localization with an in-app language switch that applies live.
- Full-text search across every chapter and every notes section of the open story.
- The app reopens where you left off, deletes ask before they take anything away, and the
  chapter and story lists are easier to read.

## 1.4.0 — 2026-07-29

- The cleanup wand now converts a leading dialogue hyphen to an em dash.
- Scrolling is contained to the writing surface, so the toolbar and chapter header stay
  put while you type near the bottom of a long chapter.
- The Save button no longer flickers on every autosave tick.

## 1.3.0 — 2026-07-29

- Import and export chapters as `.docx` or `.md`, with native Word footnotes on export.
- Find & Replace in the chapter editor.
- One-click export of the whole library to a `.zip`.
- Quote typography: straight quotes become Russian guillemets.
- Minimal footer mode, which hides the footer's info line but keeps the Save button.

## 1.1.0 — 2026-07-17

- Packaged builds check GitHub Releases in the background and offer a dismissible restart.
- The build toolchain moved to electron-vite 5 / Vite 7, clearing the last dependency
  advisory.

## 1.0.0 — 2026-07-13

First release. The data layer with atomic writes and version snapshots, the TipTap
book-themed editor, footnotes, offline Russian + English spellcheck, autosave and the quit
guard, the full set of views, the Markdown backup copy, the cleanup wand, and the Windows
NSIS installer.
