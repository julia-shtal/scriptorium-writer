// scripts/release/state.mjs
// release-out/X.Y.Z/state.json: which steps of a release are done. It is what lets an
// interrupted release continue without rebuilding verified artifacts (--resume) or be dropped
// cleanly (--abort), so it gets the same treatment as user data in the app: written atomically
// (temp file in the same directory, fsync, rename over the target), never in place, so a crash
// or Ctrl+C mid-write leaves the previous state rather than half a JSON file.
//
// Shape: { schemaVersion: 1, version, startedAt, dryRun, steps: { "<id>": { done, at, ...data } } }
// Step ids are stable strings (see STEP_IDS in pipeline.mjs); a step may record data it hands to
// a later step or a later run — e.g. the bump commit's SHA, which --abort resets past.
import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { ReleaseError } from './errors.mjs'

export const STATE_SCHEMA_VERSION = 1

/** release-out/X.Y.Z under the repo root. Gitignored, so the clean-tree check never sees it. */
export const releaseDir = (root, version) => join(root, 'release-out', version)
export const statePath = (root, version) => join(releaseDir(root, version), 'state.json')

export function newState({ version, dryRun, now = new Date() }) {
  return { schemaVersion: STATE_SCHEMA_VERSION, version, startedAt: now.toISOString(), dryRun: Boolean(dryRun), steps: {} }
}

/** Records step `id` as done, with optional data for later steps. Mutates and returns `state`. */
export function markDone(state, id, data = {}, now = new Date()) {
  state.steps[id] = { ...data, done: true, at: now.toISOString() }
  return state
}

export const isDone = (state, id) => state?.steps?.[id]?.done === true

/** The state at `file`, or null if there is none. A file that exists but cannot be trusted is
 *  an error, not a fresh start: guessing would mean redoing (or skipping) a publish step. */
export function readState(file) {
  if (!existsSync(file)) return null
  let state
  try {
    state = JSON.parse(readFileSync(file, 'utf8'))
  } catch (err) {
    throw new ReleaseError(`${file} is not valid JSON (${err.message}) — inspect it, or delete it to start this version over.`)
  }
  if (state?.schemaVersion !== STATE_SCHEMA_VERSION || typeof state.version !== 'string' || typeof state.steps !== 'object' || state.steps === null) {
    throw new ReleaseError(
      `${file} is not a schemaVersion ${STATE_SCHEMA_VERSION} release state — inspect it, or delete it to start this version over.`
    )
  }
  return state
}

// On Windows, renaming over a file fails with EPERM/EBUSY/EACCES for as long as anything holds
// it open without FILE_SHARE_DELETE — typically an antivirus scan or the search indexer reading
// the file we wrote a moment ago. Those holds last milliseconds, so a few short retries ride
// them out; a real permission problem still fails after the last one.
const RENAME_RETRY_CODES = new Set(['EPERM', 'EBUSY', 'EACCES'])
const RENAME_DELAYS_MS = [20, 50, 100, 200, 400]
const sleepSync = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)

function renameWithRetry(from, to, { platform, rename }) {
  for (let attempt = 0; ; attempt++) {
    try {
      rename(from, to)
      return
    } catch (err) {
      if (platform !== 'win32' || !RENAME_RETRY_CODES.has(err?.code) || attempt >= RENAME_DELAYS_MS.length) throw err
      sleepSync(RENAME_DELAYS_MS[attempt])
    }
  }
}

/**
 * Atomic write: temp file next to the target, fsync, rename. Creates the directory if needed.
 * `data` is a string (written as UTF-8) or a Buffer. Used for state.json and for the small
 * files the release writes into release-out/ (SHA256SUMS.txt, release-notes.md).
 * `platform` and `rename` are injectable only so the Windows retry can be tested anywhere.
 */
export function writeFileAtomic(file, data, { platform = process.platform, rename = renameSync } = {}) {
  mkdirSync(dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`
  try {
    const fd = openSync(tmp, 'w')
    try {
      // writeFileSync on a descriptor loops until every byte is written; a bare writeSync may
      // legally write only part of the buffer and report it in a return value easy to ignore.
      writeFileSync(fd, data)
      fsyncSync(fd)
    } finally {
      closeSync(fd)
    }
    renameWithRetry(tmp, file, { platform, rename })
  } catch (err) {
    rmSync(tmp, { force: true })
    throw err
  }
}

/** state.json, written atomically (see writeFileAtomic). */
export function writeState(file, state, options = {}) {
  writeFileAtomic(file, `${JSON.stringify(state, null, 2)}
`, options)
}

/**
 * Empties release-out/X.Y.Z/ except state.json. A fresh (non --resume) run calls this once
 * preflight has passed, so an artifact left by an earlier run — a dry run's installer, an APK
 * built from a since-amended commit — can never be mistaken for one this run produced and get
 * published. state.json itself is about to be overwritten by the new run's state.
 */
export function clearReleaseDir(dir) {
  if (!existsSync(dir)) return []
  const removed = []
  for (const name of readdirSync(dir)) {
    if (name === 'state.json') continue
    rmSync(join(dir, name), { recursive: true, force: true })
    removed.push(name)
  }
  return removed
}

/**
 * Records that step `id` has STARTED changing something outside this process, before it has
 * finished. isDone() still reads it as not done, so the step runs again on --resume; the step
 * itself reads the marker to tell its own half-finished work from someone else's (publish.pages
 * accepts a dirty gh-pages worktree only when it was the one that dirtied it). Mutates `state`.
 */
export function markStarted(state, id, now = new Date()) {
  state.steps[id] = { ...state.steps[id], done: false, startedAt: now.toISOString() }
  return state
}

export const isStarted = (state, id) => Boolean(state?.steps?.[id]?.startedAt)

/**
 * Every release-out/<dir>/state.json, as [{ file, state }] in directory-name order. A state that
 * cannot be read is an error here too (readState): --resume with no version picks "the one
 * interrupted release", and a state it could not read might be exactly that one.
 */
export function listStates(root) {
  const base = join(root, 'release-out')
  if (!existsSync(base)) return []
  return readdirSync(base, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort()
    .map((name) => statePath(root, name))
    .filter((file) => existsSync(file))
    .map((file) => {
      const state = readState(file)
      // A state filed under the wrong version would make --resume or --abort act on one release
      // while touching another's directory; this script never writes one, so it is refused.
      const folder = basename(dirname(file))
      if (state.version !== folder) {
        throw new ReleaseError(`${file} records version ${state.version} but sits in release-out/${folder}/ — it was not written there by this script; inspect or delete it.`)
      }
      return { file, state }
    })
}
