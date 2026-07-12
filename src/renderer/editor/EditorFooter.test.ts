import { describe, it, expect } from 'vitest'
import { formatSpellLanguages } from './EditorFooter'

describe('formatSpellLanguages', () => {
  it('renders known language codes as short uppercase labels joined by a dot', () => {
    expect(formatSpellLanguages(['ru', 'en-US'])).toBe('RU · EN')
  })
  it('falls back to an uppercased primary subtag for unknown codes', () => {
    expect(formatSpellLanguages(['fr'])).toBe('FR')
  })
  it('shows a dash when no languages are configured', () => {
    expect(formatSpellLanguages([])).toBe('—')
  })
})
