import { create } from 'zustand'

/** Views from SPEC §10. Only 'editor' is rendered in M2; the rest arrive in M6. */
export type ViewId =
  | 'editor'
  | 'chapters'
  | 'story'
  | 'versions'
  | 'notes'
  | 'statistics'
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
  setActiveView: (view: ViewId) => void
  toggleFocus: () => void
  toggleSidebar: () => void
  setSpellLanguages: (langs: string[]) => void
  setUpdateReadyVersion: (version: string | null) => void
}

export const useUiStore = create<UiState>((set) => ({
  activeView: 'editor',
  focusMode: false,
  sidebarCollapsed: false,
  spellLanguages: ['ru', 'en-US'],
  updateReadyVersion: null,
  setActiveView: (activeView) => set({ activeView }),
  toggleFocus: () => set((s) => ({ focusMode: !s.focusMode })),
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  setSpellLanguages: (spellLanguages) => set({ spellLanguages }),
  setUpdateReadyVersion: (updateReadyVersion) => set({ updateReadyVersion })
}))
