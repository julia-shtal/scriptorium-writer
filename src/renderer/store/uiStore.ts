import { create } from 'zustand'
import type { FindOptions } from '@renderer/editor/find/computeMatches'

/** Views from SPEC §10. Only 'editor' is rendered in M2; the rest arrive in M6. */
export type ViewId =
  | 'editor'
  | 'chapters'
  | 'story'
  | 'versions'
  | 'notes'
  | 'statistics'
  | 'search'
  | 'library'
  | 'settings'

interface UiState {
  activeView: ViewId
  /** Focus/fullscreen: hides sidebar + editor chrome (toolbar/footer). */
  focusMode: boolean
  /** Sidebar collapse toggle (editor goes full width). */
  sidebarCollapsed: boolean
  /** Active spellcheck languages (from settings) for the footer label. */
  spellLanguages: string[]
  /**
   * Version of a downloaded, ready-to-install update (M12), or null when there is
   * nothing to offer. Drives the dismissible UpdateNotice at app root.
   */
  updateReadyVersion: string | null
  /** M15 Find & Replace — session-only, retained across view switches, not persisted. */
  findOpen: boolean
  findQuery: string
  findReplacement: string
  findOptions: FindOptions
  setActiveView: (view: ViewId) => void
  toggleFocus: () => void
  toggleSidebar: () => void
  setSpellLanguages: (langs: string[]) => void
  setUpdateReadyVersion: (version: string | null) => void
  setFindOpen: (v: boolean) => void
  setFindQuery: (q: string) => void
  setFindReplacement: (r: string) => void
  setFindOptions: (o: Partial<FindOptions>) => void
}

export const useUiStore = create<UiState>((set) => ({
  activeView: 'editor',
  focusMode: false,
  sidebarCollapsed: false,
  spellLanguages: ['ru', 'en-US'],
  updateReadyVersion: null,
  findOpen: false,
  findQuery: '',
  findReplacement: '',
  findOptions: { caseSensitive: false, wholeWord: false },
  setActiveView: (activeView) => set({ activeView }),
  toggleFocus: () => set((s) => ({ focusMode: !s.focusMode })),
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  setSpellLanguages: (spellLanguages) => set({ spellLanguages }),
  setUpdateReadyVersion: (updateReadyVersion) => set({ updateReadyVersion }),
  setFindOpen: (findOpen) => set({ findOpen }),
  setFindQuery: (findQuery) => set({ findQuery }),
  setFindReplacement: (findReplacement) => set({ findReplacement }),
  setFindOptions: (o) => set((s) => ({ findOptions: { ...s.findOptions, ...o } }))
}))
