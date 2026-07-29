import { describe, it, expect } from 'vitest'
import { formatSpellLanguages, shouldShowFooterInfo } from './EditorFooter'

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

describe('shouldShowFooterInfo', () => {
  it('hides the info line when hidden and not in an error state', () => {
    expect(shouldShowFooterInfo(true, 'idle')).toBe(false)
  })
  it('forces the info line back on a save error even when hidden', () => {
    expect(shouldShowFooterInfo(true, 'error')).toBe(true)
  })
  it('shows the info line whenever it is not hidden', () => {
    expect(shouldShowFooterInfo(false, 'idle')).toBe(true)
    expect(shouldShowFooterInfo(false, 'error')).toBe(true)
  })
})
