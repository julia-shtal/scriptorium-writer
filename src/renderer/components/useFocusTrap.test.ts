import { describe, it, expect } from 'vitest'
import { trapTarget } from './useFocusTrap'

describe('trapTarget', () => {
  it('wraps forward from the last element and backward from the first', () => {
    expect(trapTarget(3, 2, false)).toBe(0)
    expect(trapTarget(3, 0, true)).toBe(2)
  })
  it('leaves moves between inner elements to the browser', () => {
    expect(trapTarget(3, 0, false)).toBeNull()
    expect(trapTarget(3, 2, true)).toBeNull()
  })
  it('pulls focus from outside (or the dialog itself) to the nearest end', () => {
    expect(trapTarget(3, -1, false)).toBe(0)
    expect(trapTarget(3, -1, true)).toBe(2)
  })
  it('a single element wraps onto itself', () => {
    expect(trapTarget(1, 0, false)).toBe(0)
    expect(trapTarget(1, 0, true)).toBe(0)
  })
  it('has nothing to offer with no focusable elements', () => {
    expect(trapTarget(0, -1, false)).toBeNull()
  })
})
