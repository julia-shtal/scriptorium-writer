import type { SearchMatch } from './searchStory'
import type { ViewId } from '@renderer/store/uiStore'

export interface NavDeps {
  openChapter: (storyId: string, chapterId: string) => Promise<void>
  setActiveView: (view: ViewId) => void
  setFindQuery: (q: string) => void
  setFindOpen: (open: boolean) => void
}

/**
 * Navigate to a search result. Chapter → open it in the editor and seed the M15
 * Find bar so the matches highlight in place. Note → land on the Notes view
 * (no per-entry deep-link in v1).
 */
export async function navigateToResult(
  match: SearchMatch,
  storyId: string,
  query: string,
  deps: NavDeps
): Promise<void> {
  if (match.kind === 'chapter' && match.chapterId) {
    await deps.openChapter(storyId, match.chapterId)
    deps.setFindQuery(query)
    deps.setFindOpen(true)
    deps.setActiveView('editor')
  } else {
    deps.setActiveView('notes')
  }
}
