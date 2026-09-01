import { useEffect, useRef, useState } from 'react'
import { IconFolderShare } from '@tabler/icons-react'
import { getPlatform, setPlatform, type Platform } from '@renderer/platform'
import { useT } from '@renderer/i18n/useT'

/**
 * The MC3 storage-permission gate: a full-screen, blocking rationale screen shown on
 * Android instead of the app whenever `Platform.storageAccess` reports MANAGE_EXTERNAL_STORAGE
 * ("All files access") withheld. It renders on no other platform — `storageAccess` is absent
 * on desktop and web, where storage is always reachable.
 *
 * There is deliberately no "continue anyway". Without the permission the app is exactly as
 * blind as MC2 measured on the target tablet: an unreadable library and an empty one are the
 * same empty `listStories()`, and acting on that ambiguity is how three demo stories ended up
 * written over the test library. So the app does not boot the library at all until the answer
 * is a definite yes — nothing is scanned, opened, seeded, or written behind this screen.
 *
 * Note this screen always speaks Russian in practice: `useT` falls back to `ru` until settings
 * load, and settings load inside the boot the gate is holding back. Russian is the app's
 * primary voice, so that is the right trade against reading a file to render a permission
 * prompt.
 */
export function StorageAccessGate({
  access,
  onGranted
}: {
  access: NonNullable<Platform['storageAccess']>
  onGranted: () => void
}): JSX.Element {
  const t = useT()
  // 'idle' → the button; 'opening' → the system screen is being launched; 'manual' → that
  // launch rejected (no such screen on this OEM build) and only written instructions are left.
  const [phase, setPhase] = useState<'idle' | 'opening' | 'manual'>('idle')

  // Through a ref so the listener effect below depends only on `access` (a stable object off
  // the platform). The caller passes an inline arrow, and re-registering window listeners on
  // every render would be pure churn.
  const grantedRef = useRef(onGranted)
  grantedRef.current = onGranted

  // The re-check loop. Which event fires when the user returns from a system Settings screen
  // is OEM-dependent — some builds deliver `visibilitychange` only, some `focus` only — so
  // listen for both and de-duplicate with `checking`, rather than betting on one.
  useEffect(() => {
    let checking = false
    let cancelled = false

    const recheck = (): void => {
      if (checking || cancelled) return
      checking = true
      void (async () => {
        try {
          const granted = await access.recheck()
          if (cancelled) return
          if (granted) {
            // Publish the new state before releasing the gate. `storageAccess.granted` is a
            // snapshot taken at platform construction, and the belt-and-braces guard in
            // `bootstrapLibrary` reads it: leaving it stale-false here would let the app boot
            // while that guard still refused to seed, so a genuine first run after granting
            // would land on an empty library instead of the demo story.
            const platform = getPlatform()
            setPlatform({ ...platform, storageAccess: { ...access, granted: true } })
            grantedRef.current()
          } else {
            // Back in the app, still no access — she cancelled, or the intent bounced straight
            // back without showing anything. Re-arm the button: leaving it stuck on the
            // disabled «Открываем настройки…» would be a dead end with no way out but a
            // restart, which is the same failure as a button that does nothing.
            setPhase((p) => (p === 'opening' ? 'idle' : p))
          }
        } catch (err) {
          // `recheck` is not supposed to reject (the TS bridge absorbs every failure into
          // `false`), but a rejection here must not become an unhandled one — and it is not
          // evidence of access either way, so stay gated and wait for the next event.
          console.warn('[storage-gate] re-check failed; staying gated', err)
        } finally {
          checking = false
        }
      })()
    }

    const onVisible = (): void => {
      if (document.visibilityState === 'visible') recheck()
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', recheck)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', recheck)
    }
  }, [access])

  const request = async (): Promise<void> => {
    setPhase('opening')
    try {
      await access.request()
      // Resolved: the system screen is up. Stay in 'opening' — the re-check listeners above
      // take over when the user comes back, whatever she decided there.
    } catch (err) {
      // The one outcome the ticket forbids is a button that does nothing. The Java side
      // rejects only when neither the per-app nor the global all-files screen resolves on
      // this device, so from here the manual route is all there is.
      console.warn('[storage-gate] no system all-files-access screen; showing manual route', err)
      setPhase('manual')
    }
  }

  return (
    <div className="storage-gate">
      {/* No role="dialog": this is not layered over anything — nothing has booted behind it. */}
      <div className="storage-gate-card">
        <h1 className="storage-gate-title">
          <IconFolderShare size={22} /> {t.storageAccess.title}
        </h1>
        <p className="storage-gate-body">{t.storageAccess.why}</p>
        <p className="storage-gate-body">{t.storageAccess.untouched}</p>
        {phase === 'manual' ? (
          // role="alert": this replaces the button, so its appearance is the whole message.
          <p className="storage-gate-manual" role="alert">
            {t.storageAccess.manual}
          </p>
        ) : (
          <div className="storage-gate-actions">
            <button
              className="storage-gate-btn"
              disabled={phase === 'opening'}
              onClick={() => void request()}
            >
              {phase === 'opening' ? t.storageAccess.opening : t.storageAccess.grant}
            </button>
          </div>
        )}
        <p className="storage-gate-hint">{t.storageAccess.recheckHint}</p>
      </div>
    </div>
  )
}
