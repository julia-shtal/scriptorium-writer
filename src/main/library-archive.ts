/**
 * Library archive helper (M13). Streams an entire directory into a single
 * deflate-compressed `.zip`, reproducing the on-disk layout exactly.
 *
 * Deliberately Electron-free (like `markdown.ts` / `atomic-write.ts`) so it can be
 * unit-tested against real temp directories. Reads only from `srcDir`; the single
 * write target is `destPath`. Writes to a temp `destPath + '.part'` and renames on
 * success, so a mid-stream failure never leaves a truncated `.zip` that looks
 * complete. The source directory is never modified.
 */

import { createWriteStream } from 'node:fs'
import * as fsp from 'node:fs/promises'
import archiver from 'archiver'

const PART_SUFFIX = '.part'

export async function zipDirectory(srcDir: string, destPath: string): Promise<void> {
  const partPath = destPath + PART_SUFFIX
  await new Promise<void>((resolve, reject) => {
    const output = createWriteStream(partPath)
    const archive = archiver('zip', { zlib: { level: 6 } })

    let settled = false
    const fail = (err: unknown): void => {
      if (settled) return
      settled = true
      archive.destroy()
      output.destroy()
      reject(err instanceof Error ? err : new Error(String(err)))
    }

    output.on('close', () => {
      if (settled) return
      settled = true
      resolve()
    })
    output.on('error', fail)
    archive.on('error', fail)
    // `warning` for ENOENT/stat races: treat as a real failure to be safe.
    archive.on('warning', fail)

    archive.pipe(output)
    // Add the whole tree under the archive root (no wrapping folder), so entries are
    // relative to srcDir and extraction reproduces the exact layout.
    archive.directory(srcDir, false)
    void archive.finalize()
  }).catch(async (err) => {
    await fsp.rm(partPath, { force: true }).catch(() => {})
    throw err
  })

  // Atomic-ish publish: only a fully-written archive appears at destPath.
  await fsp.rename(partPath, destPath)
}
