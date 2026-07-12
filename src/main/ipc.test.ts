import { describe, it, expect, vi } from 'vitest'
import { registerIpcHandlers, IPC_CHANNELS } from './ipc'
import { AppError, decodeIpcError } from '@shared/errors'
import type { FileService } from './file-service'

type Listener = (event: unknown, ...args: unknown[]) => unknown

function makeRegistrar(): {
  handle: (channel: string, listener: Listener) => void
  channels: Map<string, Listener>
} {
  const channels = new Map<string, Listener>()
  return {
    handle: (channel, listener) => channels.set(channel, listener),
    channels
  }
}

describe('registerIpcHandlers', () => {
  it('registers a handler for every declared IPC channel', () => {
    const { handle, channels } = makeRegistrar()
    registerIpcHandlers({ handle }, {
      fileService: {} as FileService,
      revealInFolder: vi.fn(),
      setSpellLanguages: vi.fn()
    })
    for (const channel of IPC_CHANNELS) {
      expect(channels.has(channel)).toBe(true)
    }
  })

  it('delegates a call to the FileService and returns its result', async () => {
    const { handle, channels } = makeRegistrar()
    const createStory = vi.fn().mockResolvedValue({ id: 'x' })
    registerIpcHandlers({ handle }, {
      fileService: { createStory } as unknown as FileService,
      revealInFolder: vi.fn(),
      setSpellLanguages: vi.fn()
    })
    const result = await channels.get('createStory')!(null, { title: 'X' })
    expect(createStory).toHaveBeenCalledWith({ title: 'X' })
    expect(result).toEqual({ id: 'x' })
  })

  it('encodes a thrown AppError so it can survive IPC serialization', async () => {
    const { handle, channels } = makeRegistrar()
    const readStory = vi.fn().mockRejectedValue(new AppError('NOT_FOUND', 'nope'))
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    registerIpcHandlers({ handle }, {
      fileService: { readStory } as unknown as FileService,
      revealInFolder: vi.fn(),
      setSpellLanguages: vi.fn()
    })
    let thrown: unknown
    try {
      await channels.get('readStory')!(null, 'ghost')
    } catch (e) {
      thrown = e
    }
    expect(thrown).toBeInstanceOf(Error)
    const decoded = decodeIpcError((thrown as Error).message)
    expect(decoded).toMatchObject({ code: 'NOT_FOUND', message: 'nope' })
    expect(errorSpy).toHaveBeenCalled()
    errorSpy.mockRestore()
  })

  it('answers ping with pong', async () => {
    const { handle, channels } = makeRegistrar()
    registerIpcHandlers({ handle }, {
      fileService: {} as FileService,
      revealInFolder: vi.fn(),
      setSpellLanguages: vi.fn()
    })
    expect(await channels.get('ping')!(null)).toBe('pong')
  })

  it('applySpellLanguages delegates to the session hook', async () => {
    const { handle, channels } = makeRegistrar()
    const setSpellLanguages = vi.fn()
    registerIpcHandlers({ handle }, {
      fileService: {} as FileService,
      revealInFolder: vi.fn(),
      setSpellLanguages
    })
    await channels.get('applySpellLanguages')!(null, ['ru'])
    expect(setSpellLanguages).toHaveBeenCalledWith(['ru'])
  })
})
