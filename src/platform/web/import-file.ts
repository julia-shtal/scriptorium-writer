/**
 * Browser "open file" for MP6 import. Uses a hidden `<input type="file">` rather than
 * the File System Access `showOpenFilePicker()` — the latter's picker is unavailable in
 * Chrome on Android, while `<input type=file>` is universal. Returns the SAME
 * `ImportFileResult` shape as the Electron path so the M14.1 preview dialog and
 * `importChapters` need no changes. DOM-only — never imported in Node.
 */
import type { ImportFileResult } from '@shared/types'
import { convertDocxToHtml } from '@data/docx-import'
import { AppError } from '@shared/errors'
import { IMPORT_LIMITS } from '@data/library-import'

export async function pickImportFile(): Promise<ImportFileResult> {
  const file = await promptForFile('.md,.docx')
  // A dismissed picker (or an empty selection) yields no file; treat it as canceled.
  if (!file) return { canceled: true }

  if (file.name.toLowerCase().endsWith('.md')) {
    return { canceled: false, kind: 'md', text: await file.text() }
  }
  const { html, warnings } = await convertDocxToHtml(await file.arrayBuffer())
  return { canceled: false, kind: 'docx', html, warnings }
}

/**
 * Pick a library `.zip` (M31). Same `<input type=file>` route as chapter import, so it works
 * in Chrome on Android and in the Capacitor WebView. Size is checked before reading.
 */
export async function pickLibraryArchive(): Promise<
  { name: string; bytes: Uint8Array } | undefined
> {
  const file = await promptForFile('.zip,application/zip')
  if (!file) return undefined
  if (file.size > IMPORT_LIMITS.maxArchiveBytes) {
    throw new AppError(
      'IMPORT_TOO_LARGE',
      `archive is ${file.size} bytes (limit ${IMPORT_LIMITS.maxArchiveBytes})`
    )
  }
  return { name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) }
}

/** Resolve with the chosen File, or undefined if the input yields none. */
function promptForFile(accept: string): Promise<File | undefined> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = accept
    input.style.display = 'none'
    document.body.appendChild(input)
    input.addEventListener('change', () => {
      const file = input.files?.[0]
      input.remove()
      resolve(file)
    })
    // M31: Chromium 113+ (desktop, Android Chrome, the Capacitor WebView) fires `cancel`
    // when the picker is dismissed. Without it the promise never settled, and Settings'
    // «Import library…» button stayed on «Reading archive…» until the view was left.
    // Older engines simply never fire it, which is the previous behaviour.
    input.addEventListener('cancel', () => {
      input.remove()
      resolve(undefined)
    })
    input.click()
  })
}
