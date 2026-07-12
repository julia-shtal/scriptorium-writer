import { describe, expect, test, vi } from 'vitest'
import { requestFlushBeforeQuit } from './quit-flush'

describe('requestFlushBeforeQuit', () => {
  test('resolves when the renderer acks, and only once', async () => {
    let ack: () => void = () => {}
    const send = vi.fn()
    const p = requestFlushBeforeQuit({
      send,
      onceAck: (cb) => {
        ack = cb
      },
      timeoutMs: 5000
    })
    expect(send).toHaveBeenCalledTimes(1)
    ack()
    ack() // second ack must not throw or double-resolve
    await expect(p).resolves.toBeUndefined()
  })

  test('falls back to resolving on timeout when no ack arrives', async () => {
    vi.useFakeTimers()
    const p = requestFlushBeforeQuit({
      send: vi.fn(),
      onceAck: () => {},
      timeoutMs: 5000
    })
    await vi.advanceTimersByTimeAsync(5000)
    await expect(p).resolves.toBeUndefined()
    vi.useRealTimers()
  })
})
