// Electron renderer entry (window.api injected by preload). Web entry is main.web.tsx.
import React from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/pt-serif/400.css'
import '@fontsource/pt-serif/400-italic.css'
import '@fontsource/pt-serif/700.css'
import '@fontsource/pt-sans/400.css'
import '@fontsource/pt-sans/700.css'
import './theme/book.css'
import App from './app'
import { setPlatform } from './platform'

const container = document.getElementById('root')
if (!container) {
  throw new Error('Root container #root not found')
}

setPlatform({
  api: window.api,
  lifecycle: window.lifecycle,
  // Electron configures Chromium's native spellchecker with bundled dictionaries
  // (src/main/spellcheck.ts + dict-server.ts). Web cannot; see MP5.
  capabilities: { managedSpellcheck: true }
})

createRoot(container).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
