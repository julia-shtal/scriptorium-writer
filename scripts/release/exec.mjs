// scripts/release/exec.mjs
// The single door through which the release pipeline starts a child process (git, gh, npm,
// Gradle). Every stage receives the runner as a parameter instead of importing child_process,
// for one reason: the tests pass a fake that records each call and returns canned output, so
// "a dirty tree stops the run and changes nothing" can be asserted as "no mutating command was
// ever issued" — without a real repository, a network, or a GitHub token anywhere near a test.
//
// A runner is `run(cmd, args, { cwd, env, capture }) -> { status, stdout, stderr, error }`.
// It never throws on a non-zero exit; the caller decides what a failure means and words it.
import { spawnSync } from 'node:child_process'
import { ReleaseError } from './errors.mjs'

// npm and npx are .cmd shims on Windows, and since the 2024 batch-file hardening Node refuses
// to spawn a .cmd/.bat without a shell (EINVAL). Everything else (git, gh) is a real .exe and
// runs with shell: false, so its arguments are never re-parsed by cmd.exe.
const WINDOWS_CMD_SHIMS = new Set(['npm', 'npx'])

/** How to launch `cmd` on `platform`: the file name and whether it needs a shell. */
export function resolveCommand(cmd, platform = process.platform) {
  if (platform !== 'win32') return { file: cmd, shell: false }
  if (WINDOWS_CMD_SHIMS.has(cmd)) return { file: `${cmd}.cmd`, shell: true }
  if (/\.(bat|cmd)$/i.test(cmd)) return { file: cmd, shell: true }
  return { file: cmd, shell: false }
}

/**
 * One argument, quoted for cmd.exe. Only used on the shell path, where the whole command is
 * handed to cmd.exe as one string; quoting every argument is what keeps a path with spaces
 * ("C:\Program Files\...") in one piece. The arguments are all chosen by this script (versions,
 * paths under the repo, npm script names), never free user text, so an argument that would need
 * real escaping — a double quote or a cmd.exe metacharacter — is a bug, refused loudly rather
 * than escaped half-right.
 */
export function quoteForCmd(arg) {
  if (/["%!^&|<>\r\n]/.test(arg)) {
    throw new Error(`refusing to pass ${JSON.stringify(arg)} through cmd.exe: it contains a shell metacharacter`)
  }
  return `"${arg}"`
}

/**
 * The program name, for the same cmd.exe string — quoted only when it has to be. cmd.exe has a
 * long-standing quirk: a batch file found through PATH and invoked by a QUOTED name gets the
 * current directory as %~dp0 instead of its own. npm.cmd locates npm-cli.js through %~dp0, so
 * `"npm.cmd" --version` fails with "Cannot find module <cwd>\node_modules\npm\bin\npm-cli.js".
 * Bare names never need quotes; a full path with a space still gets them (and a full path is
 * not looked up through PATH, so it is unaffected).
 */
export function quoteCommandForCmd(file) {
  const quoted = quoteForCmd(file)
  return /\s/.test(file) ? quoted : file
}

/**
 * The real runner. `capture: true` (the default) collects stdout/stderr for the caller to parse;
 * `capture: false` streams them straight to the terminal, for the long steps (npm ci, the test
 * suites, builds) whose output the operator wants to watch and whose result is just the exit code.
 * `spawn` is injectable only so the Windows shell path can be tested on any machine.
 */
export function createRunner({ platform = process.platform, spawn = spawnSync } = {}) {
  return function run(cmd, args = [], { cwd, env, capture = true } = {}) {
    const { file, shell } = resolveCommand(cmd, platform)
    const options = {
      cwd,
      env,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      stdio: capture ? 'pipe' : 'inherit',
      windowsHide: true
    }
    const res = shell
      ? spawn([quoteCommandForCmd(file), ...args.map(quoteForCmd)].join(' '), { ...options, shell: true })
      : spawn(file, args, options)
    const stdout = res.stdout ?? ''
    const stderr = res.stderr ?? ''
    return { status: res.status, stdout, stderr, error: notFound(cmd, res, shell, stderr) ?? res.error ?? null }
  }
}

// A missing program looks different on each path: a direct spawn fails with ENOENT, while
// cmd.exe starts fine and exits 9009 with "'x' is not recognized as an internal or external
// command" (only visible when output is captured, hence the exit-code check too). Both become
// the same plain error, so callers can word one message for "not installed".
function notFound(cmd, res, shell, stderr) {
  const missing = shell
    ? res.status === 9009 || /is not recognized as an internal or external command/i.test(stderr)
    : res.error?.code === 'ENOENT'
  return missing ? new Error(`${cmd} not found on PATH`) : null
}

/** First non-empty line of a command's output, for quoting it inside a one-line error. */
export function firstLine(text) {
  return (
    String(text ?? '')
      .split(/\r?\n/)
      .map((l) => l.trim())
      .find(Boolean) ?? ''
  )
}

/**
 * Runs `cmd args` through ctx.run in the repo root with ctx.env, and turns a failure into a
 * one-line ReleaseError ending in `hint` (what the operator should do). Returns the result for
 * callers that read stdout. `capture: false` streams the output, for the long build commands.
 */
export function runChecked(ctx, cmd, args, { capture = true, hint = 'fix it, then run the release again.', cwd = ctx.root } = {}) {
  const label = [cmd, ...args].join(' ')
  const res = ctx.run(cmd, args, { cwd, env: ctx.env, capture })
  if (res.error) throw new ReleaseError(`could not run \`${label}\` (${res.error.message}) — ${hint}`)
  if (res.status !== 0) {
    const detail = capture ? firstLine(res.stderr) || firstLine(res.stdout) : ''
    throw new ReleaseError(`\`${label}\` failed (exit ${res.status ?? 'signal'}${detail ? `: ${detail}` : ''}) — ${hint}`)
  }
  return res
}
