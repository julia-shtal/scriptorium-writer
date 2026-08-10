/**
 * Browser "save file" for MP6 export. There is no OS save dialog in a browser, so we
 * hand the bytes to the browser as an object-URL and click a synthetic `<a download>`;
 * the file lands in the device Downloads folder. DOM-only — never imported in Node.
 */
export function triggerDownload(data: Uint8Array, filename: string, mime: string): void {
  // Copy into a fresh ArrayBuffer so Blob gets exactly these bytes (a Uint8Array view may
  // be a window onto a larger buffer).
  const blob = new Blob([data.slice()], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Revoke on the next tick so the download has started.
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

/** MIME types for the formats MP6 emits. */
export const MIME = {
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  md: 'text/markdown',
  zip: 'application/zip'
} as const
