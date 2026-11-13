// scripts/release/smoke.mjs
// Step publish.smoke: after everything is public, look at it the way a client does.
//   - The PWA: GitHub Pages takes a minute or two to serve a new gh-pages commit, so
//     version.json is polled (every 15 s, up to 5 min) until it reads X.Y.Z.
//   - Windows auto-update: electron-updater fetches latest.yml from the release's download URL
//     and then downloads `path:` from the same release; a name that does not match the uploaded
//     installer is a 404 on every installed client. Checked once the URL answers.
// Both URLs get a cache-busting query and `cache: no-store`, so no proxy or CDN copy of the
// previous version can pass for this one.
//
// The network, the sleep and the clock come from ctx (ctx.fetch, ctx.sleep, ctx.now), so the
// tests poll a fake Pages without waiting or touching the network.
import { PWA_URL, exeName, parseLatestYml } from './artifacts.mjs'
import { ReleaseError } from './errors.mjs'
import { latestYmlUrl } from './publish.mjs'
import { RESUME_CMD } from './resume.mjs'

export const POLL_INTERVAL_MS = 15_000
export const POLL_TIMEOUT_MS = 5 * 60_000

const bust = (url, ctx) => `${url}?t=${ctx.now().getTime()}`

/**
 * Calls `probe()` every POLL_INTERVAL_MS until it returns { ok: true, value } or the timeout
 * passes. A probe returns { ok: false, seen } for "not yet" (`seen` describes what it saw, for
 * the timeout message) and throws a ReleaseError for "wrong, and waiting will not fix it".
 * Network errors count as "not yet": Pages and the release CDN are both allowed a slow minute.
 */
export async function pollUntil(ctx, probe, { what, manual }) {
  const start = ctx.now().getTime()
  let attempts = 0
  let seen = 'no answer yet'
  for (;;) {
    attempts++
    try {
      const r = await probe()
      if (r.ok) return { ...r.value, attempts }
      seen = r.seen
    } catch (err) {
      if (err instanceof ReleaseError) throw err
      seen = `request failed: ${err instanceof Error ? err.message : String(err)}`
    }
    if (ctx.now().getTime() - start + POLL_INTERVAL_MS > POLL_TIMEOUT_MS) {
      const minutes = Math.round(POLL_TIMEOUT_MS / 60_000)
      throw new ReleaseError(
        `${what} still did not check out after ${minutes} min and ${attempts} tries (last: ${seen}) — check it by hand (\`${manual}\`); once it does, \`${RESUME_CMD}\` re-runs this check.`
      )
    }
    await ctx.sleep(POLL_INTERVAL_MS)
  }
}

/** One request may hang for at most this long; an aborted one counts as "not yet", like any
 *  other network error. AbortSignal.timeout's timer is unref'd, so it never holds the process. */
export const FETCH_TIMEOUT_MS = 20_000

async function fetchText(ctx, url) {
  const res = await ctx.fetch(bust(url, ctx), { cache: 'no-store', redirect: 'follow', signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
  return { status: res.status, ok: res.ok, text: res.ok ? await res.text() : '' }
}

/** Step publish.smoke. */
export async function smokeTest(ctx) {
  const versionUrl = `${PWA_URL}version.json`
  const pwa = await pollUntil(
    ctx,
    async () => {
      const res = await fetchText(ctx, versionUrl)
      if (!res.ok) return { ok: false, seen: `HTTP ${res.status}` }
      let version
      try {
        version = JSON.parse(res.text).version
      } catch {
        return { ok: false, seen: 'not JSON' }
      }
      return version === ctx.version ? { ok: true, value: { version } } : { ok: false, seen: `version ${JSON.stringify(version ?? null)}` }
    },
    { what: `the PWA at ${versionUrl} (expected version ${ctx.version})`, manual: `curl -s ${versionUrl}` }
  )
  ctx.log(`  ${versionUrl} reads ${pwa.version} (after ${pwa.attempts} tr${pwa.attempts === 1 ? 'y' : 'ies'})`)

  const ymlUrl = latestYmlUrl(ctx.version)
  const exe = exeName(ctx.version)
  const yml = await pollUntil(
    ctx,
    async () => {
      const res = await fetchText(ctx, ymlUrl)
      if (!res.ok) return { ok: false, seen: `HTTP ${res.status}` }
      const doc = parseLatestYml(res.text)
      if (doc.path !== exe || doc.version !== ctx.version) {
        throw new ReleaseError(
          `the published latest.yml says version ${JSON.stringify(doc.version ?? null)}, path ${JSON.stringify(doc.path ?? null)} — expected ${ctx.version} and ${exe}; installed Windows clients cannot update. Fix the release assets on GitHub (\`curl -sL ${ymlUrl}\`), then \`${RESUME_CMD}\`.`
        )
      }
      return { ok: true, value: { path: doc.path } }
    },
    { what: ymlUrl, manual: `curl -sL ${ymlUrl}` }
  )
  ctx.log(`  latest.yml on the release points at ${yml.path}`)
  return { pwaVersion: pwa.version, pwaAttempts: pwa.attempts, latestYmlPath: yml.path }
}
