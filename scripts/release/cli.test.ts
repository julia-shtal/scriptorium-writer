/**
 * Argument parsing for scripts/release.mjs. Every rejection is a ReleaseError, because the
 * entry point prints those as one "release: ..." line instead of a stack trace.
 */
import { describe, it, expect } from 'vitest'
import { ReleaseError } from './errors.mjs'
import { parseArgs } from './cli.mjs'

describe('parseArgs', () => {
  it('reads a bump word or a version, with --dry-run', () => {
    expect(parseArgs(['minor'])).toEqual({ spec: 'minor', dryRun: false, resume: false, abort: false })
    expect(parseArgs(['1.7.0', '--dry-run'])).toEqual({ spec: '1.7.0', dryRun: true, resume: false, abort: false })
    expect(parseArgs(['--dry-run', 'patch'])).toMatchObject({ spec: 'patch', dryRun: true })
  })
  it('ignores a stray -- separator', () => {
    expect(parseArgs(['--', 'major'])).toMatchObject({ spec: 'major' })
  })
  it('returns help alone, whatever else is on the line', () => {
    expect(parseArgs(['--help'])).toEqual({ help: true })
    expect(parseArgs(['minor', '-h'])).toEqual({ help: true })
  })
  it('accepts --resume and --abort without a version', () => {
    expect(parseArgs(['--resume'])).toMatchObject({ resume: true, spec: null })
    expect(parseArgs(['--abort'])).toMatchObject({ abort: true, spec: null })
  })
  it('passes a version given with --resume / --abort on, for resume.mjs to pick the state by', () => {
    expect(parseArgs(['--resume', '1.8.0'])).toMatchObject({ resume: true, spec: '1.8.0' })
    expect(parseArgs(['1.8.0', '--abort'])).toMatchObject({ abort: true, spec: '1.8.0' })
  })
  it.each([
    [[], /no version given/],
    [['minor', 'patch'], /one version argument expected/],
    [['minor', '--force'], /unknown option --force/],
    [['--resume', '--abort'], /contradict/],
    [['minor', '--dry-run', '--resume'], /cannot be combined/]
  ])('rejects %j', (argv, message) => {
    expect(() => parseArgs(argv)).toThrow(ReleaseError)
    expect(() => parseArgs(argv)).toThrow(message)
  })
})
