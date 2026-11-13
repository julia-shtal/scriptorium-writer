# Releasing

How a version of Scriptorium Writer gets to its users: one command builds and verifies the
Windows installer, the web app (PWA) and the Android APK, then publishes all three together.
This page covers the one-time setup of the release machine, what to do before a release,
what the command does and in what order, and what to do when it stops halfway.

The command is `npm run release`, implemented in `scripts/release.mjs` and
`scripts/release/`. It replaces a manual procedure of about a dozen steps across git, npm,
Gradle, electron-builder and the GitHub CLI. The checks in that procedure already existed as
separate scripts; what went wrong in practice was the chaining — a step forgotten, done in
the wrong order, or done on a different build than the one that was checked.

## Contents

- [Where it runs](#where-it-runs)
- [One-time setup](#one-time-setup)
- [Before a release](#before-a-release)
- [Cutting a release](#cutting-a-release)
- [What it does, in order](#what-it-does-in-order)
- [Dry run](#dry-run)
- [What is in release-out](#what-is-in-release-out)
- [When it stops: resume and abort](#when-it-stops-resume-and-abort)
- [After a release](#after-a-release)
- [Out of scope](#out-of-scope)

## Where it runs

**On the release machine: the author's Windows computer.** There is no CI and no GitHub
Actions workflow; every artifact is built locally and uploaded from there. Two reasons:

- **The Android signing key never leaves the machine.** That key is the app's identity on
  every installed tablet, and it cannot be replaced (see
  [Release signing](android.md#release-signing)). Building in CI would mean putting it in
  GitHub secrets, where a compromised workflow, action or token could sign an "update" that
  every device accepts.
- **The build is Windows-shaped.** The Android step runs `android\gradlew.bat`, and the
  desktop step builds an NSIS installer with electron-builder. Both run natively here and
  would need porting anywhere else.

A GitHub Actions button is not built; see [Out of scope](#out-of-scope).

## One-time setup

The preflight checks part of this setup before anything changes, so a gap there shows up
as one clear line within seconds: the signing key and its keystore file, the `gh` sign-in
(and that no release of the version exists yet), `apksigner` under `ANDROID_HOME` (or `ANDROID_SDK_ROOT`), and the
`gh-pages` worktree (it exists, is the top of a git worktree, and is on `gh-pages`).
Playwright's Chromium is checked only indirectly, when `npm run test:browser` runs in the
checks step.

The rest is **not** checked up front: the Node.js version, JDK 21 and SDK Platform 36. A
missing or wrong one fails during the build, and for the Android build that is after the
release commit has been made (still local, and `--abort` undoes it). On a new machine, or
after changing its toolchain, run a [dry run](#dry-run) first: it goes through the same
builds and publishes nothing.

**Build tools.** Node.js ≥ 22.12 (see the [README](../README.md#requirements)) and Git;
Android Studio with JDK 21, SDK Platform 36 and **SDK Build-Tools** (see
[Prerequisites and build loop](android.md#prerequisites-and-build-loop)). The browser test
suite runs in Playwright's Chromium; if `npm run test:browser` has never run on this machine,
install it once with `npx playwright install chromium`.

**`ANDROID_HOME` as an environment variable.** The preflight finds `apksigner` — and
`npm run verify:apk` finds `apksigner` and `aapt2` — only through `ANDROID_HOME` (or
`ANDROID_SDK_ROOT`), taking the newest version under `<sdk>\build-tools\`. Gradle can also
find the SDK through `android/local.properties`, which Android Studio writes, but the
release script does not read that file. Set the variable in the Windows environment, for
example to `C:\Users\<you>\AppData\Local\Android\Sdk`, and open a new terminal.

**GitHub CLI, signed in.** Install `gh` from <https://cli.github.com> and run
`gh auth login` with an account that can push to `julia-shtal/scriptorium-writer` and create
releases there. Every `gh release` call the script makes names that repository explicitly, so
a fork or a second git remote can never receive the release. The git pushes go to the
remote called `origin`.

**The signing key.** The APK is signed with the release keystore, configured one of two
ways:

- **`android/keystore.properties`** (the normal setup on the release machine). Copy
  `android/keystore.properties.example`, which documents each key, and fill in the four
  values. The file is gitignored. `storeFile` is resolved relative to `android/`; an
  absolute path to a keystore kept outside the repository is the better choice. It is a Java
  `.properties` file, so **a backslash is an escape character**: write
  `storeFile=C:/Users/me/keys/scriptorium-release.jks` or double every backslash. A path typed
  with single backslashes is read by Gradle as `C:Usersmekeys…` — the preflight reads the
  file the same way Gradle does, so it reports that path as missing rather than letting the
  build fail later.
- **Four environment variables**, used only when `keystore.properties` does not exist:
  `SCRIPTORIUM_KEYSTORE_FILE`, `SCRIPTORIUM_KEYSTORE_PASSWORD`, `SCRIPTORIUM_KEY_ALIAS`,
  `SCRIPTORIUM_KEY_PASSWORD`. Set all four or none; a partial set stops both the preflight
  and Gradle. `SCRIPTORIUM_KEYSTORE_FILE` resolves against `android/` like `storeFile`, so
  give it an absolute path. This is the seam a CI runner would use: secrets injected for one
  build, never written to disk.

When both exist, the file wins, so a stray variable cannot silently re-point a local release
at a different key. The preflight checks that the keystore file exists; it never reads the
passwords — Gradle does, at build time. A wrong key is still caught before anything is
published: `verify:apk` compares the APK's certificate with
`android/release-fingerprint.txt` and stops the release on a mismatch.

**The `gh-pages` worktree.** The PWA is served by GitHub Pages from the `gh-pages` branch,
which holds the built bundle and nothing else (see
[Where it is hosted](web-pwa.md#where-it-is-hosted)). The script deploys into a git worktree
of that branch next to the repository, `../scriptorium-pages` by default. Create it once,
from the repository root:

```powershell
git worktree add ../scriptorium-pages gh-pages
```

To keep it somewhere else, set `SCRIPTORIUM_PAGES_DIR` to its path (relative to the
repository root, or absolute). The preflight requires that directory to exist, to be the top
of its own git worktree and to be on `gh-pages`; the deploy step checks that again, and also
that the worktree is clean and level with `origin/gh-pages`. The top-of-worktree check
matters most: a deploy empties the directory with `git rm -rf .` before copying the new
bundle in, and a wrong path must never point that at a subfolder of the main repository. A
worktree is used rather than a second clone because it shares the main repository's objects
and remotes, and rather than `robocopy /MIR` because in a worktree `.git` is a file, which
mirroring deletes.

## Before a release

**Everything to be released is merged into `main` and pushed.** The preflight refuses to
start on any other branch, with uncommitted or untracked files (an untracked file next to the
sources can change what the build picks up), or when `main` is ahead of or behind
`origin/main`. Ahead is refused too: the release commit goes on top of `HEAD` and is pushed
with the release, and work that was never on origin would ride along into it.

**The CHANGELOG has a section for the version.** `docs/CHANGELOG.md` must contain a heading
for exactly that version with at least one top-level `- ` bullet under it, committed and
pushed like everything else:

```markdown
## 1.7.1 — unreleased

- Fixed: …
```

Write `— unreleased` (or nothing) after the version, not a date. The release dates the
heading itself, to `## 1.7.1 — 2026-11-20` in the release machine's local time, as part of
the release commit; a heading that already carries a date is left as written. The section
exists for the users who read the CHANGELOG, and it is also the release description: its body
is copied onto the GitHub release page, followed by a fixed footer with the PWA link, the APK
certificate fingerprint and the two commands to verify a download. Relative links and images
are rewritten on the way, so write them as you would anywhere in `docs/`:
`[architecture.md](architecture.md#library-import)` becomes a link to `docs/architecture.md`
on the release's tag (`https://github.com/julia-shtal/scriptorium-writer/blob/vX.Y.Z/docs/…`),
so it shows the docs as they were at that release. A bare `#anchor` points at
`docs/CHANGELOG.md` on the tag; full URLs, `/`-rooted paths and `mailto:` links are left as
written, and so is anything inside code.

The CHANGELOG check exists because a version once shipped without an entry, and the
"Unreleased" section went on describing already-released platforms as unreleased afterwards.

**Pick the version.** The argument is `major`, `minor` or `patch` (a bump from the version
in `package.json`), or an exact `X.Y.Z`. An exact version may equal the current one, and
usually does: `package.json` is bumped when a milestone starts, while the tag only appears
when the release is cut — so with `package.json` at 1.7.0 and no `v1.7.0` tag yet, the
release is `npm run release -- 1.7.0`, not `minor` (which would give 1.8.0). The version must
be three plain numbers (no `v`, no `-beta.1`, no leading zeros), each below 100, and never lower than the
current one — the rules the Android `versionCode` packing imposes; see
[Versioning](android.md#versioning). Features bump minor, fixes and verification builds bump
patch.

## Cutting a release

```powershell
npm run release -- 1.7.0            # release exactly this version
npm run release -- patch            # or bump from package.json
npm run release -- patch --dry-run  # everything except publishing; see below
npm run release -- --help           # the options
```

**Always put the version and the flags after `--`.** Without it, npm takes flags such as
`--dry-run` as its own settings and does not pass them to the script: `npm run release patch
--dry-run` would hand the script only `patch`. The script detects the trace npm leaves
(`npm_config_dry_run` and the like) and stops before doing anything, so a forgotten `--`
cannot turn a dry run into a real release — but the habit is the actual protection.

A release takes about ten to fifteen minutes, most of it the test suites and the three
builds. Each step prints one line as it starts (`- build.android  cap sync from the frozen
bundle, …`) and streams the output of the npm, Gradle and electron-builder commands it runs.
If anything fails, the run ends with exactly one line starting with `release:` that says what
is wrong and what to do; there is no need to scroll up through build output to find the
reason. An unexpected error (a bug in the script rather than a failed check) says so; re-run
with the environment variable `RELEASE_DEBUG=1` for its stack trace.

A successful run ends with the GitHub release URL and the PWA URL.

## What it does, in order

The release is fifteen steps in four stages. Each has a stable id, which is what the
progress output prints and what `release-out/X.Y.Z/state.json` records.

**Stage 1 — preflight. Checks only, changes nothing.**

1. `preflight.git` — on `main`, working tree clean, `HEAD` equal to `origin/main` (after a
   `git fetch`).
2. `preflight.tag` — the tag `vX.Y.Z` exists neither locally nor on origin.
3. `preflight.changelog` — `docs/CHANGELOG.md` has the version's section with a bullet.
4. `preflight.tools` — `gh` is signed in and no GitHub release `vX.Y.Z` exists yet (not even
   a draft left over from an earlier attempt), a signing key is configured and its keystore
   file exists, `apksigner` is installed, and the `gh-pages` worktree exists, is the top of a
   git worktree and is on `gh-pages`.
5. `preflight.checks` — `npm ci`, `npm run typecheck`, `npm run lint`, `npm test`,
   `npm run test:browser`.

The checks run cheapest first: a forgotten CHANGELOG entry should not cost a full test run to
discover. Their only side effects are the `git fetch` and `npm ci` reinstalling
`node_modules` from the lockfile, which makes the suites test what is committed rather than
whatever happens to be installed. A run that stops in preflight leaves nothing behind — not
even a `release-out/` directory.

**Stage 2 — bump. Local only.**

6. `bump` — `npm version X.Y.Z --no-git-tag-version` (skipped when the version is already
   right), the CHANGELOG heading dated, and exactly those three files — `package.json`,
   `package-lock.json`, `docs/CHANGELOG.md` — committed as `release: vX.Y.Z`. Not pushed.

The version lives only in `package.json`: Gradle derives `versionName` and `versionCode`
from it, and electron-builder and the web build's `version.json` read it. Everything in
stage 3 is built from this commit, so the tag that stage 4 puts on it marks what was really
built. If there is nothing to commit (the version was already right and the heading already
dated), no commit is made.

**Stage 3 — build and verify, all into `release-out/X.Y.Z/`.**

7. `build.web` — `npm run build:web`, then `verify-web-build` (entry, manifest, icons, the
   service-worker precache, size budgets, `version.json`); `version.json` must read
   `X.Y.Z`. The verified `dist-web/` is then **frozen**: copied to `release-out/X.Y.Z/web/`,
   with one digest over all its files (paths, sizes and contents) recorded.
8. `build.android` — `dist-web/` must still equal the frozen bundle (if anything changed it,
   it is restored from the frozen copy, never rebuilt); `npx cap sync android`; Gradle
   `:app:assembleRelease`; `verify-apk` (signed, v2 or v3 signature, certificate fingerprint
   equal to `android/release-fingerprint.txt`, `versionCode`/`versionName` matching
   `package.json`); copied as `Scriptorium-Writer-X.Y.Z.apk`.
9. `build.windows` — `npm run build`, then `electron-builder --win --publish never`. The
   generated `latest.yml` must name exactly `Scriptorium-Writer-Setup-X.Y.Z.exe`, with that
   file's SHA-512 and size. The installer, its `.blockmap` and `latest.yml` are copied over.
10. `build.sums` — every artifact re-hashed against what its step recorded, then
    `SHA256SUMS.txt` (for the `.exe` and the `.apk`, in `sha256sum` format) and
    `release-notes.md` (the CHANGELOG section plus the fixed footer) written.

The web bundle is built once. Android packs that frozen bundle and Pages serves that frozen
bundle, so the code that was verified is byte for byte the code in the APK and the code on the
site (see [Where it is hosted](web-pwa.md#where-it-is-hosted)). The `latest.yml` check is the
one the first release needed: `electron-updater` downloads the file `latest.yml` names, from
the release, and a name that differs by one character is a failed update on every installed
client.

**Stage 4 — publish, in a fixed order.**

11. `publish.push` — `git push origin main`, then an annotated tag `vX.Y.Z` on the release
    commit, then `git push origin vX.Y.Z`.
12. `publish.draft` — `gh release create vX.Y.Z --draft --verify-tag` with the five assets
    (installer, blockmap, `latest.yml`, APK, `SHA256SUMS.txt`) and `release-notes.md` as the
    description. The asset list is then read back from GitHub and compared with the local
    files — name, size, upload state and, where `gh` reports it, SHA-256 — before the step
    counts as done.
13. `publish.pages` — the frozen bundle onto `gh-pages`: in the worktree, `git rm -rf .`, copy
    `release-out/X.Y.Z/web/` in, add `.nojekyll` (without it Pages runs Jekyll, which drops
    every file starting with `_`), commit `deploy vX.Y.Z` with `core.autocrlf=false` so the
    bytes served are the bytes verified, and push.
14. `publish.undraft` — the assets compared once more, then
    `gh release edit vX.Y.Z --draft=false --latest`.
15. `publish.smoke` — poll the live `version.json` on Pages every 15 seconds, up to five
    minutes, until it reads `X.Y.Z` (Pages takes a minute or two to serve a new commit); then
    poll `latest.yml` at the release's download URL the same way until it answers, and check
    that its version is `X.Y.Z` and its path is this version's installer. Both requests
    bypass caches.

**Why the order matters.** Nothing a user can see changes until every artifact is built and
verified. A Gradle failure at minute nine costs nothing but the time: the release commit is
still local and there is no tag. Within stage 4 the order keeps clients safe for as long as
possible:

- **A draft release is invisible to clients.** `electron-updater` and the "latest release"
  link only see published releases, so a draft with half its assets uploaded harms nobody.
  That is why assets go onto a draft first and are compared there.
- **Un-drafting is the go-live moment** for Windows auto-update and the APK download. It
  comes after everything else is in place and the assets have been compared a second time.
- **The PWA goes live one step earlier**, when Pages serves the deploy commit, so for a
  minute or two the web app can be newer than the latest GitHub release. The deploy is a
  single commit on `gh-pages`, so it can be withdrawn by reverting that commit. The tag is
  public from step 11, but no client acts on a tag.

**Every release ships all three platforms.** There is no web-only or Windows-only mode, and
no pre-release mode: a fix for one platform is a patch release of all three. That is
deliberate. `electron-updater` reads the newest non-pre-release release of the repository,
and a release without `latest.yml` and the installer would break the update check of every
installed Windows client. Shipping the full set every time makes that mistake impossible.

## Dry run

```powershell
npm run release -- patch --dry-run
```

A dry run runs stages 1 to 3 for real, then prints the stage 4 commands it would have run,
in order, with the actual paths and names, instead of running them. It is the way to see a
release through before cutting it, and to get installable builds of the next version to try
on a device first.

- **The preflight is the same**, so a dry run also needs a clean `main` level with origin, a
  free tag, a CHANGELOG section and a signed-in `gh`. That is the point: a passing dry run
  means the real run would get at least as far.
- **The bump happens in the working tree** — the builds must carry the target version, or the
  APK's `versionCode` and the installer's name would be the old ones — but nothing is
  committed. `package.json`, `package-lock.json` and `docs/CHANGELOG.md` are put back byte
  for byte when the run ends, whether it succeeded or failed. That restore cannot run if the
  process is killed (Ctrl+C, a closed terminal); then put the three files back by hand with
  `git checkout -- package.json package-lock.json docs/CHANGELOG.md`.
- **The artifacts stay** in `release-out/X.Y.Z/`. A dry run is never resumed, and it does not
  block a real release: the next real run of that version empties the directory before
  building, so a dry run's installer can never be mistaken for a real one and published.
  `npm run release -- --abort X.Y.Z` deletes it explicitly.

## What is in release-out

`release-out/` is at the repository root and gitignored, which is also why it never trips the
clean-tree check. Each release has its own directory:

```
release-out/1.7.0/
  state.json                               which steps are done, and what each recorded
  web/                                     the frozen, verified PWA bundle
  Scriptorium-Writer-Setup-1.7.0.exe       Windows installer
  Scriptorium-Writer-Setup-1.7.0.exe.blockmap
  latest.yml                               electron-updater's manifest for the installer
  Scriptorium-Writer-1.7.0.apk             signed Android APK
  SHA256SUMS.txt                           checksums of the .exe and the .apk
  release-notes.md                         the GitHub release description
```

`state.json` is written atomically after every step — temp file, `fsync`, rename, the same
rule the app follows for chapters — so an interruption at any moment leaves the previous
state rather than half a file. It records each artifact's size and SHA-256; later steps
re-check the files against it, so an artifact that changed after it was verified is refused
rather than published. Do not edit it by hand.

The directory stays after a release. It holds the exact files that were published, which is
useful for a while; delete it whenever it is no longer needed. Electron-builder's own output
folder, `release/`, keeps every installer ever built; the script only ever takes the current
version's files from it.

## When it stops: resume and abort

Every stop ends with the one `release:` line saying what to do. Where the release stopped
decides what that is:

- **In preflight:** nothing was written. Fix the cause and run the same command again.
- **In the bump step itself:** nothing is recorded as done yet, so `--resume` has nothing to
  continue. Follow the message — usually `git checkout -- package.json package-lock.json
  docs/CHANGELOG.md` to drop the half-made edits — and run the same command again.
- **After the bump, before step 11 has pushed anything:** the release commit exists only
  locally. Either fix the cause and continue with `--resume`, or drop the attempt with
  `--abort`.
- **Once step 11 has pushed anything:** the release is partly on GitHub. Fix the cause and
  continue with `--resume`; `--abort` refuses (see below).

A fresh run of a version whose real release is in progress is refused with the same two
choices, because that `state.json` is the only record of a release commit that may need
undoing, or of assets already uploaded.

### --resume

```powershell
npm run release -- --resume           # the one interrupted release
npm run release -- --resume 1.7.1     # if there are several
```

The version comes from `release-out/`, never from a bump word: once the release commit
exists, `patch` would resolve against the already-bumped `package.json` and name the next
version. Without a version, `--resume` picks the one interrupted real release (dry runs and
finished releases are never picked) and refuses to guess if there are several.

It runs the preflight again, against the repository as it is now — but as the continuation of
this release rather than a fresh start: once the bump is done, `HEAD` must still be the
release commit until it has been pushed, and the tag may exist only as this release's own.
The test suites are not run again when the code has not changed since they passed. Then every
step `state.json` records as done is skipped, and the interrupted step runs again from its
start. Verified artifacts are never rebuilt.

Every publish step is safe to run twice: pushing what origin already has is a no-op, an
existing tag is accepted when it is on the release commit, an existing draft only gets the
assets it is missing or holds broken (never a second release), and the Pages deploy is redone
from the same frozen bundle.

Some stops `--resume` cannot get past, and their message says so instead of suggesting it:
the release was made public by someone else, the draft was deleted, `state.json` is not
what the script wrote, or `origin/main` was force-pushed and no longer contains the release
commit. For the last one, never force-push the commit back; the message lists the remaining
steps as manual commands.

### --abort

```powershell
npm run release -- --abort            # the one interrupted release
npm run release -- --abort 1.7.1      # a named one, or a dry run
```

**Only while nothing has been pushed.** It undoes the release commit (`git reset --hard` to
the commit before it, which the bump step recorded) and deletes `release-out/X.Y.Z/` —
nothing else. `git reset --hard` is the one command in the script that can destroy work, so
the abort resets only when `HEAD` is exactly the release commit on `main` and the working
tree is clean; otherwise it refuses and prints the command to run by hand. After an abort,
start the release again from the beginning.

**Once step 11 may have pushed anything, there is no automatic rollback.** `--abort` refuses
when `publish.push` is recorded as done, when a local tag `vX.Y.Z` exists (step 11 got as far
as tagging, and whether the tag reached origin is not something to guess about before a
reset), or when the release commit is already on `origin/main` (step 11 pushed `main` and was
cut off before recording it). In the last two cases the message says how to finish with
`--resume` or undo that push by hand. Once `publish.push` is done, it prints the manual
commands that withdraw the release, for exactly the steps that are done: delete the GitHub
release or draft, delete the tag on origin and locally, revert the `gh-pages` deploy commit,
revert the release commit on `main` if it must go. The script never deletes a pushed tag or a GitHub release itself. Usually the better
choice is to finish with `--resume`, and if the release is wrong, to ship a fixed patch
release: once a release is public, installed clients may already have updated.

## After a release

The smoke step checks what a script can see from outside. Three things need a person and a
device, and each catches a class of mistake the scripts cannot:

- **Windows auto-update.** Start an installed copy of the previous version and wait for the
  background update check. It should download the new version without an error and offer the
  restart in the footer; after the restart the new version runs. See
  [Auto-update](features.md#auto-update).
- **Android install-over.** Install the new APK over the previous one, without
  uninstalling:

  ```powershell
  & "$env:ANDROID_HOME\platform-tools\adb.exe" install -r release-out\1.7.1\Scriptorium-Writer-1.7.1.apk
  ```

  The library must still be there afterwards. `INSTALL_FAILED_UPDATE_INCOMPATIBLE` means the
  signature changed — stop, and find out why before anything else.
  `INSTALL_FAILED_VERSION_DOWNGRADE` means the `versionCode` did not grow. Then check the APK
  downloaded from the release page the way a user would, with
  [Verifying an APK](android.md#verifying-an-apk): the checksum must match `SHA256SUMS.txt`
  and the certificate fingerprint must be the published one.
- **PWA update notice.** Open the installed PWA. It should show the "a new version is
  available" strip; tap Update and the new version loads. The notice is not instant — with
  `registerType: 'prompt'` it appears on a later open, after the service worker has fetched
  the new bundle (see [PWA: install, offline, updates](web-pwa.md#pwa-install-offline-updates)).

If a published release turns out to be wrong, prefer a fixed patch release over withdrawing
it. The exception is the Android signing key, which cannot be fixed by any release: an APK
signed with a different key can never update an existing install. That is why `verify:apk`
runs in stage 3, before anything is public, and not at the end.

## Out of scope

- **Windows code signing.** The installer is unsigned, so Windows shows a SmartScreen warning
  on install (see the [README](../README.md#install)). Signing needs a paid CA-issued
  certificate; it is a separate decision, unrelated to the Android key.
- **An Android App Bundle (`.aab`).** Only the APK is built. An `.aab` is what Google Play
  takes, and Play is not a distribution channel for this app (see
  [Storage and permissions](android.md#storage-and-permissions)).
- **A release button on GitHub.** A `workflow_dispatch` workflow running the same
  `scripts/release.mjs` on a GitHub runner is not built. It would need the signing key in
  GitHub secrets, which is exactly what releasing from the local machine avoids. The one seam it needs already exists:
  the four `SCRIPTORIUM_*` environment variables above, read by both the preflight and
  Gradle when `keystore.properties` is absent.
