/**
 * Library path resolution and filename helpers for the data layer.
 *
 * Filenames use `NN-slug` where `NN` is the ordinal from a story's `chapterOrder`
 * and `slug` derives from the chapter title. These names are for human legibility
 * only — the app always resolves chapters by the stable `id` stored *inside* each
 * file, never by trusting a filename (SPEC §4). Slugs keep Unicode letters so that
 * Russian titles stay readable on disk; only characters that are unsafe in Windows
 * filenames are stripped.
 */

import { join } from 'node:path'
import { randomBytes } from 'node:crypto'

/**
 * Turn arbitrary text into a filesystem-safe, legible slug. Keeps Unicode letters
 * and numbers (so Cyrillic survives), lowercases, and collapses everything else to
 * single hyphens. Returns `''` when nothing usable remains — callers supply a
 * fallback stem.
 */
export function slugify(input: string): string {
  return input
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-') // keep letters/numbers; everything else → hyphen
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

/** `NN-slug` stem for a chapter file (no extension), zero-padded to two digits. */
export function chapterFileStem(ordinal: number, title: string): string {
  const nn = String(ordinal).padStart(2, '0')
  const slug = slugify(title) || 'chapter'
  return `${nn}-${slug}`
}

/**
 * ISO timestamp reshaped into a safe, lexically-sortable filename stem:
 * `2026-07-09T10:15:00.123Z` → `2026-07-09T10-15-00-123Z`. Lexical order matches
 * chronological order, which is what version pruning relies on.
 */
export function isoSafeTimestamp(date: Date): string {
  return date.toISOString().replace(/:/g, '-').replace(/\./g, '-')
}

/** Deterministic base id from a title, with a caller-supplied empty fallback. */
function baseId(title: string, fallback: string): string {
  return slugify(title) || fallback
}

/**
 * A stable, slug-ish story id unique among `existingIds`. The id doubles as the
 * story's folder name, so it must be filesystem-safe (guaranteed by {@link slugify}).
 */
export function makeUniqueStoryId(title: string, existingIds: readonly string[]): string {
  const base = baseId(title, 'story')
  if (!existingIds.includes(base)) return base
  let n = 2
  while (existingIds.includes(`${base}-${n}`)) n++
  return `${base}-${n}`
}

/**
 * A stable chapter id: a title slug plus a short random suffix so that chapters
 * with identical titles never collide and the id survives renames/reorders.
 */
export function makeChapterId(title: string, existingIds: readonly string[]): string {
  const base = baseId(title, 'chapter')
  let id = `${base}-${randomBytes(3).toString('hex')}`
  while (existingIds.includes(id)) {
    id = `${base}-${randomBytes(3).toString('hex')}`
  }
  return id
}

/**
 * Pure path builders for the on-disk layout (SPEC §4), given a resolved library
 * `root`. Nothing here touches the filesystem.
 */
export const layout = {
  storiesDir: (root: string): string => join(root, 'stories'),
  storyDir: (root: string, storyId: string): string => join(root, 'stories', storyId),
  storyMeta: (root: string, storyId: string): string =>
    join(root, 'stories', storyId, 'story.json'),
  chaptersDir: (root: string, storyId: string): string =>
    join(root, 'stories', storyId, 'chapters'),
  versionsDir: (root: string, storyId: string): string =>
    join(root, 'stories', storyId, 'versions'),
  chapterVersionsDir: (root: string, storyId: string, chapterId: string): string =>
    join(root, 'stories', storyId, 'versions', chapterId),
  notesDir: (root: string, storyId: string): string =>
    join(root, 'stories', storyId, 'notes'),
  notesFile: (root: string, storyId: string): string =>
    join(root, 'stories', storyId, 'notes', 'notes.json'),
  trashDir: (root: string): string => join(root, '.trash')
} as const
