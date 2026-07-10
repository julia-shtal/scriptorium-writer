import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import type { Plugin } from 'vite'

/**
 * Injects the renderer Content-Security-Policy meta tag into `index.html` for
 * production builds only. Dev is skipped on purpose: Vite serves an inline
 * react-refresh preamble that a strict `script-src 'self'` would block, which
 * would leave the dev window blank. In production the renderer loads only local
 * files, so a strict policy is both safe and desirable.
 */
function injectProdCsp(): Plugin {
  const csp = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'"
  ].join('; ')

  return {
    name: 'scriptorium-writer:inject-prod-csp',
    transformIndexHtml(html, ctx): string {
      // ctx.server is defined only during `dev`; skip injection there.
      if (ctx.server) return html
      return html.replace(
        '</head>',
        `  <meta http-equiv="Content-Security-Policy" content="${csp}" />\n  </head>`
      )
    }
  }
}

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@shared': resolve('src/shared')
      }
    },
    build: {
      rollupOptions: {
        input: {
          index: resolve('src/main/index.ts')
        }
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@shared': resolve('src/shared')
      }
    },
    build: {
      rollupOptions: {
        input: {
          index: resolve('src/preload/index.ts')
        }
      }
    }
  },
  renderer: {
    root: 'src/renderer',
    resolve: {
      alias: {
        '@shared': resolve('src/shared'),
        '@renderer': resolve('src/renderer')
      }
    },
    build: {
      rollupOptions: {
        input: {
          index: resolve('src/renderer/index.html')
        }
      }
    },
    plugins: [react(), injectProdCsp()]
  }
})
