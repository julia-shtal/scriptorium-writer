/**
 * Native export (MC2 Task 6) — node-only coverage over `FakeFilesystem`.
 *
 * The invariant under test is the one that keeps backups usable: the exports folder is a
 * SIBLING of the library root, never a child of it. `FileService.readLibraryEntries` walks
 * the library root recursively, so an exports folder inside it would make every library zip
 * contain all previous zips — each backup twice the size of the last, and the newest archive
 * carrying stale copies of the whole library. The roots are built here from the same
 * `LIBRARY_FOLDER` / `EXPORTS_FOLDER` constants `roots.ts` resolves on device, so nesting them
 * there fails this test rather than shipping.
 *
 * Also covers `writeAndShare`'s contract: the file lands on disk and is size-verified BEFORE
 * the Share sheet is offered, the URI handed to the sheet names THAT file, and a failing
 * Share sheet is non-fatal (the bytes are already safe). `@capacitor/share` is mocked because
 * there is no device here; `@capacitor/filesystem` is mocked with the same fake
 * `fs-port.test.ts` uses.
 *
 * ROOTS COME FROM `roots.ts`, NOT FROM HAND-BUILT LITERALS. `writeAndShare` resolves the share
 * URI through `Filesystem.getUri({ directory: EXPORTS_DIRECTORY, ... })`, which the fake maps
 * to its own synthetic per-`Directory` root. A test that composed `exportsRoot` from a literal
 * base would silently disagree with that mapping — the fake's `getUri` does no existence check,
 * so nothing would notice — and the URI assertions below would prove nothing. Calling
 * `resolveCapacitorRoots()` makes the test's base and the plugin's mapping agree by
 * construction, exactly as they do on device.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { unzipSync } from 'fflate'
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
import { joinPath } from '@data/path-utils'
import { FileService } from '@data/file-service'
import { zipLibrary } from '../web'
import { FakeFilesystem } from './fake-filesystem'
import { CapacitorFsPort } from './fs-port'
import { fileUriToPath, resolveCapacitorRoots } from './roots'
import { createNativeExportApi, exportStamp, writeAndShare } from './native-export'
import { createCapacitorPlatform } from './index'

// See fs-port.test.ts: the factory runs once per module import, so it must close over the
// binding rather than capture one instance.
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

const share = vi.fn(async (_opts: unknown): Promise<unknown> => ({}))
vi.mock('@capacitor/share', () => ({ Share: { share: (opts: unknown) => share(opts) } }))

interface Seeded {
  fs: CapacitorFsPort
  service: FileService
  libraryRoot: string
  exportsRoot: string
}

/** `resolveCapacitorRoots` hands back DIRECTORY paths, and both the device and the fake return
 *  directory URIs with a trailing slash (see fake-filesystem.ts's `getUri` notes). Every path
 *  built on top of a root goes through `joinPath`, which drops that slash — so the roots are
 *  normalised here the same way, keeping the bases this test compares against identical to the
 *  paths `writeAndShare` actually produces. */
function trimSlash(path: string): string {
  return path.replace(/\/+$/, '')
}

/** A library with one story file in it, plus the exports folder beside it — rooted exactly
 *  where `roots.ts` puts them, so the fake's `Directory` mapping and this test agree. */
async function seed(): Promise<Seeded> {
  const resolved = await resolveCapacitorRoots()
  const roots = {
    library: trimSlash(resolved.library),
    userdata: trimSlash(resolved.userdata),
    exports: trimSlash(resolved.exports)
  }
  const fs = new CapacitorFsPort()
  const service = new FileService({
    fs,
    userDataPath: roots.userdata,
    defaultLibraryPath: roots.library
  })
  await service.ensureLibrary()
  await fs.writeFile(joinPath(roots.library, 'stories', 'a', 'story.json'), '{}')
  return { fs, service, libraryRoot: roots.library, exportsRoot: roots.exports }
}

beforeEach(() => {
  activeFake = new FakeFilesystem()
  share.mockReset()
  share.mockResolvedValue({})
})

