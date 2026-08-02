import { describe, it, expect } from 'vitest'
import { plural, type PluralForms } from './plural'

const RU_WORDS: PluralForms = { one: 'слово', few: 'слова', many: 'слов' }
const EN_WORDS: PluralForms = { one: 'word', few: 'words', many: 'words' }

describe('plural (ru)', () => {
  const cases: Array<[number, string]> = [
    [0, 'слов'],
    [1, 'слово'],
    [2, 'слова'],
    [4, 'слова'],
    [5, 'слов'],
    [11, 'слов'],
    [12, 'слов'],
    [14, 'слов'],
    [21, 'слово'],
    [22, 'слова'],
    [25, 'слов'],
    [100, 'слов'],
    [101, 'слово'],
    [111, 'слов'],
    [112, 'слов']
  ]
  it.each(cases)('%i → %s', (count, expected) => {
    expect(plural(count, RU_WORDS, 'ru')).toBe(expected)
  })
})

describe('plural (en)', () => {
  const cases: Array<[number, string]> = [
    [0, 'words'],
    [1, 'word'],
    [2, 'words'],
    [21, 'words']
  ]
  it.each(cases)('%i → %s', (count, expected) => {
    expect(plural(count, EN_WORDS, 'en')).toBe(expected)
  })
})
