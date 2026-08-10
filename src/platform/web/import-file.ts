/**
 * Browser "open file" for MP6 import. Uses a hidden `<input type="file">` rather than
 * the File System Access `showOpenFilePicker()` — the latter's picker is unavailable in
 * Chrome on Android, while `<input type=file>` is universal. Returns the SAME
 * `ImportFileResult` shape as the Electron path so the M14.1 preview dialog and
 * `importChapters` need no changes. DOM-only — never imported in Node.
 */
import type { ImportFileResult } from '@shared/types'
import { convertDocxToHtml } from '@data/docx-import'

export async function pickImportFile(): Promise<ImportFileResult> {
  const file = await promptForFile('.md,.docx')
  // No cancel event fires for <input type=file>; treat "no file" as canceled.
  if (!file) return { canceled: true }

  if (file.name.toLowerCase().endsWith('.md')) {
    return { canceled: false, kind: 'md', text: await file.text() }
  }
  const { html, warnings } = await convertDocxToHtml(await file.arrayBuffer())
  return { canceled: false, kind: 'docx', html, warnings }
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
    input.click()
  })
}
