import { describe, it, expect } from 'vitest'
import { formatDate } from './format'

describe('formatDate', () => {
  const iso = '2026-03-05T10:15:00.000Z'
  it('renders ru-RU order (day.month.year) for ru', () => {
    expect(formatDate(iso, 'ru')).toMatch(/^\d{2}\.\d{2}\.\d{4}$/)
  })
  it('renders en-US order (month/day/year) for en', () => {
    expect(formatDate(iso, 'en')).toMatch(/^\d{1,2}\/\d{1,2}\/\d{4}$/)
  })
  it('ru and en produce different separators for the same date', () => {
    expect(formatDate(iso, 'ru')).not.toBe(formatDate(iso, 'en'))
  })
})
