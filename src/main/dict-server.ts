/**
 * Loopback HTTP server for Chromium's offline hunspell dictionary requests.
 *
 * Chromium requests spellcheck dictionaries by a version-suffixed filename,
 * e.g. `ru-3-0.bdic` or `en-US-10-1.bdic`. The numeric version segments are
 * baked into the Chromium build and change across Electron/Chromium releases
 * without notice. If we served dictionaries keyed on the exact filename,
 * every Electron upgrade could silently 404 spellcheck for our bundled
 * languages. Instead we match on the LANGUAGE PREFIX of the request path
 * (the part before the version segments) and ignore the version suffix
 * entirely, so a Chromium version bump can never break dictionary lookup.
 *
 * This module is intentionally Electron-free — only Node built-ins — so it
 * can be unit-tested under Vitest's `node` environment even though it only
 * ever runs inside the Electron main process.
 */

import { createServer, type Server } from 'node:http'
import { createReadStream, existsSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Resolves a requested `.bdic` path (e.g. `/ru-3-0.bdic`) to one of the
 * `availableLangs` by longest-prefix match, ignoring the trailing version
 * suffix Chromium appends. Returns null if the path isn't a `.bdic` request
 * or doesn't match any available language.
 *
 * Longest-prefix-first matching is required so that, given both `en` and
 * `en-US` are available, a request for `en-US-1-0.bdic` resolves to the
 * more specific `en-US` rather than the shorter `en` prefix.
 */
export function resolveDictionaryLanguage(
  requestPath: string,
  availableLangs: readonly string[]
): string | null {
  const name = requestPath.replace(/^\/+/, '')
  if (!name.endsWith('.bdic')) return null
  const byLength = [...availableLangs].sort((a, b) => b.length - a.length)
  for (const lang of byLength) {
    if (name === `${lang}.bdic` || name.startsWith(`${lang}-`)) return lang
  }
  return null
}

export interface DictionaryServer {
  url: string
  close: () => Promise<void>
}

/**
 * Starts the loopback dictionary server, bound explicitly to 127.0.0.1 on an
 * OS-assigned port (never 0.0.0.0 — this must not be reachable off-box).
 * Serves `<dictionariesDir>/<lang>.bdic` for any request whose path resolves
 * to one of `availableLangs` via {@link resolveDictionaryLanguage}; 404s
 * otherwise, including when the resolved language's file is missing on disk.
 */
export function startDictionaryServer(
  dictionariesDir: string,
  availableLangs: readonly string[]
): Promise<DictionaryServer> {
  const server: Server = createServer((req, res) => {
    const lang = req.url ? resolveDictionaryLanguage(req.url, availableLangs) : null
    if (!lang) {
      res.statusCode = 404
      res.end()
      return
    }
    const file = join(dictionariesDir, `${lang}.bdic`)
    if (!existsSync(file)) {
      res.statusCode = 404
      res.end()
      return
    }
    res.statusCode = 200
    res.setHeader('Content-Type', 'application/octet-stream')
    const stream = createReadStream(file)
    stream.on('error', (err) => {
      // Two timing windows:
      //   • pre-flush  (rare)  — headers not yet written; we can still put a
      //     clean 500 on the response.
      //   • post-flush (common) — headers already flushed via `pipe`'s first
      //     write. Mutating `res.statusCode` here is a no-op and may throw
      //     `ERR_HTTP_HEADERS_SENT` up out of this async handler; either outcome
      //     is wrong. Destroy the socket and log; the client sees a reset, which
      //     is the truthful answer ("transfer didn't complete").
      console.error('[dict-server] failed to read', file, err)
      if (res.headersSent) {
        // `destroy()` clears the pipe's binding to `res` internally, so an
        // explicit `stream.unpipe(res)` here would just duplicate work.
        res.destroy()
      } else {
        res.statusCode = 500
        res.end()
      }
    })
    stream.pipe(res)
  })

  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address()
      if (addr === null || typeof addr === 'string') {
        reject(new Error('dictionary server: unexpected address'))
        return
      }
      resolve({
        url: `http://127.0.0.1:${addr.port}/`,
        close: () => new Promise<void>((res, rej) => server.close((err) => (err ? rej(err) : res())))
      })
    })
  })
}
