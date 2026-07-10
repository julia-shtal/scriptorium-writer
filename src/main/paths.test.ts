import { describe, it, expect } from 'vitest'
import {
  slugify,
  chapterFileStem,
  isoSafeTimestamp,
  makeUniqueStoryId,
  layout
} from './paths'

describe('slugify', () => {
  it('lowercases and hyphenates words', () => {
    expect(slugify('The Beginning')).toBe('the-beginning')
  })

  it('preserves Cyrillic letters (legible RU filenames)', () => {
    expect(slugify('Глава Первая')).toBe('глава-первая')
  })

  it('strips characters that are invalid in Windows filenames', () => {
    expect(slugify('a/b:c*?"<>|d')).toBe('a-b-c-d')
  })

  it('collapses and trims hyphens', () => {
    expect(slugify('  hello --- world  ')).toBe('hello-world')
  })

  it('returns an empty string for punctuation-only input', () => {
    expect(slugify('!!! ...')).toBe('')
  })
})

describe('chapterFileStem', () => {
  it('zero-pads the ordinal to two digits and appends the slug', () => {
    expect(chapterFileStem(1, 'The Beginning')).toBe('01-the-beginning')
  })

  it('keeps ordinals of three digits or more intact', () => {
    expect(chapterFileStem(120, 'X')).toBe('120-x')
  })

  it('falls back to "chapter" when the title has no slug', () => {
    expect(chapterFileStem(3, '!!!')).toBe('03-chapter')
  })
})

describe('isoSafeTimestamp', () => {
  it('replaces colons and dots so the string is a safe, sortable filename', () => {
    expect(isoSafeTimestamp(new Date('2026-07-09T10:15:00.123Z'))).toBe(
      '2026-07-09T10-15-00-123Z'
    )
  })
})

describe('makeUniqueStoryId', () => {
  it('slugifies the title', () => {
    expect(makeUniqueStoryId('Franz Story', [])).toBe('franz-story')
  })

  it('disambiguates against existing ids with a numeric suffix', () => {
    expect(makeUniqueStoryId('Franz Story', ['franz-story'])).toBe('franz-story-2')
    expect(makeUniqueStoryId('Franz Story', ['franz-story', 'franz-story-2'])).toBe(
      'franz-story-3'
    )
  })

  it('falls back to "story" for an untitled story', () => {
    expect(makeUniqueStoryId('', [])).toBe('story')
  })
})

describe('layout', () => {
  it('builds nested paths under the library root', () => {
    const root = '/lib'
    expect(layout.storiesDir(root).replace(/\\/g, '/')).toBe('/lib/stories')
    expect(layout.storyMeta(root, 'franz').replace(/\\/g, '/')).toBe(
      '/lib/stories/franz/story.json'
    )
    expect(layout.chapterVersionsDir(root, 'franz', 'ch-1').replace(/\\/g, '/')).toBe(
      '/lib/stories/franz/versions/ch-1'
    )
    expect(layout.notesFile(root, 'franz').replace(/\\/g, '/')).toBe(
      '/lib/stories/franz/notes/notes.json'
    )
    expect(layout.trashDir(root).replace(/\\/g, '/')).toBe('/lib/.trash')
  })
})
