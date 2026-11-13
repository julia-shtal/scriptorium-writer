// scripts/release/changelog.mjs
// Reads one version's section out of docs/CHANGELOG.md. The release needs it twice: preflight
// refuses to release a version nobody wrote a changelog entry for (1.6.0 shipped without one,
// and "Unreleased" went on describing PWA and Android as unreleased afterwards), and the GitHub
// release notes are that section, verbatim.
//
// Heading format (docs/CHANGELOG.md): `## X.Y.Z — unreleased` or `## X.Y.Z — YYYY-MM-DD`, em
// dash. The version must be followed by the end of the line, whitespace, or a dash — so
// `## 1.7.0`, `## 1.7.0—unreleased`, `## 1.7.0 - unreleased` and `## 1.7.0- 2026-11-20` all count.
// NOT accepted: a different version that merely starts with the same digits (`## 1.7.01`,
// `## 1.7.0.1`), and a hyphen glued to a word (`## 1.7.0-beta`), which reads as a semver
// pre-release rather than as this version. A section runs until the next `## ` heading (a `### `
// subheading stays inside it) and must hold at least one top-level `- ` bullet. CRLF files parse
// the same as LF ones.
//
// The bump step dates the section: stampDate() rewrites its heading to `## X.Y.Z — YYYY-MM-DD`.

const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// After the version: end, whitespace, an em/en dash (anything may follow it), or a hyphen
// that is not glued to a letter or digit.
const headingRegExp = (version) => new RegExp(`^##[ \\t]+${escapeRegExp(version)}(?:$|[ \\t]|[—–]|-(?![0-9A-Za-z]))`)

/**
 * The section for `version`, or null when there is no `## X.Y.Z` heading.
 * Returns { heading, body, bullets }: `heading` is the heading line as written, `body` is
 * everything after it up to the next `## ` (trimmed, LF line endings), `bullets` counts the
 * top-level `- ` items in the body.
 */
export function findSection(text, version) {
  const lines = String(text).replace(/\r\n?/g, '\n').split('\n')
  const headingRe = headingRegExp(version)
  const start = lines.findIndex((l) => headingRe.test(l))
  if (start === -1) return null
  let end = lines.length
  for (let i = start + 1; i < lines.length; i++) {
    if (/^##(?!#)/.test(lines[i])) {
      end = i
      break
    }
  }
  const bodyLines = lines.slice(start + 1, end)
  return {
    heading: lines[start].trimEnd(),
    body: bodyLines.join('\n').trim(),
    bullets: bodyLines.filter((l) => /^- \S/.test(l)).length
  }
}

/** The release notes for `version`: the section body, heading excluded. Null if absent. */
export function releaseNotes(text, version) {
  return findSection(text, version)?.body ?? null
}

const DATE = /\b\d{4}-\d{2}-\d{2}\b/

/** `date` as YYYY-MM-DD in the machine's local time zone — the day the operator is releasing on. */
export function isoDay(date) {
  const pad = (n) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/**
 * Dates the `version` section: its heading becomes `## X.Y.Z — <day>` (`day` is YYYY-MM-DD).
 * A heading that already carries a date is left exactly as written — someone dated it on
 * purpose, and a re-run of the release must not move it. Returns { text, changed, heading }
 * (`heading` as it reads afterwards), or null when there is no such section. Only the heading
 * line is touched; every other byte, line endings included, is kept.
 */
export function stampDate(text, version, day) {
  const source = String(text)
  const headingRe = headingRegExp(version)
  const lines = source.split('\n')
  const index = lines.findIndex((l) => headingRe.test(l.replace(/\r$/, '')))
  if (index === -1) return null
  const current = lines[index].replace(/\r$/, '')
  if (DATE.test(current)) return { text: source, changed: false, heading: current.trimEnd() }
  const heading = `## ${version} — ${day}`
  lines[index] = lines[index].endsWith('\r') ? `${heading}\r` : heading
  return { text: lines.join('\n'), changed: true, heading }
}
