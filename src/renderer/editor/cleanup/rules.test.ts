import { describe, expect, test } from 'vitest'
import { rules, runRules } from './rules'

function apply(id: string, text: string): string {
  const rule = rules.find((r) => r.id === id)
  if (!rule) throw new Error(`no rule ${id}`)
  return rule.apply(text)
}

describe('cleanup rules — individual', () => {
  test('collapse-spaces: runs of spaces → one', () => {
    expect(apply('collapse-spaces', 'a    b')).toBe('a b')
    expect(apply('collapse-spaces', 'a b')).toBe('a b')
    expect(apply('collapse-spaces', 'a\t\tb')).toBe('a b')
  })

  test('punctuation-spacing: no space before, single space after', () => {
    expect(apply('punctuation-spacing', 'слово ,слово')).toBe('слово, слово')
    expect(apply('punctuation-spacing', 'храма,где')).toBe('храма, где')
    expect(apply('punctuation-spacing', 'храма ,где')).toBe('храма, где')
    expect(apply('punctuation-spacing', 'да . Нет')).toBe('да. Нет')
  })

  test('punctuation-spacing: leaves end-of-string punctuation alone', () => {
    expect(apply('punctuation-spacing', 'конец.')).toBe('конец.')
    expect(apply('punctuation-spacing', 'что?!')).toBe('что?!')
  })

  test('hyphen-word-spacing: stray space around intra-word hyphen', () => {
    expect(apply('hyphen-word-spacing', 'что- нибудь')).toBe('что-нибудь')
    expect(apply('hyphen-word-spacing', 'что -нибудь')).toBe('что-нибудь')
    expect(apply('hyphen-word-spacing', 'кое-как')).toBe('кое-как')
  })

  test('em-dash: space-hyphen-space → em dash', () => {
    expect(apply('em-dash', 'текст - текст')).toBe('текст — текст')
    expect(apply('em-dash', 'a-b')).toBe('a-b')
  })

  test('trim-trailing: trailing whitespace per line', () => {
    expect(apply('trim-trailing', 'строка   ')).toBe('строка')
    expect(apply('trim-trailing', 'a  \nb\t')).toBe('a\nb')
  })
})

describe('runRules — composed pipeline (TASKS.md acceptance)', () => {
  test('the three headline cases', () => {
    expect(runRules('текст - текст')).toBe('текст — текст')
    expect(runRules('слово ,слово')).toBe('слово, слово')
    expect(runRules('что- нибудь')).toBe('что-нибудь')
  })

  test('храма,где → храма, где', () => {
    expect(runRules('храма,где')).toBe('храма, где')
  })

  test('trailing space trim through the pipeline', () => {
    expect(runRules('строка   ')).toBe('строка')
  })

  test('combined sentence', () => {
    expect(runRules('текст - текст, слово ,слово и что- нибудь ещё   ')).toBe(
      'текст — текст, слово, слово и что-нибудь ещё'
    )
  })

  test('is a no-op on already-clean text', () => {
    const clean = 'Чистый текст — без ошибок, всё хорошо.'
    expect(runRules(clean)).toBe(clean)
  })
})
