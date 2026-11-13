// scripts/release.mjs
// One-command release for Windows, the PWA and Android (M32):
//   npm run release -- <major|minor|patch|X.Y.Z> [--dry-run] [--resume] [--abort]
// It replaces a dozen manual steps across git, npm, Gradle, electron-builder and gh whose
// gates already existed as separate scripts but were never chained — and whose order is what
// keeps installed clients safe: nothing becomes visible to users until every artifact is built
// and verified. See scripts/release/pipeline.mjs for the step list and the state/resume rules.
//
// This file is only the entry point: it hands the real process (argv, env, child processes) to
// main() and turns its result into the exit code. All logic lives in scripts/release/, where it
// is tested with a fake runner. Node built-ins only.
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRunner } from './release/exec.mjs'
import { main } from './release/pipeline.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

process.exitCode = await main(process.argv.slice(2), {
  root: ROOT,
  run: createRunner(),
  env: process.env,
  platform: process.platform
})
