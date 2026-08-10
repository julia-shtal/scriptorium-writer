import { describe, it, expect } from 'vitest'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { manifest, THEME_COLOR } from './manifest'

describe('PWA manifest', () => {
  it('declares the standalone, RU, framed shell', () => {
    expect(manifest.name).toBe('Scriptorium Writer')
    expect(manifest.short_name).toBe('Scriptorium')
    expect(manifest.display).toBe('standalone')
    expect(manifest.lang).toBe('ru')
    expect(manifest.dir).toBe('ltr')
    expect(manifest.start_url).toBe('.')
    expect(manifest.scope).toBe('.')
    expect('orientation' in manifest).toBe(false)
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
