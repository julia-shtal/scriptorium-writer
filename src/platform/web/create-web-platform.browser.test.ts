/**
 * `createWebPlatform` over real OPFS (MP4 Task 3). Runs in REAL Chromium via Vitest
 * browser mode (`npm run test:browser`) — `createWebPlatform` now boots an
 * `OpfsFsPort`, which needs `navigator.storage`, so this cannot run in Node.
 *
 * Proves two things Task 2's port-level contract tests cannot: (1) the composed
 * Platform shape (api present, no lifecycle, `storagePersisted` reported as a
 * boolean), and (2) that data survives a *second, independent* `createWebPlatform()`
 * call — the browser analogue of a page reload, since `createWebPlatform` always
 * targets the same fixed `/userdata` and `/library` OPFS paths.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { ProseMirrorJSON } from '@shared/types'
import { createWebPlatform } from './index'

const docWith = (text: string): ProseMirrorJSON => ({
  type: 'doc',
  content: [{ type: 'paragraph', content: text ? [{ type: 'text', text }] : [] }]
})

/**
 * `createWebPlatform` always uses the fixed `/userdata` and `/library` OPFS paths.
 * Wipe them before (and after) each test so this suite is independent and repeatable
 * within the persistent browser session, regardless of test order or prior runs.
 */
async function wipeFixedDirs(): Promise<void> {
  const root = await navigator.storage.getDirectory()
  for (const name of ['userdata', 'library']) {
    await root.removeEntry(name, { recursive: true }).catch(() => {})
  }
}

describe('createWebPlatform (OPFS)', () => {
  beforeEach(wipeFixedDirs)
  afterEach(wipeFixedDirs)

  it('resolves to a Platform with an api, no lifecycle, and a boolean storagePersisted', async () => {
    const platform = await createWebPlatform()
    expect(platform.api).toBeDefined()
    expect(platform.lifecycle).toBeUndefined()
    expect(typeof platform.storagePersisted).toBe('boolean')
  })

  it('persists a chapter across independent createWebPlatform() calls (simulated reload)', async () => {
    const first = await createWebPlatform()

    const story = await first.api.createStory({ title: 'Persistent Story' })
    const chapter = await first.api.createChapter(story.id, 'Chapter One')

    const body = 'Data written before the reload.'
    await first.api.saveChapter(story.id, {
      id: chapter.id,
      title: chapter.title,
      doc: docWith(body)
    })

    // Fresh Platform instance, same underlying OPFS storage — the reload analogue.
    const second = await createWebPlatform()

    const readStory = await second.api.readStory(story.id)
    expect(readStory.id).toBe(story.id)

    const readChapter = await second.api.readChapter(story.id, chapter.id)
    const firstParagraph = (readChapter.doc.content as ProseMirrorJSON[])[0]
    const firstText = (firstParagraph.content as ProseMirrorJSON[])[0]
    expect(firstText.text).toBe(body)
  })
})
