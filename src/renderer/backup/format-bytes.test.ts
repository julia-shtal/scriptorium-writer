import { describe, it, expect } from 'vitest'
import { formatBytes } from './format-bytes'

describe('formatBytes', () => {
  it('formats bytes under 1 KB', () => {
    expect(formatBytes(512)).toBe('512 B')
  })
  it('formats kilobytes', () => {
    expect(formatBytes(2048)).toBe('2.0 KB')
  })
  it('formats megabytes', () => {
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB')
  })
  it('formats gigabytes', () => {
    expect(formatBytes(3 * 1024 * 1024 * 1024)).toBe('3.0 GB')
  })
  it('handles zero', () => {
    expect(formatBytes(0)).toBe('0 B')
  })
  it('formats exactly 1024 as the KB boundary', () => {
    expect(formatBytes(1024)).toBe('1.0 KB')
  })
  it('clamps non-finite or negative input to 0 B', () => {
    expect(formatBytes(NaN)).toBe('0 B')
    expect(formatBytes(-1)).toBe('0 B')
  })
})
