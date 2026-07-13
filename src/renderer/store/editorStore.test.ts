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
    wandPreviewActive: false,
    saveStatus: 'idle',
    lastSavedAt: null,
    mdWarning: null
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

  // add alongside the existing afterEach
  afterEach(() => {
    useEditorStore.getState().stopAutosave()
    vi.useRealTimers()
  })

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

  test('typing then pausing debounceMs triggers exactly one flush', async () => {
    vi.useFakeTimers()
    useEditorStore.getState().configureAutosave({ debounceMs: 2000, intervalMs: 120000 })
    await useEditorStore.getState().openChapter('s1', 'c1')
    saveChapter.mockClear()
    useEditorStore.getState().applyDocUpdate(para('edited once'), '')
    await vi.advanceTimersByTimeAsync(1999)
    expect(saveChapter).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(saveChapter).toHaveBeenCalledTimes(1)
    expect(useEditorStore.getState().dirty).toBe(false)
    expect(useEditorStore.getState().saveStatus).toBe('saved')
  })

  test('debounce autosave is suppressed while the wand preview is active', async () => {
    vi.useFakeTimers()
    useEditorStore.getState().configureAutosave({ debounceMs: 2000, intervalMs: 120000 })
    await useEditorStore.getState().openChapter('s1', 'c1')
    saveChapter.mockClear()
    useEditorStore.getState().setWandPreviewActive(true)
    useEditorStore.getState().applyDocUpdate(para('edited during preview'), '')
    await vi.advanceTimersByTimeAsync(5000)
    expect(saveChapter).not.toHaveBeenCalled()
    // Leaving preview and editing again schedules a normal save.
    useEditorStore.getState().setWandPreviewActive(false)
    useEditorStore.getState().applyDocUpdate(para('edited after preview'), '')
    await vi.advanceTimersByTimeAsync(2000)
    expect(saveChapter).toHaveBeenCalledTimes(1)
  })

  test('interval flush is skipped while the wand preview is active', async () => {
    vi.useFakeTimers()
    useEditorStore.getState().configureAutosave({ debounceMs: 999999, intervalMs: 5000 })
    await useEditorStore.getState().openChapter('s1', 'c1')
    saveChapter.mockClear()
    useEditorStore.setState({ dirty: true })
    useEditorStore.getState().setWandPreviewActive(true)
    await vi.advanceTimersByTimeAsync(5000)
    expect(saveChapter).not.toHaveBeenCalled()
  })

  test('interval flushes only while dirty', async () => {
    vi.useFakeTimers()
    useEditorStore.getState().configureAutosave({ debounceMs: 999999, intervalMs: 5000 })
    await useEditorStore.getState().openChapter('s1', 'c1')
    saveChapter.mockClear()
    // clean → interval tick saves nothing
    await vi.advanceTimersByTimeAsync(5000)
    expect(saveChapter).not.toHaveBeenCalled()
    // dirty (debounce is effectively disabled) → next tick saves
    useEditorStore.getState().applyDocUpdate(para('dirty now'), '')
    await vi.advanceTimersByTimeAsync(5000)
    expect(saveChapter).toHaveBeenCalledTimes(1)
  })

  test('concurrent flush calls dedupe to a single save', async () => {
    await useEditorStore.getState().openChapter('s1', 'c1')
    saveChapter.mockClear()
    useEditorStore.getState().applyDocUpdate(para('once only'), '')
    await Promise.all([
      useEditorStore.getState().flush(),
      useEditorStore.getState().flush()
    ])
    expect(saveChapter).toHaveBeenCalledTimes(1)
  })

  test('edit during an in-flight save keeps the chapter dirty', async () => {
    await useEditorStore.getState().openChapter('s1', 'c1')
    let release: () => void = () => {}
    saveChapter.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = () =>
            resolve({ savedAt: '2026-07-10T00:00:00.000Z', wordCount: 2, versionId: 'v2' })
        })
    )
    useEditorStore.getState().applyDocUpdate(para('first edit'), '')
    const flushing = useEditorStore.getState().flush()
    // a new edit lands while the save is still in flight
    useEditorStore.getState().applyDocUpdate(para('second edit while saving'), '')
    release()
    await flushing
    const s = useEditorStore.getState()
    expect(s.dirty).toBe(true)
    expect(s.saveStatus).not.toBe('saved')
  })

  test('a failed save keeps dirty and reports error', async () => {
    await useEditorStore.getState().openChapter('s1', 'c1')
    saveChapter.mockRejectedValueOnce(new Error('disk full'))
    useEditorStore.getState().applyDocUpdate(para('unsaved edit'), '')
    await useEditorStore.getState().flush()
    const s = useEditorStore.getState()
    expect(s.saveStatus).toBe('error')
    expect(s.dirty).toBe(true)
  })

  test('surfaces mdWarning from a save and clears it on the next clean save', async () => {
    await useEditorStore.getState().openChapter('s1', 'c1')
    saveChapter
      .mockResolvedValueOnce({
        savedAt: '2026-07-12T00:00:00.000Z',
        wordCount: 3,
        versionId: 'v1',
        mdWarning: 'Markdown backup failed: EPERM'
      })
      .mockResolvedValueOnce({
        savedAt: '2026-07-12T00:00:01.000Z',
        wordCount: 3,
        versionId: 'v2'
      })

    useEditorStore.getState().applyDocUpdate(para('first edit'), '')
    await useEditorStore.getState().save()
    expect(useEditorStore.getState().mdWarning).toContain('Markdown backup failed')

    useEditorStore.getState().applyDocUpdate(para('second edit'), '')
    await useEditorStore.getState().save()
    expect(useEditorStore.getState().mdWarning).toBeNull()
  })
})
