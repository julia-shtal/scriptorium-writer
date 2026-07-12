/**
 * Regression coverage for the bug the M4 review caught:
 * `createReadStream` when piped into `res` can error AFTER headers are flushed
 * (e.g. file deleted mid-transfer). The original handler tried to assign
 * `res.statusCode = 500` post-flush, which throws `ERR_HTTP_HEADERS_SENT` out
 * of the async error handler and surfaces as an uncaughtException.
 *
 * Kept in a separate file because the `vi.mock('node:fs', …)` factory at the
 * top of this file would otherwise pull a vi.fn wrapper into the basic
 * tests in `dict-server.test.ts`, where it is not needed.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as fsMod from 'node:fs'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import type { ReadStream } from 'node:fs'
import { Readable } from 'node:stream'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { startDictionaryServer, type DictionaryServer } from './dict-server'

// Node ESM built-ins have their `createReadStream` export descriptor locked
// (non-configurable), so `vi.spyOn` cannot Object.defineProperty over it.
// Mock the module up front, wrapping the real `createReadStream` in a
// `vi.fn` whose default implementation delegates to Node's real one. Tests
// swap it per-case via `vi.mocked(fsMod.createReadStream).mockReturnValue`.
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>()
  return {
    ...actual,
    default: actual,
    createReadStream: vi.fn(actual.createReadStream)
  }
})

/** True iff console.error was called with our `[dict-server] failed to read` prefix. */
const loggedReadError = (spy: ReturnType<typeof vi.spyOn>): boolean =>
  spy.mock.calls.some(
    ([msg, target]) =>
      typeof msg === 'string' &&
      msg.includes('[dict-server] failed to read') &&
      typeof target === 'string'
  )

describe('startDictionaryServer — stream error handling', () => {
  let dir: string
  let server: DictionaryServer | undefined
  let errorSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'm4-stream-'))
    // The .bdic must exist on disk so the server's `existsSync` gate passes;
    // we then swap what `createReadStream` actually returns.
    writeFileSync(join(dir, 'ru.bdic'), Buffer.from('FAKE-RU-BDIC'))
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(async () => {
    await server?.close()
    vi.mocked(fsMod.createReadStream).mockReset()
    errorSpy.mockRestore()
    rmSync(dir, { recursive: true, force: true })
  })

  it('returns 500 when the source stream errors before any byte is flushed', async () => {
    const failingStream = new Readable({
      read() {
        // No push — emit error on the next tick, before any byte flows.
        process.nextTick(() => this.emit('error', new Error('forced pre-flush failure')))
      }
    })
    vi.mocked(fsMod.createReadStream).mockReturnValue(failingStream as unknown as ReadStream)

    server = await startDictionaryServer(dir, ['ru'])
    const res = await fetch(`${server.url}ru-3-0.bdic`)
    expect(res.status).toBe(500)
    expect(loggedReadError(errorSpy)).toBe(true)
  })

  // Regression: when the source stream errors AFTER headers are flushed,
  // the pre-fix handler tried to mutate `res.statusCode` post-flush, which
  // throws `ERR_HTTP_HEADERS_SENT` out of the async `'error'` handler and
  // surfaces as an uncaughtException. The fix destroys the response. We
  // assert two things:
  //   1. The server process survives (reaching the assertions is itself
  //      part of the regression check — a regression would abort vitest
  //      on the unhandled exception).
  //   2. The destroy branch ran, NOT the pre-flush 500 branch. Once headers
  //      were flushed (status 200 + Content-Type), `statusCode` cannot be
  //      retroactively changed to 500; the client therefore sees either a
  //      200 with a truncated body or a connection reset, never 500.
  //
  // `setImmediate` (rather than `process.nextTick`) defers the error until
  // after a full event-loop turn, giving `pipe → res.write` a chance to
  // actually flush the headers across Node schedulings.
  it('does not crash and does not return 500 when the source errors after flush', async () => {
    const failingStream = new Readable({
      read() {
        // Two non-trivial chunks; the first write through `pipe` flushes
        // the response headers under any Node scheduling.
        this.push(Buffer.from('partial-payload-aaaa-bbbb-cccc-dddd'))
        this.push(Buffer.from('more-payload-aaaa-bbbb-cccc-dddd'))
        setImmediate(() => this.emit('error', new Error('forced post-flush failure')))
      }
    })
    vi.mocked(fsMod.createReadStream).mockReturnValue(failingStream as unknown as ReadStream)

    server = await startDictionaryServer(dir, ['ru'])

    let observedStatus: number | null = null
    try {
      const res = await fetch(`${server.url}ru-3-0.bdic`)
      observedStatus = res.status
      // Consume the body so any truncation surfaces here, not elsewhere.
      await res.text().catch(() => {})
    } catch {
      // Acceptable: connection reset on the destroyed mid-stream response.
    }

    expect(loggedReadError(errorSpy)).toBe(true)
    // If `observedStatus === 500`, the wrong pre-flush branch ran instead
    // of the destroy branch — the fix regressed.
    expect(observedStatus).not.toBe(500)
  })
})
