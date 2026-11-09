import { describe, it, expect } from 'vitest'
import { zipSync } from 'fflate'
import { filesEqual, isSafeEntryPath, parseLibraryArchive, storyLastModified, IMPORT_LIMITS } from './library-import'
import { isAppError } from '@shared/errors'

const enc = (s: string): Uint8Array => new TextEncoder().encode(s)
const json = (v: unknown): Uint8Array => enc(JSON.stringify(v))

const story = (id: string, over: Record<string, unknown> = {}): Record<string, unknown> => ({
  id, title: `Title ${id}`, description: '', tags: [], status: 'draft',
  createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-02-01T00:00:00.000Z',
  chapterOrder: ['c1'], schemaVersion: 1, ...over
})
const chapter = (id: string, over: Record<string, unknown> = {}): Record<string, unknown> => ({
  id, title: 'One', doc: { type: 'doc', content: [] }, wordCount: 7,
  createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', schemaVersion: 1, ...over
})
const manifest = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  format: 'scriptorium-library', formatVersion: 1, appVersion: '1.7.0',
  exportedAt: '2026-11-09T00:00:00.000Z', platform: 'web', schema: { story: 1, chapter: 1, notes: 1 }, ...over
})
const validStory = (id: string): Record<string, Uint8Array> => ({
  [`stories/${id}/story.json`]: json(story(id)),
  [`stories/${id}/chapters/01-one.json`]: json(chapter('c1')),
  [`stories/${id}/chapters/01-one.md`]: enc('# One'),
  [`stories/${id}/notes/notes.json`]: json({ characters: [], locations: [], world: [], timeline: [], scratch: '', schemaVersion: 1 })
})

const codeOf = (fn: () => unknown): string | undefined => {
  try { fn() } catch (err) { return isAppError(err) ? err.code : 'non-AppError' }
  return undefined
}

