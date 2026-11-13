// scripts/release/artifacts.mjs
// What a release publishes, and the pure checks on it: file names, hashes, the frozen web
// bundle's digest, electron-builder's latest.yml, SHA256SUMS.txt and the release notes.
// Nothing here runs a command; the build steps (build.mjs) call these on real files, and the
// tests call them on small synthetic ones.
import { createHash } from 'node:crypto'
import { cpSync, existsSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs'
import { join, posix, relative } from 'node:path'
import { ReleaseError } from './errors.mjs'

/** The installer name electron-builder writes (artifactName in electron-builder.yml). No spaces:
 *  GitHub turns a space in an uploaded name into a dot, and latest.yml would point at nothing. */
export const exeName = (version) => `Scriptorium-Writer-Setup-${version}.exe`
export const blockmapName = (version) => `${exeName(version)}.blockmap`
/** The published APK name. On disk Gradle calls it app-release.apk. */
export const apkName = (version) => `Scriptorium-Writer-${version}.apk`
export const LATEST_YML = 'latest.yml'
export const SUMS_FILE = 'SHA256SUMS.txt'
export const NOTES_FILE = 'release-notes.md'
/** release-out/X.Y.Z/web: the frozen, verified PWA bundle — what Android syncs and Pages serves. */
export const WEB_DIR = 'web'

/**
 * The five files attached to the GitHub release, in upload order. A normal (non-pre-release)
 * release MUST carry latest.yml, the installer and its blockmap, or every installed Windows
 * client's update check fails — which is why this list is one constant both the build (which
 * produces them) and the publish stage (which uploads and re-lists them) read.
 */
export function publishAssets(version) {
  return [exeName(version), blockmapName(version), LATEST_YML, apkName(version), SUMS_FILE]
}

export const PWA_URL = 'https://julia-shtal.github.io/scriptorium-writer/'
/** The GitHub repository the releases live in. */
export const REPO_URL = 'https://github.com/julia-shtal/scriptorium-writer'
/** owner/name, for `gh release ... --repo`: gh must never guess the repository from a remote. */
export const REPO_SLUG = new URL(REPO_URL).pathname.replace(/^\/|\/$/g, '')

// ------------------------------------------------------------------------------ hashing

export const sha256Hex = (bytes) => createHash('sha256').update(bytes).digest('hex')
export const sha512Base64 = (bytes) => createHash('sha512').update(bytes).digest('base64')

/** { name, size, sha256 } of one file — what a step records in state.json for it. */
export function describeFile(file, name) {
  const bytes = readFileSync(file)
  return { name, size: bytes.length, sha256: sha256Hex(bytes) }
}

/**
 * Re-reads an artifact a step recorded ({ name, size, sha256 }) in `dir` and refuses it if it is
 * missing or changed since `step` built and verified it. `label` is how the message names the
 * file (a repo-relative path); `hint` is what to do, which depends on how far the release got
 * (before publishing: --abort and start over; after: never publish it). Returns describeFile.
 */
export function verifyRecorded(dir, recorded, { step, label = recorded.name, hint }) {
  const file = join(dir, recorded.name)
  if (!existsSync(file)) throw new ReleaseError(`${label} (from ${step}) is missing — ${hint}`)
  const now = describeFile(file, recorded.name)
  if (now.sha256 !== recorded.sha256 || now.size !== recorded.size) {
    throw new ReleaseError(`${label} changed since ${step} built and verified it — ${hint}`)
  }
  return now
}

/** Every file under `dir`, as '/'-separated relative paths, sorted (code-unit order). */
function listFiles(dir, base = dir) {
  const out = []
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, e.name)
    if (e.isDirectory()) out.push(...listFiles(full, base))
    else out.push(relative(base, full).split('\\').join('/'))
  }
  return out.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
}

/**
 * A digest of a whole directory: sha256 over every file's relative path, size and bytes, in
 * sorted path order. Two directories with the same digest hold the same files with the same
 * contents — which is the "the bundle that was verified is the bundle that is served" rule
 * turned into one comparable string. Returns { files, bytes, sha256 }.
 */
