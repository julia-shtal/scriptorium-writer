/**
 * `scripts/palette.mjs` is a hand-kept copy of part of the book theme. The generators that
 * import it (`gen-icon.mjs`, `gen-readme-art.mjs`) are dependency-free `.mjs` run by node —
 * they cannot import the renderer's CSS or TS, so the colours are written out a second time
 * and nothing but this file connects the two.
 *
 * `src/renderer/theme/book.css` is the ORIGIN. Re-theming the app starts there (it is where
 * the palette lives and the obvious place to edit), and without these assertions such an
 * edit would leave the launcher icon and every README asset painted in the old colours with
 * the whole suite still green. So the duplication is asserted rather than trusted: book.css
 * is read off disk and each token compared to the constant that shadows it.
 *
 * These are static-file assertions, not behaviour tests. Parsing is deliberately whitespace-
 * and case-tolerant throughout: reformatting either file must never turn this suite red,
 * only a changed colour may.
 *
 * (`--book-frame` itself is asserted in src/platform/capacitor/android-theme.test.ts, which
 * owns the longer chain from book.css out to the Android launch chrome.)
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const ROOT = resolve(__dirname, '..')

const read = (rel: string): string => readFileSync(resolve(ROOT, rel), 'utf8')

/**
 * `--name: #rrggbb;` out of a CSS custom-property block -> `#rrggbb`, lowercased.
 *
 * Tolerant of the spacing CSS allows around the colon and before the semicolon, so a
 * formatter run cannot fail this; the semicolon is required so a value spanning into the
 * next declaration cannot be silently half-matched.
 */
function cssVar(css: string, name: string): string | undefined {
  const m = new RegExp(`--${name}\\s*:\\s*(#[0-9a-fA-F]+)\\s*;`).exec(css)
  return m?.[1].toLowerCase()
}

/**
 * `export const NAME = '#rrggbb'` out of palette.mjs -> `#rrggbb`, lowercased.
 *
 * Either quote character: which one the file uses is a Prettier setting, and flipping it
 * changes nothing about the colour. Spacing is free for the same reason.
 */
function paletteConst(src: string, name: string): string | undefined {
  const m = new RegExp(`export\\s+const\\s+${name}\\s*=\\s*['"](#[0-9a-fA-F]+)['"]`).exec(src)
  return m?.[1].toLowerCase()
}

describe('the shared art palette agrees with the book theme', () => {
  const palette = read('scripts/palette.mjs')
  const book = read('src/renderer/theme/book.css')

  it('FRAME is book.css --book-frame', () => {
    expect(paletteConst(palette, 'FRAME')).toBe(cssVar(book, 'book-frame'))
  })

  it('GOLD is book.css --accent', () => {
    expect(paletteConst(palette, 'GOLD')).toBe(cssVar(book, 'accent'))
  })

  it('EMBER is book.css --danger', () => {
    expect(paletteConst(palette, 'EMBER')).toBe(cssVar(book, 'danger'))
  })

  it('INK_NAV is book.css --ink-nav', () => {
    // The fill of the dark sprite variants (SPRITE_DARK in gen-readme-art.mjs). It is the
    // one tone in that palette taken from the app rather than chosen for the README, and it
    // carries the whole sprite: with the fill wrong the light outline has nothing to sit on.
    expect(paletteConst(palette, 'INK_NAV')).toBe(cssVar(book, 'ink-nav'))
  })

  it('records the known ICON_INK / --ink divergence rather than asserting they agree', () => {
    // These two are NOT equal, and that is deliberate — see the note above ICON_INK in
    // scripts/palette.mjs: gen-icon.mjs has always used #4a3322, the icon is already
    // shipped, and reconciling the pair is its own piece of work. Both sides are pinned
    // here so that "fixing" one without the other says so out loud instead of quietly
    // repainting either the shipped icon or the app.
    expect(paletteConst(palette, 'ICON_INK')).toBe('#4a3322')
    expect(cssVar(book, 'ink')).toBe('#4a3a2a')
  })
})
