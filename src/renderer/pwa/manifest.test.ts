import { describe, it, expect } from 'vitest'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { manifest, THEME_COLOR } from './manifest'

// A manifest cannot localise its strings, and these are what the browser install prompt and
// the Android app list show before the user has chosen anything — so they are English (M29),
// and the app's own in-app switch handles the rest. Asserted as "no Cyrillic" rather than as
// an exact string so the rule survives a later rewording.
const CYRILLIC = /[а-яА-ЯёЁ]/

describe('PWA manifest', () => {
  it('declares the standalone, EN, framed shell', () => {
    expect(manifest.name).toBe('Scriptorium Writer')
    expect(manifest.short_name).toBe('Scriptorium')
    expect(manifest.display).toBe('standalone')
    expect(manifest.lang).toBe('en')
    expect(manifest.dir).toBe('ltr')
    expect(manifest.start_url).toBe('.')
    expect(manifest.scope).toBe('.')
    expect('orientation' in manifest).toBe(false)
  })

  it('describes the app in English, the one string install dialogs show', () => {
    expect(manifest.description.length).toBeGreaterThan(0)
    expect(manifest.description).not.toMatch(CYRILLIC)
  })

  it('names the app in English too, for the launcher and the app list', () => {
    expect(manifest.name).not.toMatch(CYRILLIC)
    expect(manifest.short_name).not.toMatch(CYRILLIC)
  })

  it('uses the book-frame colour for splash + status bar', () => {
    expect(THEME_COLOR).toBe('#3a2a1d')
    expect(manifest.background_color).toBe(THEME_COLOR)
    expect(manifest.theme_color).toBe(THEME_COLOR)
  })

  it('references 192, 512, and a 512 maskable icon that all exist on disk', () => {
    const purposes = manifest.icons.map((i) => `${i.sizes} ${i.purpose ?? 'any'}`)
    expect(purposes).toContain('192x192 any')
    expect(purposes).toContain('512x512 any')
    expect(purposes).toContain('512x512 maskable')
    for (const icon of manifest.icons) {
      const path = resolve(__dirname, '../public', icon.src)
      expect(existsSync(path)).toBe(true)
    }
  })
})
