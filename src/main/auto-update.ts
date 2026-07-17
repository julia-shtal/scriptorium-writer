import type { UpdateDownloadedInfo } from '@shared/types'

/**
 * Injected side-effects so the auto-update coordinator is unit-testable without
 * Electron, `electron-updater`, or the network. The thin adapter in `index.ts` wires
 * the real `autoUpdater` + `BrowserWindow`/`ipcMain` into these.
 */
export interface AutoUpdateDeps {
  /**
   * Kick off the background update check. May reject (offline / GitHub unreachable /
   * rate-limited) — this module swallows that so launch is never affected.
   */
  checkForUpdates: () => Promise<unknown>
  /** Register the "update finished downloading" listener (e.g. autoUpdater.on). */
  onUpdateDownloaded: (cb: (info: UpdateDownloadedInfo) => void) => void
  /** Push the downloaded-update notice to the renderer (e.g. webContents.send). */
  sendToRenderer: (info: UpdateDownloadedInfo) => void
  /** Register the renderer's "restart to update" request (e.g. ipcMain.on). */
  onRestartRequest: (cb: () => void) => void
  /**
   * Flush the renderer (reuse the shared quit-guard handshake) and resolve when it
   * acks or times out. Guaranteed to run BEFORE {@link AutoUpdateDeps.quitAndInstall}.
   */
  flush: () => Promise<void>
  /** Install the downloaded update and restart (e.g. autoUpdater.quitAndInstall). */
  quitAndInstall: () => void
  /** Optional log sink; defaults to console. */
  log?: (message: string, err?: unknown) => void
}

/**
 * Wire the background update flow (M12). Two responsibilities:
 *
 *  1. Fire a background update check that can NEVER delay or block launch — any
 *     failure (offline, unreachable, rejected promise) is caught and logged, never
 *     rethrown. This mirrors the M4 spellcheck graceful-degradation rule.
 *  2. Bridge `update-downloaded` → renderer notice, and the renderer's
 *     "restart to update" → flush-then-install, in that strict order, so an install
 *     never restarts out from under unsaved edits.
 *
 * Caller is responsible for guarding on `app.isPackaged` (autoUpdater does not work
 * in dev); this module stays Electron-free.
 */
export function initAutoUpdate(deps: AutoUpdateDeps): void {
  const log = deps.log ?? ((m, e): void => console[e ? 'warn' : 'log'](m, e ?? ''))

  deps.onUpdateDownloaded((info) => {
    log(`[auto-update] update downloaded: ${info.version}`)
    deps.sendToRenderer(info)
  })

  deps.onRestartRequest(() => {
    void runRestartToUpdate(deps, log)
  })

  // Fire-and-forget. The crucial guarantee: neither a rejected promise (network
  // failure) NOR a synchronous throw can bubble up to delay or crash launch. We wrap
  // the whole call so both are swallowed — offline/unreachable must be a non-event.
  try {
    void Promise.resolve(deps.checkForUpdates()).catch((err) =>
      log('[auto-update] check failed (continuing normally)', err)
    )
  } catch (err) {
    log('[auto-update] check failed (continuing normally)', err)
  }
}

/**
 * Renderer flush MUST complete before `quitAndInstall`, otherwise the install would
 * restart the app with unsaved edits still in memory. If the flush itself throws we
 * still proceed to install (a failed flush must not strand the user on an update they
 * asked for) — but the ordering (flush first) is preserved and asserted in tests.
 */
async function runRestartToUpdate(
  deps: AutoUpdateDeps,
  log: (message: string, err?: unknown) => void
): Promise<void> {
  try {
    await deps.flush()
  } catch (err) {
    log('[auto-update] flush before update failed (installing anyway)', err)
  }
  deps.quitAndInstall()
}