describe('parseLibraryArchive', () => {
  it('reads a legacy archive with no manifest', () => {
    const parsed = parseLibraryArchive(zipSync(validStory('a')))
    expect(parsed.manifest).toBeNull()
    expect(parsed.stories).toHaveLength(1)
    expect(parsed.stories[0]).toMatchObject({
      id: 'a',
      incoming: { title: 'Title a', chapterCount: 1, wordCount: 7, updatedAt: '2026-02-01T00:00:00.000Z' },
      warnings: []
    })
    expect(parsed.stories[0]!.invalidReason).toBeUndefined()
    expect(parsed.stories[0]!.files.has('chapters/01-one.md')).toBe(true)
  })

  it('reports the newest chapter edit as the story updatedAt (saveChapter never touches story.json)', () => {
    const files = validStory('a')
    files['stories/a/chapters/01-one.json'] = json(chapter('c1', { updatedAt: '2026-09-01T00:00:00.000Z' }))
    const parsed = parseLibraryArchive(zipSync(files))
    expect(parsed.stories[0]!.incoming.updatedAt).toBe('2026-09-01T00:00:00.000Z')
  })

  it('ignores the dates of chapters outside chapterOrder', () => {
    const files = validStory('a')
    files['stories/a/chapters/02-stray.json'] = json(chapter('stray', { updatedAt: '2030-01-01T00:00:00.000Z' }))
    const parsed = parseLibraryArchive(zipSync(files))
    expect(parsed.stories[0]!.incoming.updatedAt).toBe('2026-02-01T00:00:00.000Z')
  })

  it('storyLastModified is empty when story.json is unreadable', () => {
    expect(storyLastModified(new Map([['story.json', enc('{nope')]]))).toBe('')
    expect(storyLastModified(new Map())).toBe('')
  })

  it('reads a manifest archive', () => {
    const parsed = parseLibraryArchive(zipSync({ 'manifest.json': json(manifest()), ...validStory('a') }))
    expect(parsed.manifest).toMatchObject({ formatVersion: 1, platform: 'web' })
  })

  it('refuses a newer formatVersion', () => {
    expect(codeOf(() => parseLibraryArchive(zipSync({ 'manifest.json': json(manifest({ formatVersion: 2 })), ...validStory('a') }))))
      .toBe('IMPORT_UNSUPPORTED_VERSION')
  })

  it('refuses a manifest that is not ours', () => {
    expect(codeOf(() => parseLibraryArchive(zipSync({ 'manifest.json': json({ format: 'other' }) }))))
      .toBe('IMPORT_INVALID_ARCHIVE')
  })

  it('refuses bytes that are not a zip', () => {
    expect(codeOf(() => parseLibraryArchive(enc('not a zip')))).toBe('IMPORT_INVALID_ARCHIVE')
  })

  it.each(['../evil', '/abs', 'C:\\x', 'C:/x', 'a\\b', 'stories/a/../../x', 'stories/a/b\u0000c'])(
    'refuses the whole archive for entry %j',
    (name) => {
      expect(codeOf(() => parseLibraryArchive(zipSync({ ...validStory('a'), [name]: enc('x') }))))
        .toBe('IMPORT_INVALID_ARCHIVE')
    }
  )

  it('refuses before inflating when over the entry limit', () => {
    const bytes = zipSync(validStory('a'))
    expect(codeOf(() => parseLibraryArchive(bytes, { ...IMPORT_LIMITS, maxEntries: 3 }))).toBe('IMPORT_TOO_LARGE')
  })

  it('refuses when declared uncompressed size is over the limit', () => {
    const bytes = zipSync(validStory('a'))
    expect(codeOf(() => parseLibraryArchive(bytes, { ...IMPORT_LIMITS, maxUncompressedBytes: 10 }))).toBe('IMPORT_TOO_LARGE')
  })

  it('refuses an archive file over the size limit', () => {
    const bytes = zipSync(validStory('a'))
    expect(codeOf(() => parseLibraryArchive(bytes, { ...IMPORT_LIMITS, maxArchiveBytes: 10 }))).toBe('IMPORT_TOO_LARGE')
  })

  it('ignores and counts .trash/, manifest-free stray files and loose stories/ files', () => {
    const parsed = parseLibraryArchive(zipSync({
      ...validStory('a'),
      '.trash/old-2026/story.json': json(story('old')),
      'readme.txt': enc('hi'),
      'stories/loose.txt': enc('x')
    }))
    expect(parsed.stories.map((s) => s.id)).toEqual(['a'])
    expect(parsed.ignoredEntries).toBe(3)
  })

  it('marks a story invalid when its schemaVersion is newer', () => {
    const files = { ...validStory('a'), 'stories/a/story.json': json(story('a', { schemaVersion: 2 })) }
    expect(parseLibraryArchive(zipSync(files)).stories[0]!.invalidReason).toBe('storySchemaTooNew')
  })

  it('marks a story invalid when a chapter schemaVersion is newer', () => {
    const files = { ...validStory('a'), 'stories/a/chapters/01-one.json': json(chapter('c1', { schemaVersion: 2 })) }
    expect(parseLibraryArchive(zipSync(files)).stories[0]!.invalidReason).toBe('chapterSchemaTooNew')
  })

  it('marks invalid on id mismatch, missing/corrupt story.json, corrupt chapter, corrupt notes', () => {
    const cases: [Record<string, Uint8Array>, string][] = [
      [{ ...validStory('a'), 'stories/a/story.json': json(story('b')) }, 'idMismatch'],
      [{ 'stories/a/chapters/01-one.json': json(chapter('c1')) }, 'missingStoryJson'],
      [{ ...validStory('a'), 'stories/a/story.json': enc('{nope') }, 'badStoryJson'],
      [{ ...validStory('a'), 'stories/a/chapters/01-one.json': enc('{nope') }, 'badChapter'],
      [{ ...validStory('a'), 'stories/a/notes/notes.json': enc('{nope') }, 'badNotes']
    ]
    for (const [files, reason] of cases) {
      expect(parseLibraryArchive(zipSync(files)).stories[0]!.invalidReason).toBe(reason)
    }
  })

  it('keeps other stories when one is invalid', () => {
    const parsed = parseLibraryArchive(zipSync({ ...validStory('a'), ...validStory('b'), 'stories/b/story.json': enc('{') }))
    expect(parsed.stories.find((s) => s.id === 'a')!.invalidReason).toBeUndefined()
    expect(parsed.stories.find((s) => s.id === 'b')!.invalidReason).toBe('badStoryJson')
  })

  it('warns, not fails, on a chapter listed but missing', () => {
    const files = { ...validStory('a'), 'stories/a/story.json': json(story('a', { chapterOrder: ['c1', 'c2'] })) }
    const s = parseLibraryArchive(zipSync(files)).stories[0]!
    expect(s.invalidReason).toBeUndefined()
    expect(s.warnings).toEqual([{ kind: 'missingChapter', chapterId: 'c2' }])
  })
})

describe('isSafeEntryPath', () => {
  it('accepts real library paths', () => {
    expect(isSafeEntryPath('stories/мороз/chapters/01-глава.json')).toBe(true)
    expect(isSafeEntryPath('stories/a/versions/c1/2026-07-09T10-15-00-123Z.json')).toBe(true)
    expect(isSafeEntryPath('stories/a/')).toBe(true)
  })
})

