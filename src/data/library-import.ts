/**
 * Library import, read side (M31): turn archive bytes into validated per-story file sets.
 * Pure — no FsPort, no writes. Classification against the local library and the apply
 * phase live in FileService / library-import-apply.ts.
 *
 * Refuse-the-whole-archive conditions (an AppError): not a zip, over a limit, any unsafe
 * entry path, a malformed or newer manifest. A bad STORY never refuses the archive: it is
 * returned with an `invalidReason` and the others still import.
 *
 * `unzipSync`, not async `unzip`: fflate's async API spawns blob: workers, which the PWA
 * CSP (`worker-src 'self'`) blocks. IMPORT_LIMITS bounds the synchronous work.
 */
import { unzipSync, type Unzipped } from 'fflate'
import type { ImportInvalidReason, ImportStorySide, ImportStoryWarning, LibraryManifest, Story } from '@shared/types'
import { AppError, isAppError } from '@shared/errors'
import { CHAPTER_SCHEMA_VERSION, NOTES_SCHEMA_VERSION, STORY_SCHEMA_VERSION } from '@shared/schema'
import { LIBRARY_FORMAT, LIBRARY_FORMAT_VERSION, MANIFEST_ENTRY } from './library-manifest'

export interface ImportLimits {
  maxArchiveBytes: number
  maxUncompressedBytes: number
  maxEntries: number
}

export const IMPORT_LIMITS: ImportLimits = {
  maxArchiveBytes: 200 * 1024 * 1024,
  maxUncompressedBytes: 1024 * 1024 * 1024,
  maxEntries: 50_000
}

export interface ParsedStory {
  id: string
  /** Every file under stories/<id>/, keyed by path relative to the story folder. */
  files: Map<string, Uint8Array>
  incoming: ImportStorySide
  warnings: ImportStoryWarning[]
  invalidReason?: ImportInvalidReason
}

export interface ParsedArchive {
  manifest: LibraryManifest | null
  stories: ParsedStory[]
  ignoredEntries: number
}

const decoder = new TextDecoder('utf-8')
const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)
const parseJson = (bytes: Uint8Array): unknown => JSON.parse(decoder.decode(bytes))

