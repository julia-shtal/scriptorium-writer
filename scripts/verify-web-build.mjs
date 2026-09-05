// scripts/verify-web-build.mjs
// Release gate for the web/PWA bundle (M29): run `npm run build:web`, then `npm run verify:web`
// to check that what landed in dist-web/ is actually installable. Every failure this catches is
// one that a green build still ships — a missing HTML entry point, a manifest that lost its
// icons, a service worker precaching a chunk that cannot run — because Vite's exit code only
// says "the bundle was emitted", never "the bundle works".
// Node built-ins only, no build tooling imported: the point is to read the artifact as a user's
// browser would find it, not to re-derive it from the config that produced it.
//
// Usage: `npm run verify:web`, or `node scripts/verify-web-build.mjs <dir>` to check a bundle
// somewhere other than ./dist-web.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const DIST = resolve(process.argv[2] ?? join(HERE, '..', 'dist-web'))

// Budgets, not measurements. Today the bundle is ~3.15 MB total with a ~1.56 MB largest asset,
// so the headroom here is deliberate: these are not meant to track growth line by line, they are
// meant to fire when something changes *structurally* — a dependency pulled into the shell, a
// chunk that stopped splitting, an unminified build slipping out. Move them only with a reason.
const MAX_TOTAL_BYTES = 3.5e6
const MAX_ASSET_BYTES = 1.8e6

// The install prompt and the Android app list show manifest strings before the user has chosen
// a language, so they are English (M29). Same rule as src/renderer/pwa/manifest.test.ts, asserted
// here on the built artifact — the source is not what installs.
const CYRILLIC = /[а-яА-ЯёЁ]/
const REQUIRED_MANIFEST_KEYS = [
  'name',
  'short_name',
  'description',
  'start_url',
  'scope',
  'display',
  'theme_color',
  'background_color',
  'icons'
]

const failures = []
const fail = (msg) => failures.push(msg)

/** Human-readable byte counts, so the printed margins are readable at a glance. Decimal MB,
 *  matching the units the budgets above are written in. */
const kb = (n) => `${(n / 1024).toFixed(1)} KiB`
const mb = (n) => `${(n / 1e6).toFixed(2)} MB`

/** Every file under `dir`, as { path (relative, '/'-separated), bytes }. */
function walk(dir, base = dir) {
  const out = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...walk(full, base))
    else out.push({ path: relative(base, full).split('\\').join('/'), bytes: statSync(full).size })
  }
  return out
}

if (!existsSync(DIST)) {
  console.error(`verify-web-build: ${DIST} does not exist. Run \`npm run build:web\` first.`)
  process.exit(1)
}

const files = walk(DIST)
const has = (p) => files.some((f) => f.path === p)

// --- 1. the HTML entry point -------------------------------------------------------------
// The source entry is index.web.html; `renameIndexHtml` in vite.web.config.ts renames the built
// asset to index.html because Capacitor's webDir hard-requires that name. If that plugin ever
// stops running, the build still succeeds and ships a bundle with no entry point at all.
if (!has('index.html')) {
  fail('index.html is missing — the renameIndexHtml plugin did not run; this bundle has no entry point.')
}
if (has('index.web.html')) {
  fail('index.web.html is present — the built entry was not renamed to index.html, so `cap sync` will refuse it.')
}

// --- 2/3/4. the web app manifest ---------------------------------------------------------
let manifest = null
if (!has('manifest.webmanifest')) {
  fail('manifest.webmanifest is missing — nothing to install from.')
} else {
  try {
    manifest = JSON.parse(readFileSync(join(DIST, 'manifest.webmanifest'), 'utf8'))
  } catch (err) {
    fail(`manifest.webmanifest is not valid JSON: ${err.message}`)
  }
}

