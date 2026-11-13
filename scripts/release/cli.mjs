// scripts/release/cli.mjs
// Command-line parsing for `npm run release -- <major|minor|patch|X.Y.Z> [flags]`. Hand-rolled
// rather than node:util parseArgs because the surface is four flags and one positional, and the
// errors have to read as release instructions, not as a generic parser's complaint.
import { ReleaseError } from './errors.mjs'

export const USAGE = [
  'Usage: npm run release -- <major|minor|patch|X.Y.Z> [--dry-run]',
  '       npm run release -- --resume [X.Y.Z] | --abort [X.Y.Z]',
  '',
  '  major|minor|patch  bump package.json from its current version',
  '  X.Y.Z              release exactly this version (may equal the current one,',
  '                     e.g. when package.json was bumped before the release was cut)',
  '  --dry-run          run preflight, bump and build into release-out/X.Y.Z/, then',
  '                     restore the bumped files and only print what publishing would do',
  '  --resume           continue an interrupted release from its first unfinished step;',
  '                     the version comes from release-out/ (name it if there are several)',
  '  --abort            drop an interrupted release before anything was pushed: undo the',
  '                     release commit and delete release-out/X.Y.Z/ (also drops a dry run)',
  '  --help             show this text',
  '',
  'Full procedure: docs/releasing.md'
].join('\n')

/**
 * argv (without node and the script path) -> { help: true } or
 * { spec, dryRun, resume, abort }. `spec` is the raw version argument, resolved later against
 * package.json by version.mjs; it may be null with --resume / --abort, which take the version
 * from release-out/ instead (resume.mjs refuses anything but an exact X.Y.Z there).
 */
export function parseArgs(argv) {
  const opts = { help: false, spec: null, dryRun: false, resume: false, abort: false }
  const flags = { '--dry-run': 'dryRun', '--resume': 'resume', '--abort': 'abort', '--help': 'help', '-h': 'help' }
  for (const arg of argv) {
    if (arg === '--') continue
    if (arg in flags) {
      opts[flags[arg]] = true
    } else if (arg.startsWith('-')) {
      throw new ReleaseError(`unknown option ${arg} — run with --help for the options.`)
    } else if (opts.spec === null) {
      opts.spec = arg
    } else {
      throw new ReleaseError(`one version argument expected, got "${opts.spec}" and "${arg}".`)
    }
  }
  if (opts.help) return { help: true }
  if (opts.resume && opts.abort) {
    throw new ReleaseError('--resume and --abort contradict each other — pick one.')
  }
  if (opts.dryRun && (opts.resume || opts.abort)) {
    throw new ReleaseError('--dry-run starts a fresh run; it cannot be combined with --resume or --abort.')
  }
  if (opts.spec === null && !opts.resume && !opts.abort) {
    throw new ReleaseError('no version given — say major, minor, patch or X.Y.Z (run with --help for details).')
  }
  const { help: _help, ...rest } = opts
  return rest
}
