// Plain-Vite config for the MP3 web build target — a second build of the same React
// renderer, running in a browser instead of Electron.
//
// Entry/html split: the Electron target owns src/renderer/index.html (→ main.electron.tsx,
// window.api injected by preload); the web target uses src/renderer/index.web.html
// (→ main.web.tsx, which boots createWebPlatform() before rendering). Keeping two html
// files (rather than branching on a runtime isElectron check) makes each platform's
// composition root a distinct entry, so nothing platform-specific leaks across.
//
// This mirrors the `renderer` section of electron.vite.config.ts but is plain Vite, not
// electron-vite: no externalizeDepsPlugin (the browser bundle must include its deps) and
// no injectProdCsp (that policy is file://-specific — a web CSP lands in MP7).
import { resolve } from 'path'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

// The Electron target owns src/renderer/index.html (→ main.electron.tsx); the web
// target uses index.web.html (→ main.web.tsx). In dev, route '/' to the web html so
// the app is reachable at the root URL (needed for LAN/tablet testing).
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

export default defineConfig({
  root: 'src/renderer',
  base: './', // works from a subpath and, later, Capacitor's file://-like origin
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
  plugins: [react(), serveWebIndex()]
  // TODO(MP7): web CSP — omitted; electron's injectProdCsp() is file://-specific.
})
