/**
 * Single source of truth for the `OS-PLUG-FILE-####` codes the Capacitor filesystem plugin
 * throws (≥7.1.0, asserted by plugin-version.test.ts), plus the tiny `codeOf` helper for
 * reading one off an unknown rejection.
 *
 * Shared by `fs-port.ts` (error translation: which codes become ENOENT) and `roots.ts`
 * (boot-time mkdir: which codes are safe to swallow). Both call sites care about the SAME
 * whitelist for the SAME reason — see below — so it lives once.
 *
 * CRITICAL, carried over from fs-port.ts: 0007 (permission denied) must NEVER be treated as
 * "not found" / swallowed. Doing so turns a library the app merely cannot READ into one that
 * looks ABSENT, and FileService would then take the recovery path over intact data — the
 * worst possible outcome for an app whose priority #1 is reliability of the user's data. This
 * is precisely the bug Fix 1 (roots.ts resolveRoot) exists to close: the old code swallowed
 * every mkdir error, including 0007, so a denied Documents permission still produced a
 * phantom `library` path that getUri() happily resolved (getUri does not go through
 * runWithPermission on the plugin's Android side) and boot proceeded as if all were well.
 */

export const CODE_NOT_FOUND = 'OS-PLUG-FILE-0008'
export const CODE_MISSING_PARENT = 'OS-PLUG-FILE-0011'
export const CODE_DIR_EXISTS = 'OS-PLUG-FILE-0010'

export function codeOf(err: unknown): string | undefined {
  return (err as { code?: string } | null)?.code
}
