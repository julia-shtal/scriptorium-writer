/**
 * Is a persisted `settings.libraryPath` usable on Android? — MC3.
 *
 * `settings.json` is a plain file inside a library that the user is explicitly encouraged to
 * move between machines (that is what the USB round trip and `exportLibrary` are for), so a
 * value written by the desktop build — `C:\Users\...\Documents\Scriptorium-Writer` — can and
 * will arrive here. `FsPort` on Android speaks plain absolute POSIX paths only; handing it a
 * drive letter produces a path the plugin cannot resolve, and the failure surfaces far from
 * its cause as an unexplained ENOENT at first read.
 *
 * The ticket's instruction is to prefer ignoring an unusable value over failing to launch, so
 * this is a predicate, not a validator that throws: `FileService.getLibraryRoot()` falls back
 * to `defaultLibraryPath` when it returns false. Nothing rewrites the settings file — the
 * rejected path is still perfectly valid on the platform that wrote it, and clobbering it
 * would break that install the next time the library travels back.
 *
 * Deliberately shape-only. It does not ask whether the directory EXISTS: a library unpacked
 * from a PC and a library the app has not created yet are both legitimate, and a
 * filesystem-touching check would also have to be async and would make every path decision
 * depend on whether all-files access happens to be held at that moment.
 *
 * WebView code: this module must never import a `node:` built-in.
 */

/** Windows drive letter, either slash direction: `C:\...`, `c:/...`. */
const WINDOWS_DRIVE = /^[A-Za-z]:[\\/]/

/** `scheme://...` — a `file://` or `content://` URI, which is not a path FsPort can join onto
 *  (see the header of roots.ts for what joinPath does to one). A bare drive letter is matched
 *  above, so this cannot misfire on `C:\`. */
const URI_SCHEME = /^[A-Za-z][A-Za-z0-9+.-]*:\/\//

export function isNativeLibraryPathUsable(path: string): boolean {
  // Empty/whitespace: FileService already treats '' as "no override", but a whitespace-only
  // string would otherwise pass the leading-slash test below only by accident of trimming.
  if (path.trim() === '') return false

  // UNC (`\\server\share`) is caught here as well as by the backslash rule; both are named so
  // that loosening one of them does not silently allow the other.
  if (path.includes('\\')) return false

  if (WINDOWS_DRIVE.test(path)) return false
  if (URI_SCHEME.test(path)) return false

  // Everything Android can actually use is an absolute POSIX path
  // (`/storage/emulated/0/Documents/Scriptorium-Writer`). A relative path is rejected rather
  // than resolved against some implied base: there is no defensible base to pick, and guessing
  // one would point the library at a directory the user never chose.
  return path.startsWith('/')
}
