/**
 * Native (Android) export — MC2 Task 6.
 *
 * WHY THIS FILE EXISTS: the Android app ships the same bundle as the PWA, and the web
 * export path builds a `blob:` URL and clicks an `<a download>`. An Android WebView with no
 * `DownloadListener` DROPS that download silently while the call still resolves — so
 * `runLibraryBackup` would stamp `lastLibraryBackupAt` having written nothing at all. A
 * false success about someone's only backup is the exact failure this project's priority #1
 * exists to prevent, so on native the three export methods are replaced wholesale by the
 * functions below, which write real files to real device storage.
 *
 * ORDER IS THE CONTRACT: write → verify → share. `Share.share()` resolving proves only that
 * the user tapped a target app; Android never reports back whether the receiver saved
 * anything. So success — and therefore the backup timestamp — rests on our own `stat` of the
 * file we just wrote, never on the sheet.
 *
 * Exports land in `EXPORTS_FOLDER`, a SIBLING of the library root and never a child of it
 * (see roots.ts, and the guard in native-export.test.ts): `readLibraryEntries` walks the
 * library recursively, so an exports folder inside it makes every archive swallow the last.
 *
 * WebView code: this module must never import a `node:` built-in.
 */
import { Filesystem } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'
import type { Api, ExportFileResult, ExportLibraryResult } from '@shared/types'
import { AppError } from '@shared/errors'
import type { FsPort } from '@data/fs-port'
import type { FileService } from '@data/file-service'
import { joinPath } from '@data/path-utils'
import { buildChapterExportBytes, buildStoryExportBytes } from '@data/export-format'
import { safeName, zipLibrary } from '../web'
import { EXPORTS_DIRECTORY, EXPORTS_FOLDER, fileUriToPath } from './roots'

/** `YYYY-MM-DD-HHMM`, local time. Minute precision is what stops two exports on the same day
 *  overwriting each other — on native there is no browser "(1)" de-duplication, and a write
 *  that failed partway would destroy a previously valid backup. Injectable `now` so the test
 *  can pin it. */
export function exportStamp(now: Date): string {
  const pad = (n: number): string => String(n).padStart(2, '0')
  return (
    `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}` +
    `-${pad(now.getHours())}${pad(now.getMinutes())}`
  )
}

export async function writeAndShare(
  fs: FsPort,
  exportsRoot: string,
  filename: string,
  bytes: Uint8Array
): Promise<{ canceled: false; path: string }> {
  const path = joinPath(exportsRoot, filename)
  await fs.writeFile(path, bytes)

  // Verify the write before anything reports success. A resolved Share.share() proves only
  // that the user tapped a target app — Android never confirms the receiver saved anything —
  // so the backup timestamp must rest on this stat, not on the sheet.
  const info = await fs.stat(path)
  if (info.size !== bytes.byteLength) {
    throw new AppError(
      'EXPORT_FAILED',
      `Export wrote ${info.size} of ${bytes.byteLength} bytes to ${path}`
    )
  }

  try {
    // `GetUriOptions.directory` is REQUIRED by the plugin's types (unlike every other
    // options type, where it is optional and `CapacitorFsPort` omits it), so the URI is
    // resolved in the Directory-relative form `roots.ts` uses — which is also the form that
    // resolved `exportsRoot` in the first place, so the two name the same file. Building
    // `file://${path}` by hand instead would skip the plugin's own percent-encoding of a
    // filename derived from a user-chosen chapter or story title.
    const { uri } = await Filesystem.getUri({
      directory: EXPORTS_DIRECTORY,
      path: joinPath(EXPORTS_FOLDER, filename)
    })

    // ON-DEVICE DIAGNOSTIC for a bug class that is otherwise undetectable from the outside.
    // This function has TWO sources of truth for the file location: the `exportsRoot`
    // argument (what we write and stat) and the module-scope EXPORTS_* constants (what we
    // share). They agree today only because the single caller passes `roots.exports`, which
    // was derived from those same constants — nothing in the signature or the types enforces
    // it. If they ever diverge, the write succeeds, the stat verifies the RIGHT file, and the
    // sheet is silently offered a different or nonexistent path, landing in the catch below
    // which only warns. On a tablet that is invisible. So: loud, greppable in logcat /
    // chrome://inspect, and naming BOTH paths — but non-fatal and not short-circuiting, since
    // the bytes ARE on disk and verified and a successful export must stay successful.
    // (Trailing slash is stripped because getUri marks directories with one; see
    // fake-filesystem.ts's device notes.)
    const sharePath = fileUriToPath(uri).replace(/\/+$/, '')
    if (sharePath !== path) {
      console.error(
        `[native-export] share URI does not name the file that was written: wrote "${path}", ` +
          `sharing "${sharePath}". The export itself is safe on disk; the Share sheet is not.`
      )
    }

    await Share.share({ url: uri, title: filename })
  } catch (err) {
    // Non-fatal by design. The file is already on disk and verified, so cancellation, a
    // plugin quirk, and a genuine share error need not be told apart — which is why there is
    // no "Share canceled" string matching here. That string is reported in situations that
    // are not cancellations (ionic-team/capacitor-plugins#1466).
    console.warn('Share sheet failed after a successful export; the file is on disk', err)
  }

  // `canceled: true` is unreachable on native, exactly as on web — see src/shared/types.ts.
  return { canceled: false, path }
}

/**
 * The three export methods, rebuilt for native storage. Spread over the shared web-built
 * `Api` by the Capacitor composition root so every other method keeps its shared
 * implementation.
 *
 * `service` (not `api`) is required because `exportLibrary` needs `readLibraryEntries`,
 * which the renderer-facing `Api` deliberately does not expose.
 */
export function createNativeExportApi(
  fs: FsPort,
  service: FileService,
  exportsRoot: string,
  now: () => Date = () => new Date()
): Pick<Api, 'exportLibrary' | 'exportChapter' | 'exportStory'> {
  return {
    exportLibrary: async (): Promise<ExportLibraryResult> =>
      writeAndShare(fs, exportsRoot, `library-${exportStamp(now())}.zip`, await zipLibrary(service)),

    exportChapter: async (storyId, chapterId, format): Promise<ExportFileResult> => {
      const chapter = await service.readChapter(storyId, chapterId)
      const bytes = await buildChapterExportBytes(chapter, format)
      // The stamp is not decoration here: two exports of the same chapter on one day would
      // otherwise silently overwrite each other, since native has no "(1)" de-duplication.
      return writeAndShare(
        fs,
        exportsRoot,
        `${safeName(chapter.title) || 'chapter'}-${exportStamp(now())}.${format}`,
        bytes
      )
    },

    exportStory: async (storyId, format): Promise<ExportFileResult> => {
      const story = await service.readStory(storyId)
      const chapters = await Promise.all(
        story.chapterOrder.map((id) => service.readChapter(storyId, id))
      )
      const bytes = await buildStoryExportBytes(chapters, story.chapterOrder, format)
      return writeAndShare(
        fs,
        exportsRoot,
        `${safeName(story.title) || 'story'}-${exportStamp(now())}.${format}`,
        bytes
      )
    }
  }
}
