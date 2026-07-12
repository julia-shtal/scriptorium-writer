import { describe, it, expect } from 'vitest'
import { buildSpellcheckMenuTemplate } from './spellcheck'

describe('buildSpellcheckMenuTemplate', () => {
  it('returns no items when there is no misspelled word', () => {
    expect(buildSpellcheckMenuTemplate({ misspelledWord: '', dictionarySuggestions: [] })).toEqual([])
  })
  it('lists one suggestion item per suggestion, a separator, then add-to-dictionary', () => {
    const items = buildSpellcheckMenuTemplate({ misspelledWord: 'превед', dictionarySuggestions: ['привет', 'преед'] })
    expect(items).toEqual([
      { type: 'suggestion', label: 'привет', replacement: 'привет' },
      { type: 'suggestion', label: 'преед', replacement: 'преед' },
      { type: 'separator' },
      { type: 'addToDictionary', label: 'Добавить в словарь', word: 'превед' }
    ])
  })
  it('offers add-to-dictionary even when there are no suggestions', () => {
    const items = buildSpellcheckMenuTemplate({ misspelledWord: 'zxqwty', dictionarySuggestions: [] })
    expect(items).toEqual([
      { type: 'addToDictionary', label: 'Добавить в словарь', word: 'zxqwty' }
    ])
  })
})
