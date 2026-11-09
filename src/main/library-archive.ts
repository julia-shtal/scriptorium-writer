/**
 * Library archive helper (M13). Streams an entire directory into a single
 * deflate-compressed `.zip`, reproducing the on-disk layout minus the entries
 * `isExcludedFromExport` rejects (stray root manifest, import staging), plus a generated
 * root `manifest.json` (M31).
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
import { isExcludedFromExport, MANIFEST_ENTRY } from '@data/library-manifest'

const PART_SUFFIX = '.part'

export async function zipDirectory(srcDir: string, destPath: string, manifest: string): Promise<void> {
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
    // relative to srcDir and extraction reproduces the exact layout - minus what never
    // belongs in an export (stray manifest, import staging). The real manifest (M31) is
    // appended fresh. Normalise separators so the exclusion rule holds on Windows.
    archive.directory(srcDir, false, (entry) =>
      isExcludedFromExport(entry.name.replace(/\\/g, '/')) ? false : entry
    )
    archive.append(manifest, { name: MANIFEST_ENTRY })
    void archive.finalize()
  }).catch(async (err) => {
    await fsp.rm(partPath, { force: true }).catch(() => {})
    throw err
  })

  // Atomic-ish publish: only a fully-written archive appears at destPath.
  await fsp.rename(partPath, destPath)
}