if (manifest) {
  for (const key of REQUIRED_MANIFEST_KEYS) {
    if (!(key in manifest)) fail(`manifest.webmanifest is missing the "${key}" field.`)
  }
  if (manifest.lang !== 'en') {
    fail(`manifest lang is ${JSON.stringify(manifest.lang)}, expected "en" — see M29.`)
  }
  if (typeof manifest.description === 'string' && CYRILLIC.test(manifest.description)) {
    fail(`manifest description contains Cyrillic: ${JSON.stringify(manifest.description)}`)
  }
  // An icon entry pointing at a file that was not emitted is an install dialog with a blank
  // square, and neither the build nor the manifest schema notices.
  for (const icon of Array.isArray(manifest.icons) ? manifest.icons : []) {
    const src = String(icon.src ?? '').replace(/^\.?\//, '')
    if (!src) fail('an icons[] entry has no src.')
    else if (!has(src)) fail(`icons[] references ${src}, which is not in the bundle.`)
  }
}

// --- 5/6. the service worker's precache list ----------------------------------------------
// sw.js is minified Workbox output: the precache manifest is an inline array of {url, revision}
// objects. There is no stable module to import and no JSON sidecar to read, so the URLs are
// pulled out by regex over `url:"..."`. That is coarse but exact enough for a membership test —
// it can only over-report (a stray literal), never miss a real precache entry.
let precached = []
if (!has('sw.js')) {
  fail('sw.js is missing — the PWA plugin emitted no service worker, so the app is not offline-capable.')
} else {
  const sw = readFileSync(join(DIST, 'sw.js'), 'utf8')
  precached = [...sw.matchAll(/url:"([^"]+)"/g)].map((m) => m[1].replace(/^\.?\//, ''))
  const mustPrecache = ['index.html', 'manifest.webmanifest', ...(manifest?.icons ?? []).map((i) => String(i.src ?? '').replace(/^\.?\//, ''))]
  for (const url of mustPrecache) {
    if (url && !precached.includes(url)) fail(`sw.js does not precache ${url} — it will not be available offline.`)
  }
  // The archiver chunk (see globIgnores in vite.web.config.ts) is unreachable on web; precaching
  // it made every install download 645 KB of code that cannot execute.
  const dead = precached.filter((u) => /library-archive-.*\.js$/.test(u))
  if (dead.length) {
    fail(`sw.js precaches the unreachable archiver chunk: ${dead.join(', ')} — check globIgnores.`)
  }
}

// --- 7. no dev service worker leaked into the release bundle -------------------------------
// vite-plugin-pwa's devOptions write a dev-dist/ service worker; if one ends up inside dist-web
// it can register over the real one and serve a stale or broken shell.
for (const f of files) {
  if (f.path === 'dev-dist' || f.path.startsWith('dev-dist/') || f.path.includes('/dev-dist/')) {
    fail(`dev-dist/ leaked into the bundle (${f.path}) — a dev service worker must not ship.`)
    break
  }
}

// --- 8. size budgets -----------------------------------------------------------------------
const totalBytes = files.reduce((sum, f) => sum + f.bytes, 0)
const largest = files.reduce((max, f) => (f.bytes > max.bytes ? f : max), { path: '(none)', bytes: 0 })
if (totalBytes > MAX_TOTAL_BYTES) {
  fail(`dist-web is ${mb(totalBytes)}, over the ${mb(MAX_TOTAL_BYTES)} budget.`)
}
if (largest.bytes > MAX_ASSET_BYTES) {
  fail(`largest asset ${largest.path} is ${mb(largest.bytes)}, over the ${mb(MAX_ASSET_BYTES)} per-asset budget.`)
}

// --- report --------------------------------------------------------------------------------
if (failures.length) {
  // Report everything found, not just the first thing: one build-and-check round trip should
  // tell you the whole story.
  console.error(`verify-web-build: ${failures.length} problem(s) in ${DIST}\n`)
  for (const f of failures) console.error(`  FAIL  ${f}`)
  console.error('')
  process.exit(1)
}

// A budget that only ever prints "OK" is a budget nobody sees coming: print the margins.
console.log(`verify-web-build: OK — ${DIST}`)
console.log(`  files            ${files.length}`)
console.log(
  `  total size       ${mb(totalBytes)} of ${mb(MAX_TOTAL_BYTES)} budget ` +
    `(${mb(MAX_TOTAL_BYTES - totalBytes)} / ${((1 - totalBytes / MAX_TOTAL_BYTES) * 100).toFixed(1)}% headroom)`
)
console.log(
  `  largest asset    ${largest.path} — ${mb(largest.bytes)} of ${mb(MAX_ASSET_BYTES)} budget ` +
    `(${mb(MAX_ASSET_BYTES - largest.bytes)} / ${((1 - largest.bytes / MAX_ASSET_BYTES) * 100).toFixed(1)}% headroom)`
)
console.log(`  precached        ${precached.length} entries (${kb(precached.reduce((s, u) => s + (files.find((f) => f.path === u)?.bytes ?? 0), 0))})`)
console.log(`  manifest         lang=${manifest?.lang}, ${manifest?.icons?.length ?? 0} icons, no Cyrillic`)
