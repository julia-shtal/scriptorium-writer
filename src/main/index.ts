import { join } from 'path'
import { readFile } from 'node:fs/promises'
import { app, shell, BrowserWindow, ipcMain, session, dialog } from 'electron'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { autoUpdater } from 'electron-updater'
import type { UpdateDownloadedInfo, ExportDocxResult } from '@shared/types'
import { FileService } from './file-service'
import { registerIpcHandlers } from './ipc'
import { requestFlushBeforeQuit } from './quit-flush'
import { initAutoUpdate } from './auto-update'
import { configureSpellcheck, registerSpellcheckContextMenu } from './spellcheck'
import { convertDocxToHtml } from './docx-import'
import { chapterToDocxBlocks, blocksToDocxBuffer, type DocxBlock } from './docx-export'
import { atomicWriteFile } from './atomic-write'

// Offline spellcheck dictionaries (SPEC §7, M4): dev serves them straight from the repo
// `resources/` dir; packaged builds get them from electron-builder's copy under
// `<resourcesPath>/resources/`.
function dictionariesDir(): string {
  return is.dev
    ? join(app.getAppPath(), 'resources', 'dictionaries')
    : join(process.resourcesPath, 'resources', 'dictionaries')
}

// App icon (M9): dev resolves from the repo `resources/` dir; packaged builds get it
// from electron-builder's copy under `<resourcesPath>/resources/`. Mirrors dictionariesDir().
function iconPath(): string {
  return is.dev
    ? join(app.getAppPath(), 'resources', 'icons', 'icon.ico')
    : join(process.resourcesPath, 'resources', 'icons', 'icon.ico')
}

/** Show a save dialog for a generated .docx and write the bytes atomically (M14). */
async function saveDocx(buffer: Buffer, suggestedName: string): Promise<ExportDocxResult> {
  const win = BrowserWindow.getAllWindows()[0]
  const safe = suggestedName.replace(/[\\/:*?"<>|]/g, '_').slice(0, 80) || 'export'
  const options = {
    title: 'Экспортировать в .docx',
    defaultPath: `${safe}.docx`,
    filters: [{ name: 'Word', extensions: ['docx'] }]
  }
  const result = win
    ? await dialog.showSaveDialog(win, options)
    : await dialog.showSaveDialog(options)
  if (result.canceled || !result.filePath) return { canceled: true }
  // Atomic write: tmp + rename in the destination dir, so a failed write never leaves a
  // half-written .docx and never touches the library (export is read-only against canon).
  await atomicWriteFile(result.filePath, buffer)
  return { canceled: false, path: result.filePath }
}

function createWindow(): BrowserWindow {
  const mainWindow = new BrowserWindow({
    icon: iconPath(),
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

  return mainWindow
}

/**
 * Background auto-update (M12). Graceful degradation is mandatory (same rule as M4
 * spellcheck): this must NEVER delay or block launch. Two guards:
 *  - skip entirely unless `app.isPackaged` — `electron-updater` does not work under
 *    `npm run dev` and would throw;
 *  - the whole thing is wrapped in try/catch, and the update-check promise's rejection
 *    is swallowed inside `initAutoUpdate`.
 *
 * The "restart to update" path is the reliability-critical bit: it must reuse the
 * quit-guard flush and set `hasFlushed = true` before `quitAndInstall()`, so the
 * install's own quit isn't preventDefault'd by `before-quit`, and no double-flush runs.
 */
function setupAutoUpdate(win: BrowserWindow): void {
  if (!app.isPackaged) {
    console.log('[auto-update] skipped: not packaged (dev build)')
    return
  }
  try {
    initAutoUpdate({
      checkForUpdates: () => autoUpdater.checkForUpdates(),
      onUpdateDownloaded: (cb) => {
        autoUpdater.on('update-downloaded', (info) => {
          const payload: UpdateDownloadedInfo = { version: info.version }
          cb(payload)
        })
      },
      sendToRenderer: (info) => {
        if (!win.isDestroyed()) win.webContents.send('update:downloaded', info)
      },
      onRestartRequest: (cb) => {
        ipcMain.on('update:restart', () => cb())
      },
      flush: async () => {
        if (!win.isDestroyed() && !win.webContents.isDestroyed()) {
          await flushRendererOnce(win)
        }
        // Disarm the quit guard: quitAndInstall triggers its own app quit, and we
        // must not let `before-quit`/`close` preventDefault it or re-run the flush.
        hasFlushed = true
      },
      quitAndInstall: () => autoUpdater.quitAndInstall()
    })
  } catch (err) {
    console.warn('[auto-update] setup failed (continuing normally)', err)
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
      },
      setSpellLanguages: (langs: string[]) =>
        session.defaultSession.setSpellCheckerLanguages(langs),
      exportLibrary: async () => {
        const win = BrowserWindow.getAllWindows()[0]
        const today = new Date().toISOString().slice(0, 10) // YYYY-MM-DD
        const options = {
          title: 'Экспортировать библиотеку',
          defaultPath: `scriptorium-library-${today}.zip`,
          filters: [{ name: 'Zip archive', extensions: ['zip'] }]
        }
        const result = win
          ? await dialog.showSaveDialog(win, options)
          : await dialog.showSaveDialog(options)
        if (result.canceled || !result.filePath) return { canceled: true }
        await fileService.exportLibraryArchive(result.filePath)
        return { canceled: false, path: result.filePath }
      },
      readImportFile: async () => {
        const win = BrowserWindow.getAllWindows()[0]
        const options = {
          title: 'Импортировать файл',
          properties: ['openFile' as const],
          filters: [{ name: 'Документы', extensions: ['docx', 'md'] }]
        }
        const result = win
          ? await dialog.showOpenDialog(win, options)
          : await dialog.showOpenDialog(options)
        if (result.canceled || result.filePaths.length === 0) return { canceled: true }
        const path = result.filePaths[0]
        if (path.toLowerCase().endsWith('.md')) {
          const text = await readFile(path, 'utf8')
          return { canceled: false, kind: 'md', text }
        }
        const buffer = await readFile(path)
        const { html, warnings } = await convertDocxToHtml(buffer)
        return { canceled: false, kind: 'docx', html, warnings }
      },
      exportChapterDocx: async (storyId, chapterId) => {
        const chapter = await fileService.readChapter(storyId, chapterId)
        const blocks = chapterToDocxBlocks(chapter.title, chapter.doc, { withHeading: false })
        const buffer = await blocksToDocxBuffer([blocks])
        return saveDocx(buffer, chapter.title || 'chapter')
      },
      exportStoryDocx: async (storyId) => {
        const story = await fileService.readStory(storyId)
        const blockLists: DocxBlock[][] = []
        for (const id of story.chapterOrder) {
          const chapter = await fileService.readChapter(storyId, id)
          blockLists.push(chapterToDocxBlocks(chapter.title, chapter.doc, { withHeading: true }))
        }
        const buffer = await blocksToDocxBuffer(blockLists)
        return saveDocx(buffer, story.title || 'story')
      }
    }
  )

  // Offline spellcheck (SPEC §7, M4). Must fully complete — server listening + URL set —
  // before the first spellcheck-enabled window is created (startup-ordering refinement).
  const settings = await fileService.readSettings()
  await configureSpellcheck(session.defaultSession, settings.spellLanguages, dictionariesDir())

  const mainWindow = createWindow()

  // Background update check (M12) — AFTER the window exists, non-blocking. Wrapped so
  // an offline/unreachable check never delays launch (see setupAutoUpdate).
  setupAutoUpdate(mainWindow)

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
