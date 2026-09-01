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
 * The last block (MC3) reaches one layer higher than the rest of this file, driving a real
 * `FileService.saveChapter` over this port to prove a failed write reaches the caller instead
 * of being swallowed. See its own comment for why it lives here and not in file-service.test.ts.
 *
 * Triage note: a red `FsPort contract: CapacitorFsPort (faked plugin) > <case name>` is
 * ambiguous on its own — it could mean `CapacitorFsPort` regressed, or it could mean
 * `FakeFilesystem` (fake-filesystem.ts) drifted from what it claims to model. The intended way
 * to tell them apart is to compare against the identically-named case in NodeFsPort's contract
 * run: if that one is still green, the fault is most likely in this file's fake, not the port.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { runFsPortContract } from '@data/fs-port.contract'
import { FileService } from '@data/file-service'
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
import type { ProseMirrorJSON } from '@shared/types'
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

/**
 * A failed save must stay visible (MC3, CLAUDE.md priority #1: a silent failed save is the
 * worst thing this app can do).
 *
 * This exercises the whole Android write path rather than one layer of it, because every layer
 * on it has a documented reason to swallow something and the question is whether they compose
 * into a leak: `CapacitorFsPort.writeFile` is the ONE method with no try/catch (its comment
 * explains why — `recursive: true` means it cannot produce the missing-parent ENOENT that
 * `translate()` exists to relabel); `atomicWriteFile` catches only around the rename, and
 * removes the orphaned temp rather than reporting success; `FileService.saveChapter` swallows a
 * failed Markdown backup by design, and must NOT extend that leniency to the JSON canon.
 *
 * It lives here rather than in file-service.test.ts because the plugin substitution is
 * file-scoped (`vi.mock('@capacitor/filesystem')` at the top of this module) and file-service's
 * suite is built on real temp directories over `NodeFsPort` — mocking the Capacitor plugin
 * across that whole file to add one case would be far more invasive than adding a FileService
 * to the file that already owns the fake.
 *
 * The leg above this one is already covered and is deliberately not duplicated:
 * editorStore.test.ts's "a failed save keeps dirty and reports error" rejects `api.saveChapter`
 * and asserts `saveStatus === 'error'` with `dirty` still true, which is what the footer
 * renders. Together the two cover plugin → port → FileService → store.
 */
describe('FileService.saveChapter over CapacitorFsPort, out of space (MC3)', () => {
  const doc = (text: string): ProseMirrorJSON => ({
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text }] }]
  })

  const makeService = async (): Promise<FileService> => {
    const svc = new FileService({
      fs: new CapacitorFsPort(),
      // Absolute POSIX paths under the fake's pre-existing '/fake' root: FakeFilesystem
      // refuses a relative path given without a `directory` (see its `resolvePath`).
      userDataPath: '/fake/userdata',
      defaultLibraryPath: '/fake/library'
    })
    await svc.ensureLibrary()
    return svc
  }

  it('propagates the plugin write failure out of saveChapter instead of swallowing it', async () => {
    const svc = await makeService()
    const story = await svc.createStory({ title: 'Roman' })
    const chapter = await svc.createChapter(story.id, 'Glava')
    await svc.saveChapter(story.id, { id: chapter.id, title: 'Glava', doc: doc('written before') })

    activeFake.outOfSpace = true

    const failed = svc.saveChapter(story.id, {
      id: chapter.id,
      title: 'Glava',
      doc: doc('written after')
    })
    // The identity of the failure matters as much as the fact of it. It must arrive with the
    // plugin's own code (0013, the documented catch-all a full volume surfaces as) — NOT
    // rewritten to ENOENT by `translate()`, which would tell FileService the chapter is
    // MISSING and put a healthy chapter on the recovery path over a merely-unwritable disk.
    await expect(failed).rejects.toMatchObject({ code: 'OS-PLUG-FILE-0013' })
    await expect(failed).rejects.not.toMatchObject({ code: 'ENOENT' })
  })

  it('leaves the previous canon intact when the write fails', async () => {
    const svc = await makeService()
    const story = await svc.createStory({ title: 'Roman' })
    const chapter = await svc.createChapter(story.id, 'Glava')
    await svc.saveChapter(story.id, { id: chapter.id, title: 'Glava', doc: doc('written before') })

    activeFake.outOfSpace = true
    await expect(
      svc.saveChapter(story.id, { id: chapter.id, title: 'Glava', doc: doc('written after') })
    ).rejects.toThrow()
    activeFake.outOfSpace = false

    // The atomic-write contract, observed from the layer that matters to the user: the failure
    // happened on the temp file, so the good canon was never touched. Losing the newest edit is
    // survivable (the store keeps it in memory and stays dirty); losing the last saved draft
    // would not be.
    const still = await svc.readChapter(story.id, chapter.id)
    expect(JSON.stringify(still.doc)).toContain('written before')
  })
})
