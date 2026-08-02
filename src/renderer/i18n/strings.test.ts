import { describe, it, expect } from 'vitest'
import { ru, en, format } from './strings'

/** Recursively collect dotted key paths from a nested string dictionary. */
function keyPaths(obj: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([k, v]) => {
    const path = prefix ? `${prefix}.${k}` : k
    return v !== null && typeof v === 'object'
      ? keyPaths(v as Record<string, unknown>, path)
      : [path]
  })
}

describe('i18n dictionaries', () => {
  it('ru and en have identical key sets', () => {
    expect(keyPaths(en).sort()).toEqual(keyPaths(ru).sort())
  })

  it('every leaf is a non-empty string in both languages', () => {
    for (const dict of [ru, en]) {
      for (const path of keyPaths(dict as Record<string, unknown>)) {
        const value = path.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown>)[k], dict)
        expect(typeof value, path).toBe('string')
        expect((value as string).length, path).toBeGreaterThan(0)
      }
    }
  })
})

describe('format()', () => {
  it('replaces {token} placeholders', () => {
    expect(format('«{title}» будет перемещена в корзину.', { title: 'Мороз' }))
      .toBe('«Мороз» будет перемещена в корзину.')
  })
  it('replaces repeated and multiple tokens', () => {
    expect(format('{n} of {n} in {where}', { n: '3', where: 'X' })).toBe('3 of 3 in X')
  })
  it('leaves unknown tokens untouched', () => {
    expect(format('hi {name}', {})).toBe('hi {name}')
  })
})
