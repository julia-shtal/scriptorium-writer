import { join } from 'path'
import { app, shell, BrowserWindow, ipcMain, session } from 'electron'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { FileService } from './file-service'
import { registerIpcHandlers } from './ipc'
import { requestFlushBeforeQuit } from './quit-flush'
import { configureSpellcheck, registerSpellcheckContextMenu } from './spellcheck'

// Offline spellcheck dictionaries (SPEC §7, M4): dev serves them straight from the repo
// `resources/` dir; packaged builds get them from electron-builder's copy under
// `<resourcesPath>/resources/`.
function dictionariesDir(): string {
  return is.dev
    ? join(app.getAppPath(), 'resources', 'dictionaries')
    : join(process.resourcesPath, 'resources', 'dictionaries')
}

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 820,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      // Reliability + security boundary (CLAUDE.md, SPEC §3): the renderer must
      // never reach Node built-ins directly. Do not weaken these.
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  // Native right-click menu for offline spellcheck (SPEC §7, M4): dictionary
  // suggestions plus "Add to dictionary", wired on this window's webContents.
  registerSpellcheckContextMenu(mainWindow.webContents, session.defaultSession)

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
    // DevTools in dev only.
    if (is.dev) {
      mainWindow.webContents.openDevTools({ mode: 'detach' })
    }
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // Quit guard, window-close arm (SPEC §5.7). Closing the last window (X button /
  // Alt+F4) is a quit path on Windows: it destroys the window *before* `before-quit`
  // runs, so that handler alone would exit without a final flush. Intercept the
  // window's own `close`, run the shared flush handshake, and only then let it close.
  mainWindow.on('close', (event) => {
    if (hasFlushed || mainWindow.webContents.isDestroyed()) return
    event.preventDefault()
    void flushRendererOnce(mainWindow).then(() => {
      hasFlushed = true
      mainWindow.close() // re-enters close; the guard above now lets it through
    })
  })

  // HMR for renderer in dev, built file in production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(async () => {
  electronApp.setAppUserModelId('com.scriptorium-writer.app')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // All disk I/O lives in the main-process FileService. It is Electron-free by
  // design (unit-tested against temp dirs); the app supplies the machine paths here.
  const fileService = new FileService({
    userDataPath: app.getPath('userData'),
    defaultLibraryPath: join(app.getPath('documents'), 'Scriptorium-Writer')
  })
  await fileService.ensureLibrary()

  registerIpcHandlers(
    { handle: ipcMain.handle.bind(ipcMain) },
    {
      fileService,
      revealInFolder: async (target: string) => {
        await shell.openPath(target)
      }
    }
  )

  // Offline spellcheck (SPEC §7, M4). Must fully complete — server listening + URL set —
  // before the first spellcheck-enabled window is created (startup-ordering refinement).
  const settings = await fileService.readSettings()
  await configureSpellcheck(session.defaultSession, settings.spellLanguages, dictionariesDir())

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// Quit guard (SPEC §5.7): never let the process exit with unsaved edits in the
// renderer. There are two entry points — a menu/`app.quit()` quit (`before-quit`
// fires while the window is alive) and a window close (handled in `createWindow`
// above). Both funnel through one flush handshake, gated by `hasFlushed` so the
// renderer is asked exactly once and neither path can loop.
let hasFlushed = false
let flushInFlight: Promise<void> | null = null

/**
 * Ask the renderer for a final flush and resolve when it acks — or after a safety
 * timeout, whichever comes first. Memoized: concurrent close/quit paths share the
 * single in-flight handshake instead of racing two of them.
 */
function flushRendererOnce(win: BrowserWindow): Promise<void> {
  if (flushInFlight) return flushInFlight
  flushInFlight = requestFlushBeforeQuit({
    send: () => win.webContents.send('quit:flush-request'),
    onceAck: (cb) => ipcMain.once('quit:flush-done', cb),
    timeoutMs: 5000
  })
  return flushInFlight
}

app.on('before-quit', (event) => {
  if (hasFlushed) return
  const win = BrowserWindow.getAllWindows()[0]
  if (!win || win.webContents.isDestroyed()) return
  event.preventDefault()
  void flushRendererOnce(win).then(() => {
    hasFlushed = true
    app.quit()
  })
})
