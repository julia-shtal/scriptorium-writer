// Shared by scripts/gen-icon.mjs and scripts/gen-readme-art.mjs.
// Keep in sync with src/renderer/theme/book.css; palette.test.ts enforces it.
export const PARCHMENT = '#efe2c4' // warm page
export const PAGE = '#fbf4e4'      // cream pages
export const ACCENT = '#8a5a2b'    // accent line
export const FRAME = '#3a2a1d'     // --book-frame: dark leather
export const GOLD = '#a8874e'      // --accent
export const EMBER = '#9e3b2e'     // --danger
export const INK_NAV = '#6b573c'   // --ink-nav: the muted ink the sidebar uses

// gen-icon.mjs has always used this value for ink; book.css --ink is #4a3a2a.
// The two differ by a hair and the icon is already shipped, so they stay separate.
export const ICON_INK = '#4a3322'

export const rgba = (hex) => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
  0xff,
]
