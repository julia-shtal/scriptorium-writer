/**
 * MemoryFsPort contract test (MP3). Runs the shared {@link runFsPortContract}
 * suite against the in-memory web scaffolding port. Each `new MemoryFsPort()` is
 * a fresh, isolated store, so no cleanup is needed; the scratch dir is created up
 * front so the contract's `stat(dir)` sees a real directory.
 *
 * MP4 replaces the port under test with the OPFS-backed implementation.
 */
import { describe, expect, it } from 'vitest'
import { runFsPortContract } from '@data/fs-port.contract'
import { MemoryFsPort } from './memory-fs-port'

runFsPortContract('MemoryFsPort', async () => {
  const fs = new MemoryFsPort()
  const dir = '/scratch'
  await fs.mkdir(dir, { recursive: true })
  return { fs, dir }
})

describe('MemoryFsPort directory rename guards (M31)', () => {
  async function seeded(): Promise<MemoryFsPort> {
    const fs = new MemoryFsPort()
    await fs.mkdir('/s/a/sub', { recursive: true })
    await fs.writeFile('/s/a/x.txt', 'X')
    return fs
  }

  it('same-path rename is a no-op', async () => {
    const fs = await seeded()
    await fs.rename('/s/a', '/s/a')
    expect(await fs.readFile('/s/a/x.txt')).toBe('X')
  })

  it('rejects moving a directory into itself with EINVAL', async () => {
    const fs = await seeded()
    await expect(fs.rename('/s/a', '/s/a/sub/in')).rejects.toMatchObject({ code: 'EINVAL' })
    expect(await fs.readFile('/s/a/x.txt')).toBe('X')
  })

  it('rejects renaming the root with EINVAL', async () => {
    const fs = await seeded()
    await expect(fs.rename('/', '/elsewhere')).rejects.toMatchObject({ code: 'EINVAL' })
  })

  it('rejects an existing directory target with EEXIST and leaves both intact', async () => {
    const fs = await seeded()
    await fs.mkdir('/s/b', { recursive: true })
    await fs.writeFile('/s/b/y.txt', 'Y')
    await expect(fs.rename('/s/a', '/s/b')).rejects.toMatchObject({ code: 'EEXIST' })
    expect(await fs.readFile('/s/a/x.txt')).toBe('X')
    expect(await fs.readFile('/s/b/y.txt')).toBe('Y')
  })

  it('rejects an existing FILE at the target with EEXIST', async () => {
    const fs = await seeded()
    await fs.writeFile('/s/f.txt', 'F')
    await expect(fs.rename('/s/a', '/s/f.txt')).rejects.toMatchObject({ code: 'EEXIST' })
    expect(await fs.readFile('/s/f.txt')).toBe('F')
    expect(await fs.readFile('/s/a/x.txt')).toBe('X')
  })

  it('rejects renaming a directory onto the root with EINVAL', async () => {
    const fs = await seeded()
    await expect(fs.rename('/s/a', '/')).rejects.toMatchObject({ code: 'EINVAL' })
    expect(await fs.readFile('/s/a/x.txt')).toBe('X')
  })

  it('keeps empty subdirectories when moving', async () => {
    const fs = await seeded()
    await fs.rename('/s/a', '/s/c')
    expect((await fs.stat('/s/c/sub')).isDirectory).toBe(true)
  })
})