/** Characters Windows forbids in a path segment. Our own exports never produce them. */
const WINDOWS_FORBIDDEN = /[<>:"|?*]/

/**
 * A zip entry name is safe when it is relative, forward-slashed, and free of `.`/`..`
 * segments, drive letters, NUL/control characters and Windows-forbidden characters. A
 * trailing `/` (directory entry) is allowed.
 */
export function isSafeEntryPath(name: string): boolean {
  if (name === '' || name.includes('\\') || name.startsWith('/') || /^[A-Za-z]:/.test(name)) return false
  for (let i = 0; i < name.length; i++) if (name.charCodeAt(i) < 0x20) return false
  const segments = name.replace(/\/$/, '').split('/')
  return segments.every(
    (s) =>
      s !== '' &&
      s !== '.' &&
      s !== '..' &&
      !WINDOWS_FORBIDDEN.test(s) &&
      // Windows silently strips a trailing dot/space, so "x." and "x" would collide.
      !/[. ]$/.test(s)
  )
}

/** Byte-equality of two story file sets, ignoring `versions/` (history differs per device). */
export function filesEqual(a: Map<string, Uint8Array>, b: Map<string, Uint8Array>): boolean {
  const keys = (m: Map<string, Uint8Array>): string[] =>
    [...m.keys()].filter((k) => !k.startsWith('versions/')).sort()
  const ka = keys(a)
  const kb = keys(b)
  if (ka.length !== kb.length || ka.some((k, i) => k !== kb[i])) return false
  return ka.every((k) => {
    const x = a.get(k)
    const y = b.get(k)
    return x !== undefined && y !== undefined && x.byteLength === y.byteLength && x.every((byte, i) => byte === y[i])
  })
}

/**
 * A story's "last modified" for import comparison: the newest of story.json's updatedAt and
 * the updatedAt of every readable chapter in its chapterOrder. saveChapter stamps only the
 * chapter, so story.json alone says "unchanged" after the most common edit (typing). One
 * pure helper for BOTH the archive and the local side, so the two can never drift.
 * ISO-8601 strings compare lexically. Returns '' when nothing readable carries a date.
 */
export function storyLastModified(files: Map<string, Uint8Array>): string {
  let latest = ''
  const consider = (v: unknown): void => {
    if (typeof v === 'string' && v > latest) latest = v
  }
  let order: Set<string> | null = null
  try {
    const story = parseJson(files.get('story.json') ?? new Uint8Array())
    if (isRecord(story)) {
      consider(story.updatedAt)
      if (Array.isArray(story.chapterOrder)) {
        order = new Set(story.chapterOrder.filter((c): c is string => typeof c === 'string'))
      }
    }
  } catch {
    return ''
  }
  if (!order) return latest
  for (const [rel, bytes] of files) {
    if (!/^chapters\/[^/]+\.json$/.test(rel)) continue
    try {
      const ch = parseJson(bytes)
      if (isRecord(ch) && typeof ch.id === 'string' && order.has(ch.id)) consider(ch.updatedAt)
    } catch {
      // An unreadable chapter contributes no date; validateStory reports it separately.
    }
  }
  return latest
}

export function parseLibraryArchive(bytes: Uint8Array, limits: ImportLimits = IMPORT_LIMITS): ParsedArchive {
  if (bytes.byteLength > limits.maxArchiveBytes) {
    throw new AppError('IMPORT_TOO_LARGE', `archive is ${bytes.byteLength} bytes (limit ${limits.maxArchiveBytes})`)
  }

  // Pass 1 — central directory only. The filter returns false, so nothing is inflated
  // until the limits and paths have been checked. Limits are enforced INSIDE the filter and
  // throw at once: a hostile zip64 header can claim billions of entries in a 100-byte file,
  // and a post-hoc length check would only run after the loop had spun through all of them.
  //
  // What actually bounds memory in pass 2: fflate allocates a stored entry's output from its
  // compressed `size`, ignoring `originalSize`, so a stored entry must declare size ===
  // originalSize or it could lie its way past the total. A deflate entry's output buffer is
  // fixed at `originalSize`, so its declared size is its real ceiling. Every other method is
  // refused. The post-inflate byte count below is only a backstop.
  const listing: { name: string }[] = []
  const seen = new Set<string>()
  let declared = 0
  try {
    unzipSync(bytes, {
      filter: (f) => {
        if (listing.length >= limits.maxEntries) {
          throw new AppError('IMPORT_TOO_LARGE', `archive has more than ${limits.maxEntries} entries`)
        }
        if (f.compression !== 0 && f.compression !== 8) {
          throw new AppError('IMPORT_INVALID_ARCHIVE', `unsupported compression method ${f.compression}`)
        }
        if (f.compression === 0 && f.size !== f.originalSize) {
          throw new AppError('IMPORT_INVALID_ARCHIVE', 'stored entry declares inconsistent sizes')
        }
        if (f.size > bytes.byteLength) {
          throw new AppError('IMPORT_INVALID_ARCHIVE', 'entry is larger than the archive that holds it')
        }
        declared += Math.max(f.size, f.originalSize)
        if (declared > limits.maxUncompressedBytes) {
          throw new AppError('IMPORT_TOO_LARGE', `archive unpacks to over ${limits.maxUncompressedBytes} bytes`)
        }
        // Case/Unicode-normalisation collisions would overwrite each other on a
        // case-insensitive disk (Windows, Android); exact duplicates land here too.
        const folded = f.name.normalize('NFC').toLowerCase()
        if (seen.has(folded)) {
          throw new AppError('IMPORT_INVALID_ARCHIVE', `duplicate entry name ${JSON.stringify(f.name)}`)
        }
        seen.add(folded)
        listing.push({ name: f.name })
        return false
      }
    })
  } catch (err) {
    if (isAppError(err)) throw err
    throw new AppError('IMPORT_INVALID_ARCHIVE', 'file is not a readable zip archive', { cause: err })
  }
  const unsafe = listing.find((e) => !isSafeEntryPath(e.name))
  if (unsafe) throw new AppError('IMPORT_INVALID_ARCHIVE', `unsafe entry path ${JSON.stringify(unsafe.name)}`)

  // Pass 2 — inflate only what can be imported.
  // KNOWN LIMITATION: a deflate entry that declares a small originalSize can still cost CPU
  // time, because fflate decodes the whole stream into its fixed buffer. Memory stays bounded,
  // and the archive is user-chosen and capped at maxArchiveBytes. The real fix is a streaming
  // Inflate with early abort, which needs our own central-directory reader.
  const wanted = (name: string): boolean =>
    name === MANIFEST_ENTRY || (/^stories\/[^/]+\/.+/.test(name) && !name.endsWith('/'))
  let inflated: Unzipped
  try {
    inflated = unzipSync(bytes, { filter: (f) => wanted(f.name) })
  } catch (err) {
    throw new AppError('IMPORT_INVALID_ARCHIVE', 'archive could not be unpacked', { cause: err })
  }
  // Backstop only: the pass-1 checks are what bound memory; this catches anything they missed.
  const actual = Object.values(inflated).reduce((sum, d) => sum + d.byteLength, 0)
  if (actual > limits.maxUncompressedBytes) {
    throw new AppError('IMPORT_TOO_LARGE', `archive unpacked to ${actual} bytes (limit ${limits.maxUncompressedBytes})`)
  }

  const manifest = parseManifest(inflated[MANIFEST_ENTRY])
  const ignoredEntries = listing.filter((e) => !e.name.endsWith('/') && !wanted(e.name)).length

  const byStory = new Map<string, Map<string, Uint8Array>>()
  for (const [name, data] of Object.entries(inflated)) {
    if (name === MANIFEST_ENTRY) continue
    // `wanted` guarantees stories/<id>/<rest>, so the match is always present.
    const m = /^stories\/([^/]+)\/(.+)$/.exec(name)
    if (!m) continue
    const [, id = '', rel = ''] = m
    let files = byStory.get(id)
    if (!files) byStory.set(id, (files = new Map()))
    files.set(rel, data)
  }
  const stories = [...byStory.entries()]
    // Plain code-unit order, not localeCompare: the preview order must not depend on the device locale.
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([id, files]) => validateStory(id, files))
  return { manifest, stories, ignoredEntries }
}

