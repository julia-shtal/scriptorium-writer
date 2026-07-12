import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { resolveDictionaryLanguage, startDictionaryServer, type DictionaryServer } from './dict-server'

const LANGS = ['ru', 'en-US']

describe('resolveDictionaryLanguage', () => {
  it('maps a version-suffixed ru request to the ru language', () => {
    expect(resolveDictionaryLanguage('/ru-3-0.bdic', LANGS)).toBe('ru')
  })
  it('maps a version-suffixed en-US request to en-US', () => {
    expect(resolveDictionaryLanguage('/en-US-10-1.bdic', LANGS)).toBe('en-US')
  })
  it('is robust to arbitrary future version suffixes', () => {
    expect(resolveDictionaryLanguage('/ru-99-42.bdic', LANGS)).toBe('ru')
  })
  it('prefers the longest matching language prefix', () => {
    expect(resolveDictionaryLanguage('/en-US-1-0.bdic', ['en', 'en-US'])).toBe('en-US')
  })
  it('returns null for a non-.bdic request', () => {
    expect(resolveDictionaryLanguage('/favicon.ico', LANGS)).toBeNull()
  })
  it('returns null for an unknown language prefix', () => {
    expect(resolveDictionaryLanguage('/de-1-0.bdic', LANGS)).toBeNull()
  })
})

describe('startDictionaryServer', () => {
  let dir: string
  let server: DictionaryServer

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'm4-dict-'))
    writeFileSync(join(dir, 'ru.bdic'), Buffer.from('FAKE-RU-BDIC'))
    writeFileSync(join(dir, 'en-US.bdic'), Buffer.from('FAKE-EN-BDIC'))
  })
  afterEach(async () => {
    await server?.close()
    rmSync(dir, { recursive: true, force: true })
  })

  it('binds to 127.0.0.1 and serves a matched dictionary as octet-stream', async () => {
    server = await startDictionaryServer(dir, ['ru', 'en-US'])
    expect(server.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/$/)
    const res = await fetch(`${server.url}ru-3-0.bdic`)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('application/octet-stream')
    expect(await res.text()).toBe('FAKE-RU-BDIC')
  })
  it('404s an unknown language', async () => {
    server = await startDictionaryServer(dir, ['ru', 'en-US'])
    const res = await fetch(`${server.url}de-1-0.bdic`)
    expect(res.status).toBe(404)
  })
  it('404s a matched language whose file is missing on disk', async () => {
    rmSync(join(dir, 'ru.bdic'))
    server = await startDictionaryServer(dir, ['ru', 'en-US'])
    const res = await fetch(`${server.url}ru-3-0.bdic`)
    expect(res.status).toBe(404)
  })
})
