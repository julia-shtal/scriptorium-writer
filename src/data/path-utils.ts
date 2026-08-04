/**
 * Portable path and random helpers for the platform-neutral data layer (MP2).
 *
 * The data layer must not import `node:path` or `node:crypto` — those are Node
 * built-ins. All three target platforms (Electron/Node, browser/OPFS,
 * Android/Capacitor) reason about paths with forward slashes internally; only a
 * platform adapter (e.g. `NodeFsPort`) translates to the OS-native separator at
 * its own boundary. The join/dirname/basename helpers below therefore normalise
 * to `/` and never touch `\`.
 */

/**
 * Join path segments with a single forward slash, collapsing any duplicate or
 * back-slash separators the inputs may carry. Mirrors the subset of `path.join`
 * the data layer uses; it does not resolve `.`/`..` because the data layer never
 * constructs relative-traversal paths.
 */
export function joinPath(...segments: string[]): string {
  const parts: string[] = []
  for (const segment of segments) {
    // Split on both separators so a caller passing a Windows-style root still
    // normalises to forward slashes.
    for (const piece of segment.split(/[\\/]+/)) {
      if (piece !== '') parts.push(piece)
    }
  }
  // Preserve a leading separator (absolute POSIX path) or a drive-letter root.
  const first = segments[0] ?? ''
  const leading = /^[\\/]/.test(first) ? '/' : ''
  return leading + parts.join('/')
}

/**
 * The directory portion of `path` (everything before the last separator),
 * normalised to forward slashes. Matches `path.dirname` for the paths the data
 * layer builds; returns `'.'` when there is no separator.
 */
export function dirnamePath(path: string): string {
  const normalized = path.replace(/\\/g, '/')
  const idx = normalized.lastIndexOf('/')
  if (idx === -1) return '.'
  if (idx === 0) return '/'
  return normalized.slice(0, idx)
}

/**
 * The final component of `path` (the file or directory name), normalised to
 * forward slashes. Matches `path.basename` (no suffix stripping) for data-layer
 * paths.
 */
export function basenamePath(path: string): string {
  const normalized = path.replace(/\\/g, '/').replace(/\/+$/, '')
  const idx = normalized.lastIndexOf('/')
  return idx === -1 ? normalized : normalized.slice(idx + 1)
}

/**
 * `bytes` cryptographically-random bytes as a lowercase hex string. Replaces the
 * two `node:crypto` `randomBytes(n).toString('hex')` call sites (chapter ids and
 * atomic-write temp suffixes) with one portable implementation over
 * `crypto.getRandomValues`, available in Node 22 and every browser. Hex
 * conversion lives here once — never duplicated at the call sites.
 */
export function randomHex(bytes: number): string {
  const buf = new Uint8Array(bytes)
  crypto.getRandomValues(buf)
  let hex = ''
  for (const b of buf) hex += b.toString(16).padStart(2, '0')
  return hex
}
