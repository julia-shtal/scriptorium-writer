/**
 * MemoryFsPort contract test (MP3). Runs the shared {@link runFsPortContract}
 * suite against the in-memory web scaffolding port. Each `new MemoryFsPort()` is
 * a fresh, isolated store, so no cleanup is needed; the scratch dir is created up
 * front so the contract's `stat(dir)` sees a real directory.
 *
 * MP4 replaces the port under test with the OPFS-backed implementation.
 */
import { runFsPortContract } from '@data/fs-port.contract'
import { MemoryFsPort } from './memory-fs-port'

runFsPortContract('MemoryFsPort', async () => {
  const fs = new MemoryFsPort()
  const dir = '/scratch'
  await fs.mkdir(dir, { recursive: true })
  return { fs, dir }
})
