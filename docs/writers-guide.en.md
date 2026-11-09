<!-- Keep in sync with writers-guide.ru.md -->

# Writer's guide

> [Читать это руководство по-русски](writers-guide.ru.md)

If you just want to open the app and write — this page is for you. No code: download,
open, write.

**What this is.** A Windows app for writing long fiction comfortably: a warm,
book-page look, autosave, version history (roll back to an older draft of a
chapter), footnotes, and spellcheck in Russian and English at the same time — all
of it working offline.

## How to install

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

## Where your stories live

Every story lives in a plain folder on your computer:

```
Documents/Scriptorium-Writer/
```

It's a normal folder, not a locked-away database inside the app. You can:

- copy it to a USB drive;
- sync it through OneDrive, Dropbox, Google Drive, or anything similar;
- open it in File Explorer and see what's inside (one file per chapter).

## Moving the library between devices

1. On the first device, open **Settings** and press **Export library**. You get one
   `.zip` file with all your stories.
2. Copy that file to the other device (USB drive, cloud storage, email to yourself).
3. On the second device, open **Settings** and press **Import library…**, then choose
   the `.zip`. This works in the Windows app, the browser version, and on Android, and
   the archive can come from any of them.

Nothing is written yet — the app first shows what is in the archive, story by story:

- **New** — you don't have this story on this device. It will be added.
- **Identical** — you already have exactly this story. Nothing to do; it is skipped.
- **Conflict** — a story with the same identity exists here, but the text differs.
  You choose: **Keep both** (the default — the imported one is added with
  "(imported date)" in its title), **Replace**, or **Skip**.
- **Invalid** — this story can't be imported (damaged files, or saved by a newer version
  of the app). The reason is shown, and the story is skipped; the rest still import.

**Replace** does not delete anything: your current copy goes to the trash folder
(`.trash` inside the library), so you can still get it back. If a chapter's file is
missing from the archive, the app offers to restore it from version history afterwards.

Settings (language, library location and the like) do not travel with the archive —
each device keeps its own.

## If something goes wrong

- Every save creates a version snapshot — older drafts of a chapter never disappear;
  you can view and restore them from **version history** inside the app.
- The app never overwrites a good file with a broken one — if something's wrong, it
  offers to restore the chapter from its last good snapshot.
- If you close the app while it's still saving, it waits for the save to finish
  before it actually closes.

## Where to report problems

If a problem isn't solved by any of this, [open an issue on
GitHub](https://github.com/julia-shtal/scriptorium-writer/issues) or reach out to
the author directly.
