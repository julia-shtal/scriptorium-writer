/**
 * Ambient OPFS type augmentations (MP4).
 *
 * The TypeScript DOM lib bundled with this toolchain predates several stable OPFS
 * APIs this port relies on in Chrome (the target platform):
 *  - `FileSystemDirectoryHandle` async iteration (`keys()` / `entries()` / `values()`),
 *  - `FileSystemFileHandle.move()`,
 *  - `FileSystemFileHandle.createSyncAccessHandle()` + `FileSystemSyncAccessHandle`.
 *
 * We also declare a minimal `DedicatedWorkerGlobalScope` (the WebWorker lib is not
 * loaded — enabling it would clash with the DOM lib's `self`). These declarations
 * describe only what the port + worker actually call; they are not exhaustive.
 *
 * This file is web-only (excluded from the Node tsconfig) and adds no runtime code.
 */

interface FileSystemSyncAccessHandle {
  read(buffer: BufferSource, options?: { at?: number }): number
  write(buffer: BufferSource, options?: { at?: number }): number
  truncate(newSize: number): void
  getSize(): number
  flush(): void
  close(): void
}

interface FileSystemDirectoryHandle {
  keys(): AsyncIterableIterator<string>
  entries(): AsyncIterableIterator<[string, FileSystemHandle]>
  values(): AsyncIterableIterator<FileSystemHandle>
  [Symbol.asyncIterator](): AsyncIterableIterator<[string, FileSystemHandle]>
}

interface FileSystemFileHandle {
  createSyncAccessHandle(): Promise<FileSystemSyncAccessHandle>
  move(parent: FileSystemDirectoryHandle, name: string): Promise<void>
  move(name: string): Promise<void>
}

interface DedicatedWorkerGlobalScope {
  postMessage(message: unknown, transfer?: Transferable[]): void
  onmessage: ((this: DedicatedWorkerGlobalScope, ev: MessageEvent) => unknown) | null
}
