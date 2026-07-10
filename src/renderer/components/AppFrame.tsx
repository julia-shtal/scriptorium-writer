import type { ReactNode } from 'react'
import { IconLayoutSidebarLeftExpand } from '@tabler/icons-react'
import { useUiStore } from '@renderer/store/uiStore'
import { Sidebar } from './Sidebar'

/** Leather-brown frame + page-stack grid. Hosts the sidebar and the active view. */
export function AppFrame({ children }: { children: ReactNode }): JSX.Element {
  const focusMode = useUiStore((s) => s.focusMode)
  const sidebarCollapsed = useUiStore((s) => s.sidebarCollapsed)
  const toggleFocus = useUiStore((s) => s.toggleFocus)
  const toggleSidebar = useUiStore((s) => s.toggleSidebar)

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
        <button className="focus-exit" onClick={toggleFocus}>Выйти из фокуса</button>
      )}
      <div className={gridClass}>
        <Sidebar />
        {sidebarCollapsed && !focusMode && (
          <button
            className="sidebar-expand"
            onClick={toggleSidebar}
            title="Показать меню"
            aria-label="Показать меню"
          >
            <IconLayoutSidebarLeftExpand size={18} />
          </button>
        )}
        <section className="page">{children}</section>
      </div>
    </div>
  )
}