function parseManifest(bytes: Uint8Array | undefined): LibraryManifest | null {
  if (!bytes) return null // legacy ≤ v1.6.0 archive: formatVersion 1 by definition
  let m: unknown
  try {
    m = parseJson(bytes)
  } catch (err) {
    throw new AppError('IMPORT_INVALID_ARCHIVE', 'manifest.json is not valid JSON', { cause: err })
  }
  if (!isRecord(m) || m.format !== LIBRARY_FORMAT || typeof m.formatVersion !== 'number') {
    throw new AppError('IMPORT_INVALID_ARCHIVE', 'not a Scriptorium library archive')
  }
  if (m.formatVersion > LIBRARY_FORMAT_VERSION) {
    throw new AppError('IMPORT_UNSUPPORTED_VERSION', `archive format ${m.formatVersion} is newer than this app reads`)
  }
  if (
    typeof m.appVersion !== 'string' ||
    typeof m.platform !== 'string' ||
    typeof m.exportedAt !== 'string' ||
    !isRecord(m.schema)
  ) {
    throw new AppError('IMPORT_INVALID_ARCHIVE', 'manifest.json is missing required fields')
  }
  return m as unknown as LibraryManifest
}

function validateStory(id: string, files: Map<string, Uint8Array>): ParsedStory {
  // Once story.json has parsed, an invalid story still shows its real title in the dialog.
  let known: Partial<ImportStorySide> = {}
  const invalid = (invalidReason: ImportInvalidReason): ParsedStory => ({
    id, files, warnings: [], invalidReason,
    incoming: { title: id, chapterCount: 0, wordCount: 0, updatedAt: '', ...known }
  })

  const meta = files.get('story.json')
  if (!meta) return invalid('missingStoryJson')
  let story: unknown
  try {
    story = parseJson(meta)
  } catch {
    return invalid('badStoryJson')
  }
  if (
    !isRecord(story) ||
    typeof story.id !== 'string' ||
    typeof story.title !== 'string' ||
    typeof story.updatedAt !== 'string' ||
    typeof story.schemaVersion !== 'number' ||
    !Array.isArray(story.chapterOrder) ||
    !story.chapterOrder.every((c) => typeof c === 'string')
  ) {
    return invalid('badStoryJson')
  }
  // Duplicate ids in chapterOrder must not inflate the counts.
  const order = [...new Set(story.chapterOrder as string[])]
  known = { title: story.title, chapterCount: order.length, updatedAt: story.updatedAt }
  if (story.id !== id) return invalid('idMismatch')
  if (story.schemaVersion > STORY_SCHEMA_VERSION) return invalid('storySchemaTooNew')
  const s = story as unknown as Story

  const wordsById = new Map<string, number>()
  for (const [rel, bytes] of files) {
    if (!/^chapters\/[^/]+\.json$/.test(rel)) continue
    let ch: unknown
    try {
      ch = parseJson(bytes)
    } catch {
      return invalid('badChapter')
    }
    if (
      !isRecord(ch) ||
      typeof ch.id !== 'string' ||
      typeof ch.schemaVersion !== 'number' ||
      !isRecord(ch.doc) ||
      ch.doc.type !== 'doc'
    ) {
      return invalid('badChapter')
    }
    if (ch.schemaVersion > CHAPTER_SCHEMA_VERSION) return invalid('chapterSchemaTooNew')
    wordsById.set(ch.id, typeof ch.wordCount === 'number' ? ch.wordCount : 0)
  }

  const notes = files.get('notes/notes.json')
  if (notes) {
    let n: unknown
    try {
      n = parseJson(notes)
    } catch {
      return invalid('badNotes')
    }
    if (!isRecord(n) || typeof n.schemaVersion !== 'number') return invalid('badNotes')
    if (n.schemaVersion > NOTES_SCHEMA_VERSION) return invalid('notesSchemaTooNew')
  }

  const warnings: ImportStoryWarning[] = order
    .filter((c) => !wordsById.has(c))
    .map((chapterId) => ({ kind: 'missingChapter', chapterId }))
  const wordCount = order.reduce((sum, c) => sum + (wordsById.get(c) ?? 0), 0)
  return {
    id, files, warnings,
    incoming: { title: s.title, chapterCount: order.length, wordCount, updatedAt: storyLastModified(files) || s.updatedAt }
  }
}
