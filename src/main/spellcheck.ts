/**
 * Configures Chromium's built-in offline spellcheck in the main process
 * (SPEC.md §7). The renderer only ever sets `spellcheck` on its contenteditable
 * and never touches Node/Electron APIs directly — all dictionary wiring and
 * native context-menu handling lives here.
 */

import { BrowserWindow, Menu, type Session, type WebContents } from 'electron'
import { startDictionaryServer, type DictionaryServer } from './dict-server'

export interface SpellcheckContextParams {
  misspelledWord: string
  dictionarySuggestions: string[]
}

export type SpellMenuItem =
  | { type: 'suggestion'; label: string; replacement: string }
  | { type: 'separator' }
  | { type: 'addToDictionary'; label: string; word: string }

/**
 * Builds the item list for the spellcheck section of the native context menu.
 * Shape: one `suggestion` item per dictionary suggestion (in order), then a
 * `separator` only if there were suggestions, then always a trailing
 * `addToDictionary` item for the misspelled word. Returns an empty array when
 * there is no misspelled word (i.e. the click wasn't on a flagged word), so
 * callers can skip building/showing a menu entirely.
 */
export function buildSpellcheckMenuTemplate(params: SpellcheckContextParams): SpellMenuItem[] {
  if (!params.misspelledWord) return []
  const items: SpellMenuItem[] = params.dictionarySuggestions.map((s) => ({
    type: 'suggestion', label: s, replacement: s
  }))
  if (items.length > 0) items.push({ type: 'separator' })
  items.push({ type: 'addToDictionary', label: 'Добавить в словарь', word: params.misspelledWord })
  return items
}

export interface SpellcheckHandle {
  server: DictionaryServer | null
}

/**
 * Configure offline spellcheck on a session: set languages, start the local dictionary
 * server, and point Chromium's dictionary download URL at it. Await BEFORE creating any
 * spellcheck-enabled window. Graceful degradation: if the server fails to start, log and
 * return { server: null } WITHOUT setting the download URL — the app must still launch.
 */
export async function configureSpellcheck(
  session: Session,
  spellLanguages: readonly string[],
  dictionariesDir: string
): Promise<SpellcheckHandle> {
  session.setSpellCheckerLanguages([...spellLanguages])
  try {
    const server = await startDictionaryServer(dictionariesDir, spellLanguages)
    session.setSpellCheckerDictionaryDownloadURL(server.url)
    return { server }
  } catch (err) {
    console.error('[spellcheck] dictionary server failed to start; offline dictionaries unavailable this session:', err)
    return { server: null }
  }
}

/**
 * Wire the native right-click menu on an editor WebContents: dictionary suggestions
 * (click to replace) plus "Add to dictionary".
 */
export function registerSpellcheckContextMenu(webContents: WebContents, session: Session): void {
  webContents.on('context-menu', (_event, params) => {
    const template = buildSpellcheckMenuTemplate({
      misspelledWord: params.misspelledWord,
      dictionarySuggestions: params.dictionarySuggestions
    })
    if (template.length === 0) return
    const menu = Menu.buildFromTemplate(
      template.map((item) => {
        if (item.type === 'separator') return { type: 'separator' as const }
        if (item.type === 'suggestion') {
          return { label: item.label, click: () => webContents.replaceMisspelling(item.replacement) }
        }
        return { label: item.label, click: () => session.addWordToSpellCheckerDictionary(item.word) }
      })
    )
    const owner = BrowserWindow.fromWebContents(webContents)
    // `PopupOptions.window` is typed `BaseWindow | undefined` (optional), but we branch
    // explicitly rather than always passing `{ window: owner ?? undefined }` so the
    // "no owner window" case reads as the plain no-arg call Electron's docs show, and to
    // stay robust if a future Electron typings revision tightens optional-property handling.
    if (owner) {
      menu.popup({ window: owner })
    } else {
      menu.popup()
    }
  })
}
