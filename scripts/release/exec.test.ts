/**
 * The runner's one platform-specific rule: on Windows, npm/npx and .bat/.cmd files can only be
 * spawned through a shell (Node refuses them otherwise), and then every argument is quoted for
 * cmd.exe. Everything else is spawned directly. A fake spawnSync stands in for the real one, so
 * these assertions hold on any OS.
 */
import { describe, it, expect } from 'vitest'
import { createRunner, firstLine, quoteForCmd, resolveCommand } from './exec.mjs'

type SpawnCall = { command: string; args: unknown; options: Record<string, unknown> }

function fakeSpawn(result: Record<string, unknown> = { status: 0, stdout: 'out', stderr: '' }) {
  const calls: SpawnCall[] = []
  const spawn = (command: string, argsOrOptions: unknown, maybeOptions?: Record<string, unknown>) => {
    // spawnSync(cmd, options) for the shell form, spawnSync(cmd, args, options) otherwise.
    if (maybeOptions === undefined) calls.push({ command, args: null, options: argsOrOptions as Record<string, unknown> })
    else calls.push({ command, args: argsOrOptions, options: maybeOptions })
    return result
  }
  return { calls, spawn }
}

describe('resolveCommand', () => {
  it('runs npm/npx and batch files through a shell on Windows only', () => {
    expect(resolveCommand('npm', 'win32')).toEqual({ file: 'npm.cmd', shell: true })
    expect(resolveCommand('npx', 'win32')).toEqual({ file: 'npx.cmd', shell: true })
    expect(resolveCommand('android\\gradlew.bat', 'win32')).toEqual({ file: 'android\\gradlew.bat', shell: true })
    expect(resolveCommand('git', 'win32')).toEqual({ file: 'git', shell: false })
    expect(resolveCommand('npm', 'linux')).toEqual({ file: 'npm', shell: false })
  })
})

describe('createRunner', () => {
  it('spawns git directly with an argument array', () => {
    const { calls, spawn } = fakeSpawn()
    const run = createRunner({ platform: 'win32', spawn })
    expect(run('git', ['status', '--porcelain'], { cwd: 'C:\\repo' })).toEqual({ status: 0, stdout: 'out', stderr: '', error: null })
    expect(calls[0]).toMatchObject({ command: 'git', args: ['status', '--porcelain'], options: { cwd: 'C:\\repo', stdio: 'pipe' } })
    expect(calls[0].options.shell).toBeUndefined()
  })

  it('hands npm to cmd.exe as one quoted string on Windows', () => {
    const { calls, spawn } = fakeSpawn()
    createRunner({ platform: 'win32', spawn })('npm', ['run', 'test:browser'], { capture: false })
    expect(calls[0]).toMatchObject({ command: 'npm.cmd "run" "test:browser"', args: null, options: { shell: true, stdio: 'inherit' } })
  })

  it('quotes a batch-file path only when it contains whitespace', () => {
    const { calls, spawn } = fakeSpawn()
    const run = createRunner({ platform: 'win32', spawn })
    run('C:\\My Repo\\android\\gradlew.bat', ['-p', 'android'])
    run('android\\gradlew.bat', [':app:assembleRelease'])
    expect(calls.map((c) => c.command)).toEqual(['"C:\\My Repo\\android\\gradlew.bat" "-p" "android"', 'android\\gradlew.bat ":app:assembleRelease"'])
  })

  it('reports streamed output as empty strings and passes other spawn errors through', () => {
    const error = Object.assign(new Error('spawn gh EACCES'), { code: 'EACCES' })
    const { spawn } = fakeSpawn({ status: null, stdout: null, stderr: null, error })
    expect(createRunner({ platform: 'linux', spawn })('gh', ['auth', 'status'])).toEqual({ status: null, stdout: '', stderr: '', error })
  })

  it('words a missing program as "<cmd> not found on PATH", on both spawn paths', () => {
    const enoent = Object.assign(new Error('spawn gh ENOENT'), { code: 'ENOENT' })
    const direct = fakeSpawn({ status: null, stdout: '', stderr: '', error: enoent })
    expect(createRunner({ platform: 'win32', spawn: direct.spawn })('gh', ['auth', 'status']).error?.message).toBe('gh not found on PATH')

    const viaCmd = fakeSpawn({ status: 9009, stdout: null, stderr: null })
    expect(createRunner({ platform: 'win32', spawn: viaCmd.spawn })('npx', ['cap'], { capture: false }).error?.message).toBe(
      'npx not found on PATH'
    )

    const message = fakeSpawn({ status: 1, stdout: '', stderr: "'npm.cmd' is not recognized as an internal or external command,\r\n" })
    expect(createRunner({ platform: 'win32', spawn: message.spawn })('npm', ['ci']).error?.message).toBe('npm not found on PATH')
  })
})

// The fakes above prove the branching; these two prove the real thing on the platform where the
// shell path exists at all — that Node really does let npm.cmd through with this quoting. The
// first one is not a formality: it is how the quoted-"npm.cmd" %~dp0 breakage was found.
describe.skipIf(process.platform !== 'win32')('createRunner on real Windows', () => {
  it('runs npm --version through cmd.exe', () => {
    const res = createRunner()('npm', ['--version'])
    expect(res.error).toBeNull()
    expect(res.status).toBe(0)
    expect(res.stdout.trim()).toMatch(/^\d+\.\d+\.\d+/)
  })

  it('reports a missing batch file as not found on PATH', () => {
    const res = createRunner()('scriptorium-no-such-tool.cmd', [])
    expect(res.error?.message).toBe('scriptorium-no-such-tool.cmd not found on PATH')
  })
})

describe('quoteForCmd', () => {
  it('quotes plain arguments, including paths with spaces', () => {
    expect(quoteForCmd('C:\\Program Files\\x')).toBe('"C:\\Program Files\\x"')
  })
  it.each(['a"b', '100%', 'a&b', 'a|b', 'a^b', 'a\nb'])('refuses %j rather than escaping it half-right', (arg) => {
    expect(() => quoteForCmd(arg)).toThrow(/shell metacharacter/)
  })
})

describe('firstLine', () => {
  it('is the first non-blank line, trimmed', () => {
    expect(firstLine('\n  fatal: no remote\r\nmore')).toBe('fatal: no remote')
    expect(firstLine('')).toBe('')
  })
})
