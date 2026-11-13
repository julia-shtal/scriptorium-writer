// scripts/release/resume.mjs
// Which release an `npm run release -- --resume` or `--abort` acts on. Both take the version
// from release-out/X.Y.Z/state.json rather than from a bump word: once the bump commit exists,
// "minor" would resolve against the already-bumped package.json and name the NEXT version.
//
// CLI shape: with no version, the one interrupted real release under release-out/ is picked
// (an interrupted release is one that got past preflight and has not finished publish.smoke;
// dry-run states and finished releases are never picked). Several of them is a refusal that
// names them, because guessing would mean pushing or resetting the wrong release. With an
// explicit X.Y.Z, exactly release-out/X.Y.Z/state.json is used; a bump word is refused.
import { relative } from 'node:path'
import { ReleaseError } from './errors.mjs'
import { isDone, listStates, readState, statePath } from './state.mjs'
import { parseSemver } from './version.mjs'

export const RESUME_CMD = 'npm run release -- --resume'
export const ABORT_CMD = 'npm run release -- --abort'

/** The first and last publish step ids (see STEP_IDS in pipeline.mjs, which must list both). */
export const FIRST_PUBLISH_STEP = 'publish.push'
export const LAST_STEP = 'publish.smoke'

export const isFinished = (state) => isDone(state, LAST_STEP)
/** Got past preflight: bump or any later step is recorded as done. */
export const pastPreflight = (state) => Object.keys(state.steps).some((id) => !id.startsWith('preflight.') && isDone(state, id))
export const isInterrupted = (state) => !state.dryRun && pastPreflight(state) && !isFinished(state)

const posix = (root, file) => relative(root, file).split('\\').join('/')

/**
 * The { file, state } that --resume or --abort (`flag`) acts on, or a ReleaseError saying why
 * there is none. Only picks; what the state allows is checked by the caller.
 */
export function pickState(root, spec, flag) {
  if (spec !== null && spec !== undefined) {
    if (!parseSemver(spec)) {
      throw new ReleaseError(
        `${flag} takes the version from release-out/, so give an exact X.Y.Z or nothing — not "${spec}" (after the bump commit a bump word would name the next version).`
      )
    }
    const file = statePath(root, spec)
    const state = readState(file)
    if (!state) throw new ReleaseError(`there is no ${posix(root, file)} — no release of ${spec} to ${flag.slice(2)}.`)
    if (state.version !== spec) {
      throw new ReleaseError(`${posix(root, file)} records version ${state.version}, not ${spec} — inspect it; it was not written by this script for ${spec}.`)
    }
    return { file, state }
  }

  const interrupted = listStates(root).filter(({ state }) => isInterrupted(state))
  if (interrupted.length === 1) return interrupted[0]
  if (!interrupted.length) {
    throw new ReleaseError(
      `no interrupted release under release-out/ — nothing to ${flag.slice(2)} (dry runs and finished releases are not picked; name one with ${flag} X.Y.Z).`
    )
  }
  const versions = interrupted.map(({ state }) => state.version)
  throw new ReleaseError(
    `${versions.length} interrupted releases under release-out/ (${versions.join(', ')}) — say which: npm run release -- ${flag} ${versions[0]}`
  )
}

/** Refuses a state --resume must not continue: a dry run, or a release that already finished. */
export function checkResumable(root, file, state) {
  if (state.dryRun) {
    throw new ReleaseError(
      `${posix(root, file)} is from a dry run, which is never resumed — start a real release with \`npm run release -- ${state.version}\` (or drop it with \`${ABORT_CMD} ${state.version}\`).`
    )
  }
  if (isFinished(state)) {
    throw new ReleaseError(`v${state.version} is already fully released (${posix(root, file)} records ${LAST_STEP}) — nothing to resume.`)
  }
}
