/**
 * `electron-builder.yml` must name the Windows installer explicitly, and the name must not
 * contain whitespace.
 *
 * Without `artifactName`, NSIS falls back to `${productName} Setup ${version}.${ext}` — and
 * `productName` is `Scriptorium Writer`, with a space. GitHub rewrites spaces in uploaded
 * asset names to dots (`Scriptorium.Writer.Setup.1.6.0.exe`) while electron-builder writes
 * the hyphenated form into `latest.yml` (`Scriptorium-Writer-Setup-1.6.0.exe`). The two
 * never agree, so `electron-updater` asks the release for a file that is not there and every
 * installed client 404s on its update download. That happened for real in v1.5.0 and v1.6.0.
 *
 * The rule is asserted, not the current value: pinning the exact string would turn red on a
 * deliberate rename for no reason, whereas "set, and free of whitespace" is the property that
 * actually keeps auto-update working and stays true across renames.
 *
 * This is a static-file assertion, not a behaviour test — nothing here builds anything.
 *
 * No YAML parser is a declared dependency of this project (`js-yaml` is present in
 * node_modules only transitively, via eslint, and ships no type declarations), and the
 * generators under `scripts/` are deliberately dependency-free. So the handful of top-level
 * scalars this test needs are read with a small reader below rather than by pulling a parser
 * into the dependency tree for two assertions.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const ROOT = resolve(__dirname, '..')

/**
 * The top-level `key: value` scalars of a block-style YAML document.
 *
 * Deliberately narrow: only column-0 keys are collected, so every nested mapping and every
 * sequence item (all of which are indented in this file) is skipped rather than misread, and
 * comments and blank lines are dropped. `electron-builder.yml` is a plain block mapping, and
 * the keys under test — `artifactName`, `productName` — are unquoted plain scalars at the top
 * level, which is exactly what this covers.
 *
 * Surrounding quotes are stripped when present so that quoting a value in the YAML (a purely
 * stylistic choice) cannot change what this test sees.
 *
 * Throws on a document with no top-level scalars at all. Without that, a reader that quietly
 * stopped matching would make every key read `undefined` and report the failure as "the
 * config is missing artifactName" — blaming the wrong file. This way the reader accuses
 * itself.
 */
function topLevelScalars(yaml: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const line of yaml.split(/\r?\n/)) {
    if (/^\s/.test(line) || line.trim() === '' || line.startsWith('#')) continue
    const m = /^([A-Za-z0-9_-]+):[ \t]*(.*)$/.exec(line)
    if (!m) continue
    const value = m[2].trim()
    if (value === '') continue // a key introducing a nested block, e.g. `nsis:`
    out[m[1]] = value.replace(/^(['"])(.*)\1$/, '$2')
  }
  if (Object.keys(out).length === 0) {
    throw new Error('parsed no top-level scalars — topLevelScalars() is broken, not the config')
  }
  return out
}

describe('electron-builder.yml names the installer unambiguously', () => {
  it('sets a space-free artifactName instead of inheriting the NSIS default', () => {
    const config = topLevelScalars(readFileSync(resolve(ROOT, 'electron-builder.yml'), 'utf8'))

    // Unset is a failure on its own: the NSIS default is built from productName, which has a
    // space in it, and that is what 404'd the v1.6.0 update.
    expect(config.artifactName).toBeDefined()

    // Whitespace is the whole defect — GitHub turns it into dots on upload while latest.yml
    // keeps hyphens, and the two names stop matching. Any space-free name is fine.
    expect(config.artifactName).not.toMatch(/\s/)
  })
})
