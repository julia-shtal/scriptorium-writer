import { join } from 'path'
import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { FileService } from './file-service'
import { registerIpcHandlers } from './ipc'

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

// TODO(M5): quit guard — intercept `before-quit`, request a final renderer flush,
// and delay quit until any in-flight save resolves (SPEC §5.7).