export function dirDigest(dir) {
  const hash = createHash('sha256')
  let bytes = 0
  const files = listFiles(dir)
  for (const rel of files) {
    const data = readFileSync(join(dir, ...rel.split('/')))
    bytes += data.length
    hash.update(`${rel}\0${data.length}\0`)
    hash.update(data)
  }
  return { files: files.length, bytes, sha256: hash.digest('hex') }
}

/** Replaces `to` with a copy of `from` (a directory). */
export function replaceDir(from, to) {
  rmSync(to, { recursive: true, force: true })
  cpSync(from, to, { recursive: true })
}

export const isDir = (p) => existsSync(p) && statSync(p).isDirectory()

// ------------------------------------------------------------------------------ latest.yml

const unquote = (v) => {
  const s = v.trim()
  if (s.length >= 2 && ((s[0] === "'" && s.at(-1) === "'") || (s[0] === '"' && s.at(-1) === '"'))) return s.slice(1, -1)
  return s
}

/**
 * electron-builder's latest.yml, read without a YAML dependency. The file is always the same
 * small shape — top-level `key: value` lines plus one `files:` list of `- key: value` maps:
 *
 *   version: 1.6.0
 *   files:
 *     - url: Scriptorium-Writer-Setup-1.6.0.exe
 *       sha512: 5NEq...==
 *       size: 118721229
 *   path: Scriptorium-Writer-Setup-1.6.0.exe
 *   sha512: 5NEq...==
 *   releaseDate: '2026-09-08T08:11:15.017Z'
 *
 * Returns { version, path, sha512, files: [{ url, sha512, size, ... }], ... } with every value a
 * string. Anything it does not understand is left out, and the checker then reports the field
 * as missing — a shape this parser cannot read is a shape to look at, not to guess about.
 */
export function parseLatestYml(text) {
  const doc = { files: [] }
  let inFiles = false
  let item = null
  for (const raw of String(text).replace(/\r\n?/g, '\n').split('\n')) {
    if (!raw.trim() || raw.trim().startsWith('#')) continue
    const top = /^([A-Za-z][\w-]*):\s*(.*)$/.exec(raw)
    if (top) {
      inFiles = top[1] === 'files' && top[2] === ''
      item = null
      if (!inFiles) doc[top[1]] = unquote(top[2])
      continue
    }
    if (!inFiles) continue
    const start = /^\s+-\s+([A-Za-z][\w-]*):\s*(.*)$/.exec(raw)
    if (start) {
      item = { [start[1]]: unquote(start[2]) }
      doc.files.push(item)
      continue
    }
    const cont = /^\s+([A-Za-z][\w-]*):\s*(.*)$/.exec(raw)
    if (cont && item) item[cont[1]] = unquote(cont[2])
  }
  return doc
}

/**
 * Every way latest.yml can disagree with the installer it was written for. This is the check the
 * first release needed: electron-updater downloads `path` / `files[0].url` by name from the
 * release, then compares the sha512 — a name that differs by one character (or a space GitHub
 * turned into a dot) is a 404 on every installed client, a wrong hash a failed update.
 * `exe` is { name, size, sha512 } of the real file. Returns a list of problems ([] = good).
 */
export function latestYmlProblems(text, { version, exe }) {
  const doc = parseLatestYml(text)
  const problems = []
  if (doc.version !== version) problems.push(`version is ${JSON.stringify(doc.version ?? null)}, expected "${version}"`)
  const names = [
    ['path', doc.path],
    ['files[0].url', doc.files[0]?.url]
  ]
  for (const [field, value] of names) {
    if (value === undefined) problems.push(`${field} is missing`)
    else if (/\s/.test(value)) problems.push(`${field} "${value}" contains a space`)
    else if (value !== exe.name) problems.push(`${field} is "${value}", expected "${exe.name}"`)
  }
  for (const [field, value] of [
    ['sha512', doc.sha512],
    ['files[0].sha512', doc.files[0]?.sha512]
  ]) {
    if (value === undefined) problems.push(`${field} is missing`)
    else if (value !== exe.sha512) problems.push(`${field} does not match the installer's SHA-512`)
  }
  const size = doc.files[0]?.size
  if (size === undefined) problems.push('files[0].size is missing')
  else if (Number(size) !== exe.size) problems.push(`files[0].size is ${size}, the installer is ${exe.size} bytes`)
  return problems
}