describe('filesEqual', () => {
  it('ignores versions/ and compares bytes', () => {
    const a = new Map([['story.json', enc('x')], ['versions/c1/1.json', enc('v1')]])
    const b = new Map([['story.json', enc('x')], ['versions/c1/2.json', enc('v2')]])
    expect(filesEqual(a, b)).toBe(true)
    expect(filesEqual(a, new Map([['story.json', enc('y')]]))).toBe(false)
    expect(filesEqual(a, new Map([['story.json', enc('x')], ['notes/notes.json', enc('n')]]))).toBe(false)
  })
})

// --- Hand-built hostile archives (M31 review). zipSync cannot lie about sizes, so these
// are assembled byte by byte.
const u16 = (a: Uint8Array, o: number, v: number): void => {
  a[o] = v & 255
  a[o + 1] = (v >>> 8) & 255
}
const u32 = (a: Uint8Array, o: number, v: number): void => {
  u16(a, o, v & 0xffff)
  u16(a, o + 2, (v >>> 16) & 0xffff)
}

/** N central-directory entries, all stored, all pointing at one payload and declaring originalSize 0. */
function overlappingStored(entries: number, payload: number, method = 0): Uint8Array {
  const lname = enc('stories/a/x')
  const local = new Uint8Array(30 + lname.length + payload)
  u32(local, 0, 0x04034b50)
  u16(local, 4, 20)
  u16(local, 8, method)
  u32(local, 18, payload)
  u32(local, 22, payload)
  u16(local, 26, lname.length)
  local.set(lname, 30)
  const cds: Uint8Array[] = []
  for (let i = 0; i < entries; i++) {
    const n = enc(`stories/a/f${i}`)
    const c = new Uint8Array(46 + n.length)
    u32(c, 0, 0x02014b50)
    u16(c, 4, 20)
    u16(c, 6, 20)
    u16(c, 10, method)
    u32(c, 20, payload) // compressed size
    u32(c, 24, 0) // uncompressed size: the lie
    u16(c, 28, n.length)
    c.set(n, 46)
    cds.push(c)
  }
  const cdSize = cds.reduce((s, c) => s + c.length, 0)
  const eocd = new Uint8Array(22)
  u32(eocd, 0, 0x06054b50)
  u16(eocd, 8, entries)
  u16(eocd, 10, entries)
  u32(eocd, 12, cdSize)
  u32(eocd, 16, local.length)
  const out = new Uint8Array(local.length + cdSize + 22)
  out.set(local, 0)
  let o = local.length
  for (const c of cds) {
    out.set(c, o)
    o += c.length
  }
  out.set(eocd, o)
  return out
}

/** A 98-byte file whose zip64 end-of-directory record claims 0xFFFFFFFF entries. */
function zip64EntryBomb(): Uint8Array {
  const buf = new Uint8Array(56 + 20 + 22)
  u32(buf, 0, 0x06064b50)
  u32(buf, 32, 0xffffffff)
  u32(buf, 56, 0x07064b50)
  u32(buf, 76, 0x06054b50)
  u16(buf, 76 + 8, 0xffff)
  return buf
}

