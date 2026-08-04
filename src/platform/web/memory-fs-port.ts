/**
 * MemoryFsPort — an in-memory {@link FsPort} for the web build (MP3).
 *
 * SCAFFOLDING ONLY. This is a browser-safe, dependency-free implementation that
 * keeps file contents in a `Map` and known directories in a `Set`. It imports no
 * Node built-ins whatsoever and touches no real storage, so data does NOT survive
 * a page reload — expected and fine for this milestone.
 *
 * // TODO(MP4): replace with OpfsFsPort (Origin Private File System, persistent).
 *
 * Paths are forward-slash strings; the data layer normalises via
 * `src/data/path-utils.ts`. Missing paths reject with an error carrying
 * `code === 'ENOENT'`, matching what `FileService.isNotFound` verifies. The
 * optional `sync` durability barrier is intentionally omitted — atomic write
 * (tmp + rename) still works without fsync; this is the accepted web tradeoff.
 */
import type { FsPort } from '@data/fs-port'

/** Error carrying the `code === 'ENOENT'` shape the data layer checks. */
function enoent(path: string): Error & { code: string } {
  return Object.assign(new Error(`ENOENT: no such file or directory, '${path}'`), {
    code: 'ENOENT'
  })
}

/** Normalise to forward slashes and strip any trailing slash (but keep root). */
function normalize(path: string): string {
  const p = path.replace(/\\/g, '/').replace(/\/+$/, '')
  return p === '' ? '/' : p
}

/** All ancestor directory paths of `path`, from the shallowest to `path` itself. */
function ancestors(path: string): string[] {
  const parts = path.split('/').filter((s) => s !== '')
  const leading = /^\//.test(path) ? '/' : ''
  const out: string[] = []
  let acc = leading
  for (const part of parts) {
    acc = acc === '/' || acc === '' ? `${leading}${part}` : `${acc}/${part}`
    out.push(acc)
  }
  return out
}

export class MemoryFsPort implements FsPort {
  private readonly files = new Map<string, Uint8Array>()
  private readonly dirs = new Set<string>()

  async mkdir(path: string, _opts: { recursive: true }): Promise<void> {
    const target = normalize(path)
    // recursive: record the path and every ancestor; never throw on existing.
    for (const dir of ancestors(target)) this.dirs.add(dir)
    this.dirs.add(target)
  }

  async readFile(path: string): Promise<string> {
    const bytes = this.files.get(normalize(path))
    if (bytes === undefined) throw enoent(path)
    return new TextDecoder('utf-8').decode(bytes)
  }

  async readFileBytes(path: string): Promise<Uint8Array> {
    const bytes = this.files.get(normalize(path))
    if (bytes === undefined) throw enoent(path)
    // Return a copy so callers cannot mutate internal state.
    return bytes.slice()
  }

  async writeFile(path: string, data: string | Uint8Array): Promise<void> {
    const target = normalize(path)
    const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data.slice()
    this.files.set(target, bytes)
  }

  async readdir(path: string): Promise<string[]> {
    const target = normalize(path)
    const prefix = target === '/' ? '/' : `${target}/`
    const names = new Set<string>()
    let exists = this.dirs.has(target)

    const collect = (key: string): void => {
      if (!key.startsWith(prefix)) return
      exists = true
      const rest = key.slice(prefix.length)
      if (rest === '') return
      const name = rest.split('/')[0]
      if (name !== '') names.add(name)
    }

    for (const key of this.files.keys()) collect(key)
    for (const key of this.dirs) collect(key)

    if (!exists) throw enoent(path)
    return [...names]
  }

  async rename(from: string, to: string): Promise<void> {
    const src = normalize(from)
    const dst = normalize(to)
    const bytes = this.files.get(src)
    if (bytes === undefined) throw enoent(from)
    this.files.set(dst, bytes)
    this.files.delete(src)
  }

  async rm(path: string, opts?: { force?: boolean; recursive?: boolean }): Promise<void> {
    const target = normalize(path)

    if (opts?.recursive) {
      const prefix = target === '/' ? '/' : `${target}/`
      let removed = false
      for (const key of [...this.files.keys()]) {
        if (key === target || key.startsWith(prefix)) {
          this.files.delete(key)
          removed = true
        }
      }
      for (const key of [...this.dirs]) {
        if (key === target || key.startsWith(prefix)) {
          this.dirs.delete(key)
          removed = true
        }
      }
      // Node's `rm` without `force` throws on a truly-missing path.
      if (!removed && !opts.force) throw enoent(path)
      return
    }

    if (this.files.delete(target)) return
    if (this.dirs.delete(target)) return
    if (opts?.force) return
    throw enoent(path)
  }

  async stat(path: string): Promise<{ size: number; mtimeMs: number; isDirectory: boolean }> {
    const target = normalize(path)
    if (this.dirs.has(target)) {
      return { size: 0, mtimeMs: Date.now(), isDirectory: true }
    }
    const bytes = this.files.get(target)
    if (bytes !== undefined) {
      return { size: bytes.byteLength, mtimeMs: Date.now(), isDirectory: false }
    }
    throw enoent(path)
  }
}
