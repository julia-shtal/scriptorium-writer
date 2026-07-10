import { describe, it, expect } from 'vitest'
import { AppError, toAppError, encodeErrorForIpc, decodeIpcError } from './errors'

describe('AppError', () => {
  it('carries a machine-readable code alongside the message', () => {
    const err = new AppError('NOT_FOUND', 'story "x" not found')
    expect(err.code).toBe('NOT_FOUND')
    expect(err.message).toBe('story "x" not found')
    expect(err).toBeInstanceOf(Error)
  })
})

describe('toAppError', () => {
  it('passes an AppError through unchanged', () => {
    const err = new AppError('INVALID_DOC', 'bad doc')
    expect(toAppError(err)).toBe(err)
  })

  it('wraps an unknown error as UNKNOWN, preserving its message', () => {
    const wrapped = toAppError(new Error('kaboom'))
    expect(wrapped.code).toBe('UNKNOWN')
    expect(wrapped.message).toBe('kaboom')
  })
})

describe('IPC encode/decode round-trip', () => {
  it('recovers the code and message across an IPC-shaped Error message', () => {
    const original = new AppError('CHAPTER_CORRUPT', 'canon failed to parse')
    // Electron wraps thrown errors and prefixes the message; simulate that noise.
    const overWire = `Error occurred in handler for 'x': ${encodeErrorForIpc(original).message}`
    const decoded = decodeIpcError(overWire)
    expect(decoded).toEqual({
      name: 'AppError',
      code: 'CHAPTER_CORRUPT',
      message: 'canon failed to parse'
    })
  })

  it('returns null when the message is not an encoded AppError', () => {
    expect(decodeIpcError('some unrelated error')).toBeNull()
  })
})