describe('parseLibraryArchive — hostile archives', () => {
  it('refuses stored entries that lie about their size (overlapping payload bomb)', () => {
    expect(codeOf(() => parseLibraryArchive(overlappingStored(20, 4096)))).toBe('IMPORT_INVALID_ARCHIVE')
  })

  it('refuses compression methods other than stored and deflate', () => {
    expect(codeOf(() => parseLibraryArchive(overlappingStored(1, 16, 14)))).toBe('IMPORT_INVALID_ARCHIVE')
  })

  it('stops listing early on a zip64 entry-count bomb', () => {
    // The bomb's ~4e9 claimed entries are all zeros, so the duplicate-name check may end it
    // before the count limit does. Either way it must end at once with a typed refusal.
    const started = Date.now()
    expect(['IMPORT_TOO_LARGE', 'IMPORT_INVALID_ARCHIVE']).toContain(codeOf(() => parseLibraryArchive(zip64EntryBomb())))
    expect(Date.now() - started).toBeLessThan(2000)
  })

  it('ends a zip64 count bomb with distinct names in IMPORT_TOO_LARGE', () => {
    // A real directory of distinct entries, but a zip64 record claiming 0xFFFFFFFF of them.
    const base = zipSync(validStory('a'))
    const eocdAt = base.length - 22
    const at = (o: number): number => base[eocdAt + o] ?? 0
    const out = new Uint8Array(base.length + 56 + 20)
    out.set(base.subarray(0, eocdAt), 0)
    const rec = eocdAt
    u32(out, rec, 0x06064b50)
    u32(out, rec + 32, 0xffffffff)
    u32(out, rec + 40, at(12) | (at(13) << 8))
    u32(out, rec + 48, at(16) | (at(17) << 8) | (at(18) << 16))
    u32(out, rec + 56, 0x07064b50)
    u32(out, rec + 56 + 8, rec)
    out.set(base.subarray(eocdAt), rec + 76)
    u16(out, rec + 76 + 8, 0xffff)
    expect(codeOf(() => parseLibraryArchive(out, { ...IMPORT_LIMITS, maxEntries: 3 }))).toBe('IMPORT_TOO_LARGE')
  })

  it('enforces the entry limit inside the listing loop', () => {
    // maxEntries 0 trips on the very first entry, before any later check could.
    expect(codeOf(() => parseLibraryArchive(zipSync(validStory('a')), { ...IMPORT_LIMITS, maxEntries: 0 })))
      .toBe('IMPORT_TOO_LARGE')
  })

  it('refuses names that collide case-insensitively', () => {
    const files = { ...validStory('a'), 'stories/a/Story.JSON': enc('{}') }
    expect(codeOf(() => parseLibraryArchive(zipSync(files)))).toBe('IMPORT_INVALID_ARCHIVE')
  })
})

describe('parseLibraryArchive — manifest shape', () => {
  it.each([{ appVersion: 7 }, { platform: null }, { exportedAt: undefined }, { schema: 'x' }, { schema: [] }])(
    'refuses a manifest with %j',
    (over) => {
      const files = { 'manifest.json': json(manifest(over)), ...validStory('a') }
      expect(codeOf(() => parseLibraryArchive(zipSync(files)))).toBe('IMPORT_INVALID_ARCHIVE')
    }
  )
})

describe('parseLibraryArchive — more story validation', () => {
  it('flags a notes file from a newer schema', () => {
    const files = {
      ...validStory('a'),
      'stories/a/notes/notes.json': json({ schemaVersion: 2 })
    }
    expect(parseLibraryArchive(zipSync(files)).stories[0]!.invalidReason).toBe('notesSchemaTooNew')
  })

  it('flags a chapter that parses but whose doc is not a ProseMirror doc', () => {
    const files = { ...validStory('a'), 'stories/a/chapters/01-one.json': json(chapter('c1', { doc: { type: 'x' } })) }
    expect(parseLibraryArchive(zipSync(files)).stories[0]!.invalidReason).toBe('badChapter')
  })

  it.each(['null', '[]'])('flags story.json that is %s', (text) => {
    const files = { ...validStory('a'), 'stories/a/story.json': enc(text) }
    expect(parseLibraryArchive(zipSync(files)).stories[0]!.invalidReason).toBe('badStoryJson')
  })

  it('keeps the parsed title when a chapter makes the story invalid', () => {
    const files = { ...validStory('a'), 'stories/a/chapters/01-one.json': enc('{nope') }
    const s = parseLibraryArchive(zipSync(files)).stories[0]!
    expect(s.invalidReason).toBe('badChapter')
    expect(s.incoming).toMatchObject({ title: 'Title a', chapterCount: 1, updatedAt: '2026-02-01T00:00:00.000Z' })
  })

  it('counts a chapter id repeated in chapterOrder once', () => {
    const files = { ...validStory('a'), 'stories/a/story.json': json(story('a', { chapterOrder: ['c1', 'c1'] })) }
    expect(parseLibraryArchive(zipSync(files)).stories[0]!.incoming).toMatchObject({ chapterCount: 1, wordCount: 7 })
  })

  it('does not count directory entries as ignored', () => {
    const files = { ...validStory('a'), 'stories/a/': new Uint8Array(0), 'junk/': new Uint8Array(0) }
    expect(parseLibraryArchive(zipSync(files)).ignoredEntries).toBe(0)
  })
})

describe('isSafeEntryPath — rejections', () => {
  it.each([
    'stories//x',
    'stories/./x',
    'stories/a/x\u0007y',
    'stories/a/x:y',
    'stories/a/x.',
    'stories/a/x '
  ])('rejects %j', (name) => {
    expect(isSafeEntryPath(name)).toBe(false)
  })

  it('accepts Windows device names, which slugify can legitimately produce as story ids', () => {
    expect(isSafeEntryPath('stories/con/story.json')).toBe(true)
  })
})
