import type { ReactNode } from 'react'
import { IconLayoutSidebarLeftExpand } from '@tabler/icons-react'
import { useUiStore } from '@renderer/store/uiStore'
import { useT } from '@renderer/i18n/useT'
import { Sidebar } from './Sidebar'

/** Leather-brown frame + page-stack grid. Hosts the sidebar and the active view. */
export function AppFrame({ children }: { children: ReactNode }): JSX.Element {
  const t = useT()
  const focusMode = useUiStore((s) => s.focusMode)
  const sidebarCollapsed = useUiStore((s) => s.sidebarCollapsed)
  const toggleFocus = useUiStore((s) => s.toggleFocus)
  const toggleSidebar = useUiStore((s) => s.toggleSidebar)
  const activeView = useUiStore((s) => s.activeView)

  const gridClass = [
    'book-grid',
    sidebarCollapsed ? 'sidebar-collapsed' : '',
    focusMode ? 'focus-mode' : ''
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className={`book-frame${focusMode ? ' focus-mode' : ''}`}>
      {focusMode && (
        <button className="focus-exit" onClick={toggleFocus}>{t.nav.exitFocus}</button>
      )}
      <div className={gridClass}>
        <Sidebar />
        {sidebarCollapsed && !focusMode && (
          <button
            className="sidebar-expand"
            onClick={toggleSidebar}
            title={t.nav.expandSidebar}
            aria-label={t.nav.expandSidebar}
          >
            <IconLayoutSidebarLeftExpand size={18} />
          </button>
        )}
        <section className={`page${activeView === 'editor' ? ' page--editor' : ''}`}>{children}</section>
      </div>
    </div>
  )
}
