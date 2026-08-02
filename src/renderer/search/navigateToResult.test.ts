import { describe, it, expect, vi } from 'vitest'
import { navigateToResult } from './navigateToResult'
import type { SearchMatch } from './searchStory'
import type { Snippet } from './snippet'

const snippet: Snippet = { before: '', match: 'x', after: '', truncatedStart: false, truncatedEnd: false }

const deps = () => ({
  openChapter: vi.fn(async () => {}),
  setActiveView: vi.fn(),
  setFindQuery: vi.fn(),
  setFindOpen: vi.fn()
})

describe('navigateToResult', () => {
  it('opens the chapter, seeds M15 Find, and switches to the editor', async () => {
    const d = deps()
    const m: SearchMatch = { kind: 'chapter', chapterId: 'c1', label: 'Глава 1', count: 1, snippet }
    await navigateToResult(m, 's1', 'иван', d)
    expect(d.openChapter).toHaveBeenCalledWith('s1', 'c1')
    expect(d.setFindQuery).toHaveBeenCalledWith('иван')
    expect(d.setFindOpen).toHaveBeenCalledWith(true)
    expect(d.setActiveView).toHaveBeenCalledWith('editor')
  })

  it('sends a note result to the notes view without opening a chapter', async () => {
    const d = deps()
    const m: SearchMatch = { kind: 'note', noteSection: 'characters', label: 'Персонажи · Иван', count: 1, snippet }
    await navigateToResult(m, 's1', 'иван', d)
    expect(d.setActiveView).toHaveBeenCalledWith('notes')
    expect(d.openChapter).not.toHaveBeenCalled()
  })
})