describe('native export', () => {
  it('keeps the exports folder outside the library root', async () => {
    // The structural half of the invariant: if EXPORTS_FOLDER ever moves under
    // LIBRARY_FOLDER, this fails immediately and names the reason, rather than surfacing as
    // the mysteriously-growing archive the round-trip test below catches.
    const { libraryRoot, exportsRoot } = await seed()
    expect(exportsRoot.startsWith(`${libraryRoot}/`)).toBe(false)
  })

  it('a second library export does not contain the first', async () => {
    const { fs, service, exportsRoot } = await seed()

    const first = await writeAndShare(
      fs,
      exportsRoot,
      `library-${exportStamp(new Date(2026, 7, 24, 14, 32))}.zip`,
      await zipLibrary(service)
    )
    const second = await writeAndShare(
      fs,
      exportsRoot,
      `library-${exportStamp(new Date(2026, 7, 24, 14, 33))}.zip`,
      await zipLibrary(service)
    )

    expect(first.path).not.toBe(second.path)
    expect(await fs.readdir(exportsRoot)).toHaveLength(2)

    const entries = Object.keys(unzipSync(await fs.readFileBytes(second.path)))
    expect(entries.some((name) => name.endsWith('.zip'))).toBe(false)
    expect(entries).toContain('stories/a/story.json')
  })

  it('stamps minute precision so two exports on the same day cannot collide', () => {
    expect(exportStamp(new Date(2026, 7, 24, 14, 32))).toBe('2026-08-24-1432')
    expect(exportStamp(new Date(2026, 7, 24, 14, 33))).toBe('2026-08-24-1433')
    expect(exportStamp(new Date(2026, 0, 3, 9, 5))).toBe('2026-01-03-0905')
  })

  it('writes and verifies the file before the Share sheet is offered, and shares THAT file', async () => {
    const { fs, exportsRoot } = await seed()
    const bytes = new Uint8Array([1, 2, 3, 4])
    let onDiskWhenShared = -1
    share.mockImplementation(async () => {
      onDiskWhenShared = (await fs.stat(joinPath(exportsRoot, 'chapter.md'))).size
      return {}
    })
    // `writeAndShare` cross-checks the share URI against the path it wrote and console.errors
    // on a mismatch (it cannot throw — the file is already safe). Spying lets this test assert
    // the mismatch branch was NOT taken, which is the half a re-stat inside the share mock
    // cannot see.
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})

    const result = await writeAndShare(fs, exportsRoot, 'chapter.md', bytes)

    expect(result).toEqual({ canceled: false, path: joinPath(exportsRoot, 'chapter.md') })
    // The Share sheet saw the complete file, i.e. the write happened first.
    expect(onDiskWhenShared).toBe(bytes.byteLength)
    expect(share).toHaveBeenCalledTimes(1)
    // ...and it was handed a URI naming that same file, not a different or nonexistent path.
    // Without this, a divergence between `exportsRoot` and the module's EXPORTS_* constants
    // would sail through: the write and the stat both target the right file, and the share of
    // the wrong one only lands in a console.warn nobody reads on a tablet.
    const shared = share.mock.calls[0]?.[0] as { url: string; title: string } | undefined
    expect(fileUriToPath(shared?.url ?? '')).toBe(result.path)
    expect(shared?.title).toBe('chapter.md')
    expect(error).not.toHaveBeenCalled()
    error.mockRestore()
  })

  it('reports success even when the Share sheet fails — the bytes are already on disk', async () => {
    const { fs, exportsRoot } = await seed()
    share.mockRejectedValue(new Error('Share API not available'))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const result = await writeAndShare(fs, exportsRoot, 'chapter.md', new Uint8Array([9, 9]))

    expect(result.canceled).toBe(false)
    expect(await fs.readFileBytes(result.path)).toEqual(new Uint8Array([9, 9]))
    warn.mockRestore()
  })

  it('throws EXPORT_FAILED rather than reporting success when the write is short', async () => {
    const { fs, exportsRoot } = await seed()
    // Simulate a truncated/partial write: stat reports fewer bytes than were handed over.
    const stat = vi
      .spyOn(CapacitorFsPort.prototype, 'stat')
      .mockResolvedValue({ size: 1, mtimeMs: 0, isDirectory: false })

    await expect(
      writeAndShare(fs, exportsRoot, 'chapter.md', new Uint8Array([1, 2, 3, 4]))
    ).rejects.toMatchObject({ code: 'EXPORT_FAILED' })
    // Nothing may be reported to the user, and no Share sheet may appear, on a short write.
    expect(share).not.toHaveBeenCalled()
    stat.mockRestore()
  })

  it('writes all three export kinds into the exports folder under minute-stamped names', async () => {
    const { fs, service, exportsRoot } = await seed()
    // `now` is injected so the stamp is pinned: without it these filenames would depend on
    // the wall clock and could not be asserted. (This is the only caller of that parameter —
    // it exists for exactly this.)
    const api = createNativeExportApi(fs, service, exportsRoot, () => new Date(2026, 7, 24, 14, 32))
    const story = await service.createStory({ title: 'My Story' })
    const chapter = await service.createChapter(story.id, 'Chapter One')

    const library = await api.exportLibrary()
    const chapterFile = await api.exportChapter(story.id, chapter.id, 'md')
    const storyFile = await api.exportStory(story.id, 'md')

    expect(library).toEqual({
      canceled: false,
      path: joinPath(exportsRoot, 'library-2026-08-24-1432.zip')
    })
    expect(chapterFile).toEqual({
      canceled: false,
      path: joinPath(exportsRoot, 'Chapter One-2026-08-24-1432.md')
    })
    expect(storyFile).toEqual({
      canceled: false,
      path: joinPath(exportsRoot, 'My Story-2026-08-24-1432.md')
    })
    // All three are real files on disk, not just returned paths.
    for (const r of [library, chapterFile, storyFile]) {
      if (r.canceled) throw new Error('native export must never report canceled')
      expect((await fs.stat(r.path)).size).toBeGreaterThan(0)
    }
  })

  it('the composed Capacitor api uses the NATIVE export methods, not the web ones', async () => {
    // THE SPREAD-ORDER GUARD. `createCapacitorPlatform` builds `{ ...api, ...native }`; if
    // those are ever swapped, Android silently falls back to the web `blob:` download that an
    // Android WebView drops on the floor while still resolving successfully — the exact bug
    // MC2 Task 6 exists to fix, and otherwise nothing detects it. The web implementation
    // returns a bare filename and writes nothing to the filesystem, so an absolute path inside
    // the exports root that actually stats is proof the native one won.
    const exportsRoot = trimSlash((await resolveCapacitorRoots()).exports)

    const platform = await createCapacitorPlatform()
    const story = await platform.api.createStory({ title: 'Guard' })
    const chapter = await platform.api.createChapter(story.id, 'Ch')
    const result = await platform.api.exportChapter(story.id, chapter.id, 'md')

    if (result.canceled) throw new Error('native export must never report canceled')
    expect(result.path.startsWith(`${exportsRoot}/`)).toBe(true)
    expect((await new CapacitorFsPort().stat(result.path)).isDirectory).toBe(false)
    expect(platform.capabilities?.exportsToDeviceFolder).toBe(true)
  })
})
