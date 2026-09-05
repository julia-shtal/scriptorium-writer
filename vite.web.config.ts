// Plain-Vite config for the MP3 web build target — a second build of the same React
// renderer, running in a browser instead of Electron. PWA shell added in MP7, Capacitor
// (Android) wrapper added in MC1.
//
// Entry/html split: the Electron target owns src/renderer/index.html (→ main.electron.tsx,
// window.api injected by preload); the web target uses src/renderer/index.web.html
// (→ main.web.tsx, which boots createWebPlatform() before rendering). Keeping two html
// files (rather than branching on a runtime isElectron check) makes each platform's
// composition root a distinct entry, so nothing platform-specific leaks across. The source
// split stays exactly this way — only the built *output* filename changes (see
// `renameIndexHtml` below): Capacitor's webDir hard-requires an `index.html`, so the
// production build emits dist-web/index.html even though the source file is still
// index.web.html.
//
// This mirrors the `renderer` section of electron.vite.config.ts but is plain Vite, not
// electron-vite: no externalizeDepsPlugin (the browser bundle must include its deps).
import { resolve } from 'path'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import mkcert from 'vite-plugin-mkcert'
import { manifest } from './src/renderer/pwa/manifest'
import { WEB_CSP } from './src/renderer/pwa/csp'

// The Electron target owns src/renderer/index.html (→ main.electron.tsx); the web
// target uses index.web.html (→ main.web.tsx). In dev, route '/' to the web html so
// the app is reachable at the root URL (needed for LAN/tablet testing). Dev-only and
// unaffected by `renameIndexHtml` below, which only touches the production bundle.
function serveWebIndex(): Plugin {
  return {
    name: 'scriptorium-writer:serve-web-index',
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        if (req.url === '/' || req.url === '/index.html') req.url = '/index.web.html'
        next()
      })
    }
  }
}

// Capacitor's webDir (MC1) hard-requires the entry HTML to be literally `index.html` —
// `cap sync` refuses to run otherwise. The source split stays as-is (see file header); this
// only renames the built asset. Done in `generateBundle`, which runs before Rollup writes
// the bundle to disk and before vite-plugin-pwa's own `closeBundle` step globs dist-web to
// build the precache manifest — a post-build `fs.rename` would run too late and leave
// sw.js precaching the stale `index.web.html` name. Throws if the expected asset is
// missing rather than silently emitting nothing, since a silent miss here ships a build
// with no HTML entry point at all.
function renameIndexHtml(): Plugin {
  return {
    name: 'scriptorium-writer:rename-index-html',
    // Vite's own core HTML-emitting plugin runs in the "Vite build plugins" group, which
    // sits after user plugins with no `enforce` — without `enforce: 'post'` here, this
    // hook would run before that core plugin has emitted index.web.html into the bundle
    // at all, and the rename would find nothing.
    enforce: 'post',
    generateBundle(_options, bundle) {
      const entry = bundle['index.web.html']
      if (!entry) {
        throw new Error(
          'scriptorium-writer:rename-index-html: expected dist-web/index.web.html in the ' +
            'build output to rename to index.html for Capacitor, but it was not found.'
        )
      }
      if (bundle['index.html']) {
        throw new Error(
          'scriptorium-writer:rename-index-html: an index.html already exists in the build ' +
            'output alongside index.web.html; refusing to silently overwrite it and ship the ' +
            'wrong HTML entry.'
        )
      }
      entry.fileName = 'index.html'
      delete bundle['index.web.html']
      bundle['index.html'] = entry
    }
  }
}

// Inject the web CSP meta into index.web.html for production builds only. Dev is skipped
// (like the Electron target) because Vite serves an inline react-refresh preamble that a
// strict `script-src 'self'` would block, leaving a blank dev page.
function injectWebCsp(): Plugin {
  return {
    name: 'scriptorium-writer:inject-web-csp',
    transformIndexHtml(html, ctx): string {
      if (ctx.server) return html // dev only has ctx.server
      return html.replace(
        '</head>',
        `  <meta http-equiv="Content-Security-Policy" content="${WEB_CSP}" />\n  </head>`
      )
    }
  }
}

export default defineConfig({
  root: 'src/renderer',
  base: './', // relative asset URLs — works from a subpath, and from Capacitor's https://localhost WebView origin (MC1)
  resolve: {
    alias: {
      '@shared': resolve('src/shared'),
      '@renderer': resolve('src/renderer'),
      '@data': resolve('src/data')
    }
  },
  build: {
    outDir: resolve('dist-web'),
    emptyOutDir: true,
    rollupOptions: {
      input: resolve('src/renderer/index.web.html'),
      // The data layer's `exportLibraryArchive` reaches into src/main/library-archive
      // (Node `archiver` + `node:fs`) via a dynamic import(). On web that path is never
      // executed — the web Platform maps `exportLibrary` to an UNSUPPORTED error — but
      // Rollup still resolves the split-off chunk at build time. Mark Node built-ins as
      // external so that dead chunk resolves instead of failing on `node:fs`. Nothing in
      // the app's live web code path imports a Node built-in. (MP4/MP6 hoist zip behind a
      // port, removing this coupling.)
      external: [/^node:/, 'fs', 'path', 'os', 'crypto', 'stream', 'zlib', 'events', 'util']
    }
  },
  plugins: [
    react(),
    serveWebIndex(),
    injectWebCsp(),
    renameIndexHtml(),
    mkcert(), // dev HTTPS so the tablet can register a service worker + persist OPFS
    VitePWA({
      registerType: 'prompt', // never reload mid-sentence; the user chooses when
      injectRegister: null, // we register manually in main.web.tsx via virtual:pwa-register
      manifest,
      includeAssets: ['icons/*.png'],
      workbox: {
        // Precache the whole shell. The app makes ZERO network requests after load
        // (all storage is OPFS), so there is intentionally NO runtimeCaching — do not
        // add a network-first strategy for requests that never happen.
        globPatterns: ['**/*.{js,css,html,woff2,png,svg,ico,webmanifest}'],
        // library-archive is `archiver`, reached only by the dynamic import at
        // file-service.ts:654. The web Platform answers exportLibrary with UNSUPPORTED
        // before that line runs, so the chunk is unreachable — but the glob above would
        // still precache 645 KB of it into every install. MP6 removes the chunk at the
        // source by hoisting zip behind a port; until then, keep it out of the precache.
        globIgnores: ['**/library-archive-*.js']
      },
      // Serve an installable PWA straight from `dev:web` (over mkcert HTTPS) so the tablet
      // can install without a separate preview server.
      devOptions: { enabled: true, type: 'module' }
    })
  ]
})