/** latestYmlProblems as a gate: throws one ReleaseError naming every problem. */
export function checkLatestYml(text, expected) {
  const problems = latestYmlProblems(text, expected)
  if (problems.length) {
    throw new ReleaseError(
      `release/latest.yml does not describe ${expected.exe.name}: ${problems.join('; ')} — electron-updater would fail on every installed client; rebuild with \`npx electron-builder --win --publish never\` and check electron-builder.yml.`
    )
  }
}

// ------------------------------------------------------------------------------ text files

/** SHA256SUMS.txt: `<lowercase hex>  <name>` per file (sha256sum's format), LF, trailing
 *  newline, ASCII only — `sha256sum -c` reads it as is. `entries` is [{ name, sha256 }]. */
export function sha256SumsText(entries) {
  const text = entries.map((e) => `${e.sha256.toLowerCase()}  ${e.name}\n`).join('')
  if (/[^\x20-\x7e\n]/.test(text)) throw new ReleaseError(`${SUMS_FILE} would not be plain ASCII — check the asset names.`)
  return text
}

/** The APK signing certificate's SHA-256, from android/release-fingerprint.txt. */
export function readFingerprint(root) {
  const file = join(root, 'android', 'release-fingerprint.txt')
  if (!existsSync(file)) {
    throw new ReleaseError('android/release-fingerprint.txt is missing — the release notes publish the APK certificate fingerprint from it.')
  }
  const value = readFileSync(file, 'utf8').trim().toLowerCase()
  if (!/^[0-9a-f]{64}$/.test(value)) {
    throw new ReleaseError('android/release-fingerprint.txt does not hold one 64-digit hex SHA-256 fingerprint — restore it from git.')
  }
  return value
}

// A link target that already says where it goes: a scheme (https:, mailto:, ...) or a
// root-relative path, which the reader's site resolves. Both are left alone.
const ABSOLUTE_TARGET = /^([a-z][a-z0-9+.-]*:|\/)/i

/**
 * One link target from docs/CHANGELOG.md, made to work on the GitHub release page: a relative
 * path is resolved against docs/ (where the CHANGELOG lives) and pointed at that file AS OF THE
 * TAG — `architecture.md#library-import` becomes
 * `https://github.com/<owner>/<repo>/blob/vX.Y.Z/docs/architecture.md#library-import` — so the
 * link shows the docs that match the release, not whatever main says later. An image (`raw`)
 * gets the /raw/ URL instead, the file itself rather than GitHub's page about it, so it renders.
 * A pure `#anchor` refers to a heading of the CHANGELOG itself, which the release page does not
 * contain, so it points at docs/CHANGELOG.md on the tag. Absolute targets are returned unchanged.
 */
export function absoluteDocLink(target, version, { raw = false } = {}) {
  if (ABSOLUTE_TARGET.test(target)) return target
  const hash = target.indexOf('#')
  const path = hash < 0 ? target : target.slice(0, hash)
  const fragment = hash < 0 ? '' : target.slice(hash)
  const resolved = posix.normalize(posix.join('docs', path || 'CHANGELOG.md'))
  // A path that climbs out of the repository is not something to guess a URL for.
  if (resolved.startsWith('../')) return target
  return `${REPO_URL}/${raw ? 'raw' : 'blob'}/v${version}/${resolved}${fragment}`
}

const rewriteTarget = (target, version, options) => {
  const angled = target.startsWith('<') && target.endsWith('>')
  const absolute = absoluteDocLink(angled ? target.slice(1, -1) : target, version, options)
  return angled ? `<${absolute}>` : absolute
}

