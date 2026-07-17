import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import * as fsp from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import AdmZip from 'adm-zip'
import { zipDirectory } from './library-archive'

let workDir: string
let srcDir: string
let destPath: string

beforeEach(async () => {
  workDir = await fsp.mkdtemp(join(tmpdir(), 'lib-archive-'))
  srcDir = join(workDir, 'library')
  destPath = join(workDir, 'out.zip')
  await fsp.mkdir(join(srcDir, 'stories', 's1', 'chapters'), { recursive: true })
  await fsp.mkdir(join(srcDir, 'stories', 's1', 'versions', 'c1'), { recursive: true })
  await fsp.mkdir(join(srcDir, '.trash', 's0-deleted'), { recursive: true })
  await fsp.writeFile(join(srcDir, 'stories', 's1', 'chapters', '01-intro.json'), '{"canon":true}')
  await fsp.writeFile(join(srcDir, 'stories', 's1', 'chapters', '01-intro.md'), '# Intro\n')
  await fsp.writeFile(join(srcDir, 'stories', 's1', 'versions', 'c1', '2026.json'), '{"v":1}')
  await fsp.writeFile(join(srcDir, '.trash', 's0-deleted', 'meta.json'), '{"gone":true}')
})

afterEach(async () => {
  await fsp.rm(workDir, { recursive: true, force: true })
})

describe('zipDirectory', () => {
  it('reproduces the on-disk layout byte-for-byte, including .trash/', async () => {
    await zipDirectory(srcDir, destPath)
    expect(existsSync(destPath)).toBe(true)

    const zip = new AdmZip(destPath)
    const byName = new Map(zip.getEntries().map((e) => [e.entryName.replace(/\\/g, '/'), e]))

    const expectPaths = [
      'stories/s1/chapters/01-intro.json',
      'stories/s1/chapters/01-intro.md',
      'stories/s1/versions/c1/2026.json',
      '.trash/s0-deleted/meta.json'
    ]
    for (const p of expectPaths) {
      const entry = byName.get(p)
      expect(entry, `missing entry ${p}`).toBeTruthy()
      const onDisk = await fsp.readFile(join(srcDir, p))
      expect(entry!.getData().equals(onDisk)).toBe(true)
    }
  })

  it('leaves no .part temp file behind on success', async () => {
    await zipDirectory(srcDir, destPath)
    expect(existsSync(destPath + '.part')).toBe(false)
  })
})
