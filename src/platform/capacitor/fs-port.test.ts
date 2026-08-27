/**
 * CapacitorFsPort contract test (MC2) — runs the shared {@link runFsPortContract} suite
 * against `CapacitorFsPort` with `@capacitor/filesystem` replaced by `FakeFilesystem`
 * (fake-filesystem.ts), which mirrors behaviour observed on a real Android device on
 * 2026-08-25. See that file's header for the observed facts it encodes.
 *
 * Also covers the ENOENT whitelist (`fs-port.ts`'s `translate()`/`isMissing()`): 0007
 * (permission denied) must propagate unchanged, never mapped to ENOENT. The device spike
 * never exercised 0007 (it needs a denied Documents permission — MC3's scope), so this test
 * is the ONLY guard on that property today.
 *
 * Triage note: a red `FsPort contract: CapacitorFsPort (faked plugin) > <case name>` is
 * ambiguous on its own — it could mean `CapacitorFsPort` regressed, or it could mean
 * `FakeFilesystem` (fake-filesystem.ts) drifted from what it claims to model. The intended way
 * to tell them apart is to compare against the identically-named case in NodeFsPort's contract
 * run: if that one is still green, the fault is most likely in this file's fake, not the port.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { runFsPortContract } from '@data/fs-port.contract'
import type {
  DeleteFileOptions,
  GetUriOptions,
  MkdirOptions,
  ReaddirOptions,
  ReadFileOptions,
  RenameOptions,
  RmdirOptions,
  StatOptions,
  WriteFileOptions
} from '@capacitor/filesystem'
import { FakeFilesystem } from './fake-filesystem'
import { CapacitorFsPort } from './fs-port'

// Reassigned in `beforeEach` below (fresh per test, so the 10 contract cases and the 2
// whitelist tests never see each other's files/dirs). The `vi.mock` factory closes over
// this binding rather than capturing one instance, since the factory itself only runs once
// per module import — the plugin methods it returns must keep reading whichever instance is
// "current" at call time.
let activeFake: FakeFilesystem

vi.mock('@capacitor/filesystem', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@capacitor/filesystem')>()
  return {
    ...actual,
    Filesystem: {
      mkdir: (opts: MkdirOptions) => activeFake.mkdir(opts),
      readFile: (opts: ReadFileOptions) => activeFake.readFile(opts),
      writeFile: (opts: WriteFileOptions) => activeFake.writeFile(opts),
      readdir: (opts: ReaddirOptions) => activeFake.readdir(opts),
      rename: (opts: RenameOptions) => activeFake.rename(opts),
      deleteFile: (opts: DeleteFileOptions) => activeFake.deleteFile(opts),
      rmdir: (opts: RmdirOptions) => activeFake.rmdir(opts),
      stat: (opts: StatOptions) => activeFake.stat(opts),
      getUri: (opts: GetUriOptions) => activeFake.getUri(opts)
    }
  }
})

beforeEach(() => {
  activeFake = new FakeFilesystem()
})

runFsPortContract('CapacitorFsPort (faked plugin)', async () => {
  const fs = new CapacitorFsPort()
  const dir = `/fake/scratch-${crypto.randomUUID()}`
  await fs.mkdir(dir, { recursive: true })
  return { fs, dir }
})

describe('CapacitorFsPort error whitelist', () => {
  it('propagates OS-PLUG-FILE-0007 (permission denied) instead of mapping it to ENOENT', async () => {
    const fake = activeFake
    const fs = new CapacitorFsPort()
    fake.denied.add('/fake/denied.json')

    await expect(fs.readFile('/fake/denied.json')).rejects.toMatchObject({
      code: 'OS-PLUG-FILE-0007'
    })
    await expect(fs.readFile('/fake/denied.json')).rejects.not.toMatchObject({ code: 'ENOENT' })
  })

  it('still maps OS-PLUG-FILE-0008 to ENOENT', async () => {
    const fs = new CapacitorFsPort()
    await expect(fs.readFile('/fake/absent.json')).rejects.toMatchObject({ code: 'ENOENT' })
  })
})

describe('CapacitorFsPort mkdir on an existing directory (device-observed, Node-divergent)', () => {
  it('repeat mkdir on the same existing directory resolves rather than throwing', async () => {
    // Guards CapacitorFsPort.mkdir's swallow of OS-PLUG-FILE-0010 (fs-port.ts). The shared
    // FsPort contract suite CANNOT cover this: every one of its cases — including "creates
    // nested directories with recursive mkdir" — only ever mkdirs a fresh path once. This test
    // is the only place in this codebase that mkdirs the SAME path twice through the port,
    // which is the only way to reach the device-observed, Node-divergent behaviour (real
    // Node's `{ recursive: true }` is silently idempotent; the plugin instead throws 0010 on a
    // repeat mkdir — see fake-filesystem.ts's header). Removing the swallow in fs-port.ts
    // makes this test fail; it was verified to do so (and the file was restored afterwards)
    // during the fix that added this test.
    const fs = new CapacitorFsPort()
    const dir = `/fake/scratch-${crypto.randomUUID()}`
    await fs.mkdir(dir, { recursive: true })
    await expect(fs.mkdir(dir, { recursive: true })).resolves.toBeUndefined()
  })
})
