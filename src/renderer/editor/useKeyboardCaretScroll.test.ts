import { describe, it, expect } from 'vitest'
import { keyboardDidOpen } from './useKeyboardCaretScroll'

describe('keyboardDidOpen', () => {
  it('is true when the visual viewport shrinks past the 120px floor (keyboard opened)', () => {
    expect(keyboardDidOpen(1000, 600)).toBe(true) // ~400px keyboard
    expect(keyboardDidOpen(1000, 879)).toBe(true) // 121px drop
  })

  it('is false for no change or growth (keyboard closing / unchanged)', () => {
    expect(keyboardDidOpen(1000, 1000)).toBe(false)
    expect(keyboardDidOpen(600, 1000)).toBe(false) // keyboard closing
  })

  it('is false for small jitter below the floor (URL bar collapse, animation)', () => {
    expect(keyboardDidOpen(1000, 950)).toBe(false) // 50px
    expect(keyboardDidOpen(1000, 880)).toBe(false) // exactly 120px, not > 120
  })
})
