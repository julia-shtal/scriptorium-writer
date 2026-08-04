// Web renderer entry: boots the web Platform (in-memory storage, MP3) then renders the
// shared App. Electron entry is main.electron.tsx.
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
import { createWebPlatform } from '../platform/web'

const container = document.getElementById('root')
if (!container) {
  throw new Error('Root container #root not found')
}

createWebPlatform()
  .then((platform) => {
    setPlatform(platform)
    createRoot(container).render(
      <React.StrictMode>
        <App />
      </React.StrictMode>
    )
  })
  .catch((err) => {
    // The web entry's one unique risk is async boot failure; never leave a blank page
    // (MP3 acceptance: "must not be blank or throw on boot"). Plain DOM so the failure
    // path needs no React.
    console.error('Web platform failed to boot', err)
    container.textContent = 'Failed to start. Please reload the page.'
  })
