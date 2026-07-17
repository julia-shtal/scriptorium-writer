import { describe, expect, test, vi } from 'vitest'
import { initAutoUpdate, type AutoUpdateDeps } from './auto-update'
import type { UpdateDownloadedInfo } from '@shared/types'

/** Build deps with sensible no-op defaults; override per test. */
function makeDeps(over: Partial<AutoUpdateDeps> = {}): AutoUpdateDeps {
  return {
    checkForUpdates: () => Promise.resolve(),
    onUpdateDownloaded: () => {},
    sendToRenderer: vi.fn(),
    onRestartRequest: () => {},
    flush: () => Promise.resolve(),
    quitAndInstall: vi.fn(),
    log: () => {},
    ...over
  }
}

describe('initAutoUpdate', () => {
  test('a failed/rejected update check is swallowed and never throws (offline → launch unaffected)', async () => {
    const log = vi.fn()
    // Simulate an offline / unreachable GitHub: the check rejects.
    expect(() =>
      initAutoUpdate(
        makeDeps({
          checkForUpdates: () => Promise.reject(new Error('ENOTFOUND api.github.com')),
          log
        })
      )
    ).not.toThrow()

    // Let the swallowed rejection settle, then assert it was logged, not rethrown.
    await Promise.resolve()
    await Promise.resolve()
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining('check failed'),
      expect.any(Error)
    )
  })

  test('a synchronous throw from checkForUpdates does not escape init', () => {
    expect(() =>
      initAutoUpdate(
        makeDeps({
          checkForUpdates: () => {
            throw new Error('boom')
          }
        })
      )
    ).not.toThrow()
  })

  test('forwards update-downloaded to the renderer', () => {
    // Holder object so TS control-flow doesn't narrow the callback ref to `never`.
    const emit: { cb: ((info: UpdateDownloadedInfo) => void) | null } = { cb: null }
    const sendToRenderer = vi.fn()
    initAutoUpdate(
      makeDeps({
        onUpdateDownloaded: (cb) => {
          emit.cb = cb
        },
        sendToRenderer
      })
    )
    emit.cb?.({ version: '1.2.3' })
    expect(sendToRenderer).toHaveBeenCalledWith({ version: '1.2.3' })
  })

  test('restart handler flushes BEFORE quitAndInstall (ordering guarantee)', async () => {
    const order: string[] = []
    const restart: { cb: (() => void) | null } = { cb: null }

    initAutoUpdate(
      makeDeps({
        onRestartRequest: (cb) => {
          restart.cb = cb
        },
        flush: async () => {
          order.push('flush')
        },
        quitAndInstall: () => {
          order.push('quitAndInstall')
        }
      })
    )

    restart.cb?.()
    // Allow the async flush to resolve before quitAndInstall runs.
    await vi.waitFor(() => expect(order).toContain('quitAndInstall'))

    expect(order).toEqual(['flush', 'quitAndInstall'])
  })

  test('still installs if the flush rejects (but flush is attempted first)', async () => {
    const order: string[] = []
    const restart: { cb: (() => void) | null } = { cb: null }

    initAutoUpdate(
      makeDeps({
        onRestartRequest: (cb) => {
          restart.cb = cb
        },
        flush: async () => {
          order.push('flush')
          throw new Error('flush failed')
        },
        quitAndInstall: () => {
          order.push('quitAndInstall')
        }
      })
    )

    restart.cb?.()
    await vi.waitFor(() => expect(order).toContain('quitAndInstall'))
    expect(order).toEqual(['flush', 'quitAndInstall'])
  })
})
