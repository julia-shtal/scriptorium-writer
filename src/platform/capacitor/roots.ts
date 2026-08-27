/**
 * The three Android storage roots, resolved once at boot into plain absolute paths.
 * (`getUri()` hands back a `file://` URI; `fileUriToPath` below strips the scheme — see
 * its comment for why that matters to every path the data layer builds.)
 *
 * Library lives in Documents so it is visible in the file manager and reachable over USB —
 * the entire point of the Capacitor block. Userdata lives in app-private storage because
 * settings.json holds `libraryPath`, so settings must be findable WITHOUT knowing
 * libraryPath; and because Directory.Data needs no runtime permission, so a denied Documents
 * permission still boots into a comprehensible error instead of a dead screen.
 *
 * CROSS-REFERENCE: android/app/src/main/res/xml/file_paths.xml must expose EXPORTS_DIRECTORY
 * for the Share sheet, and its element type (<external-path> vs <files-path>) is coupled to
 * the Directory chosen here. Change one, change the other — a mismatch breaks sharing at
 * runtime when the user taps the button, not at build time. MC3 revisits these constants.
 */
import { Directory, Filesystem } from '@capacitor/filesystem'
import { CODE_DIR_EXISTS, codeOf } from './error-codes'

export const LIBRARY_DIRECTORY = Directory.Documents
export const LIBRARY_FOLDER = 'Scriptorium-Writer'

export const USERDATA_DIRECTORY = Directory.Data
export const USERDATA_FOLDER = 'userdata'

/** Sibling of the library, never inside it: readLibraryEntries walks the library root
 *  recursively, so an exports folder within it would make every zip swallow the last. */
export const EXPORTS_DIRECTORY = Directory.Documents
export const EXPORTS_FOLDER = 'Scriptorium-Writer-exports'

export interface CapacitorRoots {
  library: string
  userdata: string
  exports: string
}

/**
 * Strip a `file://` scheme from `getUri()`'s result, returning a plain absolute POSIX path.
 *
 * WHY: `getUri()` on Android returns e.g. `file:///storage/emulated/0/Documents/Scriptorium-Writer`.
 * That string becomes a root that `joinPath` (src/data/path-utils.ts) later composes every
 * data-layer path onto. `joinPath` splits every segment on `/[\\/]+/` and only re-adds a
 * single leading `/` when the FIRST segment starts with a separator — it has no concept of a
 * URI scheme. So `joinPath('file:///storage/...', 'stories', 'x.json')` collapses the `//`
 * after `file:` into one `/` AND still only prepends one leading `/`, yielding the mangled
 * `file:/storage/.../stories/x.json` — wrong on the wire to the plugin. Stripping the scheme
 * here, once, at the root, keeps every path built on top of it a plain absolute path shaped
 * like `NodeFsPort`'s (which the shared contract cases assume) and keeps `joinPath` itself
 * scheme-agnostic, matching src/data/ being out of scope for this milestone.
 *
 * If `uri` has no `file://` prefix, it is assumed to already be a plain path and is returned
 * unchanged (defensive: some platforms/mocks may already resolve to a plain path).
 *
 * CAVEAT — decision point for the on-device spike: this assumes the Capacitor filesystem
 * plugin accepts a scheme-less absolute path for its own `path` argument (mirroring how
 * `NodeFsPort` and the contract suite treat paths). The spike (`__fsPortContract()`) is what
 * actually confirms that. If it turns out the plugin REQUIRES the `file://` scheme, the fix is
 * to keep the scheme through the roots and have `CapacitorFsPort` re-attach it at ITS boundary
 * (mirroring how `NodeFsPort.toNative` converts separators at its boundary) — NOT to teach
 * `joinPath` about URI schemes, since `src/data/` must stay platform-neutral.
 */
export function fileUriToPath(uri: string): string {
  const prefix = 'file://'
  if (!uri.startsWith(prefix)) {
    // Not a file:// URI. A bare plain path (e.g. '/a/b') must still pass through silently —
    // that's the defensive case the comment above documents. But a DIFFERENT scheme (e.g. a
    // content:// URI, which this plugin does hand back in some configurations) would then
    // silently become a "root" that joinPath mangles exactly the way the header above warns
    // about, just with a different prefix than file:. This is a diagnostic, not a guard: we
    // still return it unchanged (there is no safe rewrite to fall back to here), but the spike
    // needs to know if this ever fires.
    if (uri.includes('://')) {
      console.warn(`[roots] fileUriToPath: non-file:// scheme passed through unchanged: ${uri}`)
    }
    return uri
  }
  const encoded = uri.slice(prefix.length)
  try {
    return decodeURIComponent(encoded)
  } catch {
    // Malformed percent-encoding: fall back to the undecoded path rather than failing boot.
    return encoded
  }
}

/** Resolve one directory+folder pair to an absolute path, creating it if absent. */
async function resolveRoot(directory: Directory, path: string): Promise<string> {
  try {
    await Filesystem.mkdir({ directory, path, recursive: true })
  } catch (err) {
    // Already exists (OS-PLUG-FILE-0010) is the common, expected case and not an error here.
    // Everything else — in particular 0007 permission denied, but also e.g. 0006 invalid path
    // or 0013 operation failed — MUST propagate. Swallowing it (as this used to do) lets boot
    // continue to the getUri() call below, which on Android does NOT go through
    // runWithPermission the way stat() does, so it can return a URI for a directory that was
    // never actually created. That phantom path then resurfaces much later, and far from its
    // real cause, as an unexplained ENOENT inside FileService — exactly the "dead screen
    // instead of a comprehensible error" this file's header promises not to produce.
    if (codeOf(err) !== CODE_DIR_EXISTS) throw err
  }
  const { uri } = await Filesystem.getUri({ directory, path })
  return fileUriToPath(uri)
}

export async function resolveCapacitorRoots(): Promise<CapacitorRoots> {
  return {
    library: await resolveRoot(LIBRARY_DIRECTORY, LIBRARY_FOLDER),
    userdata: await resolveRoot(USERDATA_DIRECTORY, USERDATA_FOLDER),
    exports: await resolveRoot(EXPORTS_DIRECTORY, EXPORTS_FOLDER)
  }
}
