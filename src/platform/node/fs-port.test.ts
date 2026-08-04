/**
 * NodeFsPort contract test (MP2). Runs the shared {@link runFsPortContract} suite
 * against the Node adapter over real temp directories. MP4/MC2 will add sibling
 * test files that run the same suite against OPFS/Capacitor ports.
 */
import * as fsp from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runFsPortContract } from '@data/fs-port.contract'
import { NodeFsPort } from './fs-port'

runFsPortContract(
  'NodeFsPort',
  async () => {
    const dir = await fsp.mkdtemp(join(tmpdir(), 'scriptorium-writer-fsport-'))
    return { fs: new NodeFsPort(), dir }
  },
  async ({ dir }) => {
    await fsp.rm(dir, { recursive: true, force: true })
  }
)
