/**
 * Recovery-path proof over the REAL OPFS port (MP4 Task 3, the reliability payoff).
 *
 * SPEC §5/§8: a missing canonical `.json` must surface as a recoverable condition
 * (never a silent blank chapter), and a newest snapshot must be available to restore
 * from. This exercises `FileService.scanLibrary` directly against `OpfsFsPort` — the
 * combination the web build actually runs — rather than the in-memory port.
 *
 * Runs in REAL Chromium via Vitest browser mode (`npm run test:browser`); OPFS is not
 * available in Node.
 */
import { describe, it, expect } from 'vitest'
import { FileService } from '@data/file-service'
import { layout } from '@data/paths'
import { OpfsFsPort } from './opfs-fs-port'

const docWith = (text: string) => ({
  type: 'doc',
  content: [{ type: 'paragraph', content: text ? [{ type: 'text', text }] : [] }]
})

describe('OPFS recovery: missing canonical chapter file', () => {
  it('scanLibrary reports a restorable "missing" entry when the .json canon is deleted', async () => {
    const uid = crypto.randomUUID()
    const userDataPath = `/rectest-${uid}/ud`
    const libraryPath = `/rectest-${uid}/lib`
    const fs = new OpfsFsPort()
    const svc = new FileService({ fs, userDataPath, defaultLibraryPath: libraryPath })

    try {
      await svc.ensureLibrary()
      const story = await svc.createStory({ title: 'Recovery Story' })
      const chapter = await svc.createChapter(story.id, 'Chapter One')

      // Real content, so the canon write + version snapshot both happen.
      await svc.saveChapter(story.id, {
        id: chapter.id,
        title: chapter.title,
        doc: docWith('This chapter will lose its canon file.')
      })

      // Simulate corruption/loss: delete the canonical .json, leave the snapshot.
      const chaptersDir = layout.chaptersDir(libraryPath, story.id)
      const names = (await fs.readdir(chaptersDir)).filter((n) => n.endsWith('.json'))
      expect(names.length).toBe(1)
      await fs.rm(`${chaptersDir}/${names[0]}`)

      const recoveries = await svc.scanLibrary()
      const entry = recoveries.find(
        (r) => r.storyId === story.id && r.chapterId === chapter.id
      )
      expect(entry).toBeDefined()
      expect(entry?.reason).toBe('missing')
      expect(entry?.newestVersionId).toBeTruthy()

      // The snapshot is genuinely restorable.
      if (entry?.newestVersionId) {
        const restored = await svc.restoreVersion(story.id, chapter.id, entry.newestVersionId)
        const firstParagraph = (
          restored.doc.content as Array<{ content?: Array<{ text?: string }> }>
        )[0]
        expect(firstParagraph?.content?.[0]?.text).toBe(
          'This chapter will lose its canon file.'
        )
      }
    } finally {
      const root = await navigator.storage.getDirectory()
      await root.removeEntry(`rectest-${uid}`, { recursive: true }).catch(() => {})
    }
  })
})
