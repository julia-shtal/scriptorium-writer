import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

/**
 * Two Vitest projects share one alias set:
 *
 * - `node`   — the pure data-layer suite (FileService, atomic writes, path
 *   helpers, the in-memory FsPort). Runs against real temp directories in a
 *   Node environment. No Electron, no jsdom. This is the default suite
 *   (`npm test`) and must never require a browser. It also carries the
 *   static-file assertions that guard the `scripts/` generators (the shared
 *   art palette, the committed README art) — those tests live next to what
 *   they guard, under `scripts/`, so the include list spans both trees.
 *
 * - `browser` — exists so the OPFS-backed `FsPort` (MP4) can be exercised
 *   against the *real* browser Origin Private File System API. There is no
 *   faithful Node/OPFS shim, so these tests run in headless Chromium via the
 *   Vitest browser mode + Playwright provider. Opt-in only
 *   (`npm run test:browser`); files are named `*.browser.test.ts`.
 */

const alias = {
  '@shared': resolve('src/shared'),
  '@renderer': resolve('src/renderer'),
  '@data': resolve('src/data')
}

export default defineConfig({
  resolve: { alias },
  test: {
    projects: [
      {
        resolve: { alias },
        test: {
          name: 'node',
          environment: 'node',
          include: ['src/**/*.test.ts', 'scripts/**/*.test.ts'],
          exclude: ['**/*.browser.test.ts', '**/node_modules/**'],
          globals: false
        }
      },
      {
        resolve: { alias },
        test: {
          name: 'browser',
          include: ['src/**/*.browser.test.ts'],
          globals: false,
          browser: {
            enabled: true,
            provider: 'playwright',
            headless: true,
            instances: [{ browser: 'chromium' }]
          }
        }
      }
    ]
  }
})
