# Changelog

Released versions, newest first. Dates are the release tag dates.

## Unreleased

- A web build that runs in the browser and installs as a PWA — see [web-pwa.md](web-pwa.md).
- An Android tablet build packaged with Capacitor — see [android.md](android.md).

Neither has been released; both are described here so the source tree makes sense, not
because they ship.

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
