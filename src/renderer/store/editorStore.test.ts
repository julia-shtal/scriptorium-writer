import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import type { ProseMirrorJSON } from '@shared/types'
import { useEditorStore } from './editorStore'

const para = (text: string): ProseMirrorJSON => ({
  type: 'doc',
  content: [{ type: 'paragraph', content: text ? [{ type: 'text', text }] : [] }]
})

const reset = (): void =>
  useEditorStore.setState({
    storyId: null,
    chapterId: null,
    title: '',
    doc: null,
    dirty: false,
    wordCount: 0,
    selectionWordCount: 0,
    indentOn: true,
    saveStatus: 'idle',
    lastSavedAt: null
  })

describe('editorStore', () => {
  let readChapter: ReturnType<typeof vi.fn>
  let saveChapter: ReturnType<typeof vi.fn>

  beforeEach(() => {
    reset()
    readChapter = vi.fn(async () => ({
      id: 'c1',
      title: 'Глава 1',
      doc: para('one two three'),
      wordCount: 3,
      createdAt: '',
      updatedAt: '',
      schemaVersion: 1
    }))
    saveChapter = vi.fn(async () => ({
      savedAt: '2026-07-10T00:00:00.000Z',
      wordCount: 3,
      versionId: 'v1'
    }))
    vi.stubGlobal('window', { api: { readChapter, saveChapter } })
  })

  afterEach(() => vi.unstubAllGlobals())

  test('openChapter loads via window.api.readChapter and is not dirty', async () => {
    await useEditorStore.getState().openChapter('s1', 'c1')
    expect(readChapter).toHaveBeenCalledWith('s1', 'c1')
    const s = useEditorStore.getState()
    expect(s.title).toBe('Глава 1')
    expect(s.wordCount).toBe(3)
    expect(s.dirty).toBe(false)
  })

  test('applyDocUpdate marks dirty and recomputes counts', () => {
    useEditorStore.getState().applyDocUpdate(para('alpha beta'), 'beta')
    const s = useEditorStore.getState()
    expect(s.dirty).toBe(true)
    expect(s.wordCount).toBe(2)
    expect(s.selectionWordCount).toBe(1)
  })

  test('setSelection updates selection count without dirtying', () => {
    useEditorStore.getState().setSelection('two words')
    const s = useEditorStore.getState()
    expect(s.selectionWordCount).toBe(2)
    expect(s.dirty).toBe(false)
  })

  test('save persists via saveChapter and clears dirty', async () => {
    await useEditorStore.getState().openChapter('s1', 'c1')
    useEditorStore.getState().applyDocUpdate(para('new text here'), '')
    await useEditorStore.getState().save()
    expect(saveChapter).toHaveBeenCalledWith('s1', {
      id: 'c1',
      title: 'Глава 1',
      doc: para('new text here')
    })
    expect(useEditorStore.getState().dirty).toBe(false)
    expect(useEditorStore.getState().saveStatus).toBe('saved')
  })

  test('openChapter flushes a dirty chapter first (save-if-dirty)', async () => {
    await useEditorStore.getState().openChapter('s1', 'c1')
    useEditorStore.getState().applyDocUpdate(para('edited'), '')
    await useEditorStore.getState().openChapter('s1', 'c2')
    expect(saveChapter).toHaveBeenCalledTimes(1)
  })
})
