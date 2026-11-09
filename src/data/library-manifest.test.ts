import { describe, it, expect } from 'vitest'
import { buildLibraryManifest, isExcludedFromExport, MANIFEST_ENTRY } from './library-manifest'
import { APP_VERSION } from '@shared/app-version'

describe('buildLibraryManifest', () => {
  it('stamps format, version, platform, time and schema versions', () => {
    const m = buildLibraryManifest('web', new Date('2026-11-09T11:40:00.000Z'))
    expect(m).toEqual({
      format: 'scriptorium-library',
      formatVersion: 1,
      appVersion: APP_VERSION,
      exportedAt: '2026-11-09T11:40:00.000Z',
      platform: 'web',
      schema: { story: 1, chapter: 1, notes: 1 }
    })
  })
})

describe('isExcludedFromExport', () => {
  it('excludes a root manifest and the import staging tree only', () => {
    expect(isExcludedFromExport(MANIFEST_ENTRY)).toBe(true)
    expect(isExcludedFromExport('.import-tmp')).toBe(true)
    expect(isExcludedFromExport('.import-tmp/run/x/story.json')).toBe(true)
    expect(isExcludedFromExport('stories/a/manifest.json')).toBe(false)
    expect(isExcludedFromExport('stories/a/story.json')).toBe(false)
    expect(isExcludedFromExport('.trash/a/story.json')).toBe(false)
  })
})
