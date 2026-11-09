/**
 * Library archive manifest (M31). Every export writes `manifest.json` at the archive root
 * so an import can tell which format and schema versions it is reading. It is generated at
 * zip time and never stored in the library folder.
 */
import type { LibraryManifest } from '@shared/types'
import { APP_VERSION } from '@shared/app-version'
import { CHAPTER_SCHEMA_VERSION, NOTES_SCHEMA_VERSION, STORY_SCHEMA_VERSION } from '@shared/schema'

export const LIBRARY_FORMAT = 'scriptorium-library'
/** Bump when the archive layout changes in a way an older importer must refuse. */
export const LIBRARY_FORMAT_VERSION = 1
/** Archive-root entry name of the manifest. */
export const MANIFEST_ENTRY = 'manifest.json'
/** Library-root folder name of the import staging area (see `layout.importTmpDir`). */
export const IMPORT_TMP_NAME = '.import-tmp'

export function buildLibraryManifest(platform: string, now: Date = new Date()): LibraryManifest {
  return {
    format: LIBRARY_FORMAT,
    formatVersion: LIBRARY_FORMAT_VERSION,
    appVersion: APP_VERSION,
    exportedAt: now.toISOString(),
    platform,
    schema: { story: STORY_SCHEMA_VERSION, chapter: CHAPTER_SCHEMA_VERSION, notes: NOTES_SCHEMA_VERSION }
  }
}

export function manifestJson(manifest: LibraryManifest): string {
  return JSON.stringify(manifest, null, 2)
}

/**
 * Library-relative paths that must never enter an export: a stray root `manifest.json`
 * (from a hand-unzipped archive — the real one is generated fresh) and import staging.
 */
export function isExcludedFromExport(relPath: string): boolean {
  return (
    relPath === MANIFEST_ENTRY ||
    relPath === IMPORT_TMP_NAME ||
    relPath.startsWith(`${IMPORT_TMP_NAME}/`)
  )
}
