/**
 * `scripts/android-sdk.mjs` decides which apksigner both verify-apk.mjs and the release
 * preflight use. The two properties worth pinning: build-tools versions sort numerically (a
 * string sort puts 9.0.0 above 34.0.0 and picks an apksigner too old for the APK), and on
 * Windows the .bat wrapper is preferred over the extensionless shell script next to it.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildToolVersions, compareBuildToolVersions, findBuildTool, sdkRoot } from './android-sdk.mjs'

let tools: string
beforeEach(() => {
  tools = join(mkdtempSync(join(tmpdir(), 'android-sdk-')), 'build-tools')
})
afterEach(() => {
  rmSync(join(tools, '..'), { recursive: true, force: true })
})

const touch = (...parts: string[]) => {
  mkdirSync(join(tools, ...parts.slice(0, -1)), { recursive: true })
  writeFileSync(join(tools, ...parts), '')
}

describe('android-sdk', () => {
  it('prefers ANDROID_HOME, falls back to ANDROID_SDK_ROOT, treats empty as unset', () => {
    expect(sdkRoot({ ANDROID_HOME: 'a', ANDROID_SDK_ROOT: 'b' })).toBe('a')
    expect(sdkRoot({ ANDROID_HOME: '', ANDROID_SDK_ROOT: 'b' })).toBe('b')
    expect(sdkRoot({})).toBeNull()
  })

  it('orders build-tools versions newest first, numerically', () => {
    expect(['9.0.0', '34.0.0', '36.0.0', '35.0.1', '35.0.0'].sort(compareBuildToolVersions)).toEqual([
      '36.0.0',
      '35.0.1',
      '35.0.0',
      '34.0.0',
      '9.0.0'
    ])
  })

  it('finds the newest tool, preferring the .bat on Windows', () => {
    touch('35.0.0', 'apksigner.bat')
    touch('36.0.0', 'apksigner')
    touch('36.0.0', 'apksigner.bat')
    const versions = buildToolVersions(tools)
    expect(versions).toEqual(['36.0.0', '35.0.0'])
    expect(findBuildTool(tools, versions, 'apksigner', '.bat', 'win32')).toEqual({
      path: join(tools, '36.0.0', 'apksigner.bat'),
      version: '36.0.0'
    })
    expect(findBuildTool(tools, versions, 'apksigner', '.bat', 'linux')?.path).toBe(join(tools, '36.0.0', 'apksigner'))
  })

  it('returns null / [] when there is nothing to find', () => {
    expect(buildToolVersions(tools)).toEqual([])
    expect(findBuildTool(tools, [], 'apksigner', '.bat', 'win32')).toBeNull()
  })
})