// [text](target "title") and ![alt](target): group 1 is everything up to the target (it starts
// with "!" for an image), group 2 the target (bare or <angled>).
// By design, two shapes stay relative: link text with nested brackets (`[a [b] c](x.md)`), and
// the OUTER target of a linked image (`[![alt](shot.png)](page.md)` — the image inside is
// rewritten, page.md is not). Neither occurs in the CHANGELOG; matching them would need a real
// Markdown parser, and a link left relative is merely dead, never corrupted.
const INLINE_LINK = /(!?\[[^[\]\n]*\]\(\s*)(<[^>\n]*>|[^\s)]+)/g
// [id]: target — a reference definition, alone on its line. Footnote labels ([^1]: ...) are
// prose, not definitions. Whether a definition backs an image is not known here, so it gets the
// /blob/ link.
const REFERENCE_DEF = /^( {0,3}\[(?!\^)[^\]\n]+\]:[ \t]*)(<[^>\n]*>|\S+)/
// What may follow a definition's target on its line: nothing, or one title. Anything else means
// the line is prose that happens to start with "[x]:" (e.g. "[RU]: Исправлено ...") and is left alone.
const DEF_REST = /^[ \t]*(?:"[^"]*"|'[^']*'|\([^)]*\))?[ \t]*\r?$/
// An inline code span: a run of N backticks, then anything, then a run of exactly N backticks.
const CODE_SPAN = /(?<!`)(`+)[^]*?(?<!`)\1(?!`)/g

/** `fn` applied to the parts of `line` outside inline code spans; the spans are kept as written. */
function outsideCode(line, fn) {
  let out = ''
  let last = 0
  for (const m of line.matchAll(CODE_SPAN)) {
    out += fn(line.slice(last, m.index)) + m[0]
    last = m.index + m[0].length
  }
  return out + fn(line.slice(last))
}

/**
 * Markdown with every relative link and image target rewritten by absoluteDocLink. Code is left
 * exactly as written: fenced blocks (``` or ~~~) and `inline code` spans (of any backtick count)
 * are skipped, because a `[x](y)` there is an example, not a link.
 */
export function absolutizeLinks(markdown, version) {
  let fence = null
  return String(markdown)
    .split('\n')
    .map((line) => {
      const opener = /^ {0,3}(`{3,}|~{3,})/.exec(line)
      if (fence) {
        if (opener && opener[1][0] === fence[0] && opener[1].length >= fence.length) fence = null
        return line
      }
      if (opener) {
        fence = opener[1]
        return line
      }
      const def = REFERENCE_DEF.exec(line)
      if (def && DEF_REST.test(line.slice(def[0].length))) return def[1] + rewriteTarget(def[2], version) + line.slice(def[0].length)
      return outsideCode(line, (text) =>
        text.replace(INLINE_LINK, (_, head, target) => head + rewriteTarget(target, version, { raw: head.startsWith('!') }))
      )
    })
    .join('\n')
}

/**
 * The GitHub release description: the CHANGELOG section body, with relative links made absolute
 * (absolutizeLinks — the page is not in the repository, so `architecture.md` would lead nowhere),
 * then a fixed footer with what a user needs to trust a sideloaded APK — the PWA link, the
 * certificate fingerprint (which never changes between releases) and the two commands from
 * docs/android.md "Verifying an APK".
 */
export function releaseNotesText({ notes, version, fingerprint }) {
  const apk = apkName(version)
  return [
    absolutizeLinks(notes.trim(), version),
    '',
    '---',
    '',
    `**Web app (PWA):** ${PWA_URL}`,
    '',
    '**Android APK.** Check the download before installing. The checksum must match `SHA256SUMS.txt`:',
    '',
    '```bash',
    `sha256sum ${apk}`,
    '```',
    '',
    'and the signing certificate:',
    '',
    '```bash',
    `apksigner verify --print-certs ${apk}`,
    '```',
    '',
    'must print this SHA-256 digest — the same for every release:',
    '',
    '```',
    fingerprint,
    '```',
    ''
  ].join('\n')
}
