/**
 * Typed application errors shared by main, preload, and renderer.
 *
 * File operations never throw raw Node errors across the IPC boundary. The
 * FileService throws {@link AppError} with a stable {@link AppErrorCode}; the IPC
 * layer encodes it into a plain `Error` message ({@link encodeErrorForIpc}) that
 * Electron can serialize, and the preload decodes it back ({@link decodeIpcError})
 * so the renderer sees a real `AppError` with its code intact.
 */

export type AppErrorCode =
  | 'NOT_FOUND' // requested story/chapter/version does not exist
  | 'ALREADY_EXISTS' // would clobber an existing entity
  | 'INVALID_INPUT' // caller passed a malformed argument
  | 'INVALID_DOC' // outgoing ProseMirror doc failed validation (never written)
  | 'CHAPTER_CORRUPT' // on-disk canon exists but cannot be parsed
  | 'READ_FAILED' // unexpected read failure
  | 'WRITE_FAILED' // unexpected write failure
  | 'UNKNOWN' // anything not otherwise classified

export interface SerializedAppError {
  name: 'AppError'
  code: AppErrorCode
  message: string
}

export class AppError extends Error {
  readonly code: AppErrorCode

  constructor(code: AppErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'AppError'
    this.code = code
  }

  toSerialized(): SerializedAppError {
    return { name: 'AppError', code: this.code, message: this.message }
  }
}

export function isAppError(value: unknown): value is AppError {
  return value instanceof AppError
}

/** Normalize any thrown value into an {@link AppError}. */
export function toAppError(value: unknown): AppError {
  if (isAppError(value)) return value
  if (value instanceof Error) return new AppError('UNKNOWN', value.message, { cause: value })
  return new AppError('UNKNOWN', String(value))
}

const IPC_MARKER = 'AppError::'

/**
 * Encode an error into a plain `Error` whose message embeds the serialized code +
 * message. Electron only reliably ferries an error's `message` string across
 * `ipcMain.handle`, so we smuggle the structured payload inside it.
 */
export function encodeErrorForIpc(value: unknown): Error {
  const payload = toAppError(value).toSerialized()
  return new Error(`${IPC_MARKER}${JSON.stringify(payload)}`)
}

/**
 * Recover a {@link SerializedAppError} from an over-the-wire error message, even if
 * Electron has prefixed it with handler noise. Returns `null` if the message does
 * not contain an encoded AppError.
 */
export function decodeIpcError(message: string): SerializedAppError | null {
  const start = message.indexOf(IPC_MARKER)
  if (start === -1) return null
  const jsonStart = start + IPC_MARKER.length
  const brace = message.indexOf('{', jsonStart)
  if (brace === -1) return null
  const end = message.lastIndexOf('}')
  if (end < brace) return null
  try {
    const parsed = JSON.parse(message.slice(brace, end + 1)) as SerializedAppError
    if (parsed && parsed.name === 'AppError' && typeof parsed.code === 'string') {
      return parsed
    }
  } catch {
    return null
  }
  return null
}
