/** Injected side-effects so the coordinator is unit-testable without Electron. */
export interface QuitFlushDeps {
  /** Ask the renderer to flush (e.g. webContents.send). */
  send: () => void
  /** Register a one-shot ack listener (e.g. ipcMain.once). */
  onceAck: (cb: () => void) => void
  /** Safety cap so a hung/closed renderer can never block quit forever. */
  timeoutMs: number
}

/**
 * Request a final renderer flush and resolve when it acks — or after `timeoutMs`,
 * whichever comes first. Idempotent: a late ack after timeout is a no-op.
 */
export function requestFlushBeforeQuit(deps: QuitFlushDeps): Promise<void> {
  return new Promise<void>((resolve) => {
    let done = false
    const finish = (): void => {
      if (done) return
      done = true
      clearTimeout(timer)
      resolve()
    }
    const timer = setTimeout(finish, deps.timeoutMs)
    deps.onceAck(finish)
    deps.send()
  })
}
