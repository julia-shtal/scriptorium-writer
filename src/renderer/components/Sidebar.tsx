import { useEffect, useState } from 'react'
import {
  IconFeather,
  IconLayoutSidebarLeftCollapse,
  IconEdit,
  IconList,
  IconInfoCircle,
  IconHistory,
  IconNotebook,
  IconChartBar,
  IconSearch,
  IconBooks,
  IconSettings
} from '@tabler/icons-react'
import { useUiStore, type ViewId } from '@renderer/store/uiStore'
import { useEditorStore } from '@renderer/store/editorStore'
import { useT } from '@renderer/i18n/useT'

interface NavDef {
  // `id` doubles as the stable `t.nav` lookup key — labels come from the active
  // dictionary, never hard-coded, so the mapping survives a live language switch.
  id: ViewId
  icon: JSX.Element
}

const WORK: NavDef[] = [
  { id: 'editor', icon: <IconEdit size={17} /> },
  { id: 'chapters', icon: <IconList size={17} /> },
  { id: 'story', icon: <IconInfoCircle size={17} /> },
  { id: 'versions', icon: <IconHistory size={17} /> },
  { id: 'notes', icon: <IconNotebook size={17} /> },
  { id: 'search', icon: <IconSearch size={17} /> },
  { id: 'statistics', icon: <IconChartBar size={17} /> }
]
const GENERAL: NavDef[] = [
  { id: 'library', icon: <IconBooks size={17} /> },
  { id: 'settings', icon: <IconSettings size={17} /> }
]

export function Sidebar(): JSX.Element {
  const t = useT()
  const activeView = useUiStore((s) => s.activeView)
  const toggleSidebar = useUiStore((s) => s.toggleSidebar)
  const setActiveView = useUiStore((s) => s.setActiveView)
  const storyId = useEditorStore((s) => s.storyId)
  const chapterId = useEditorStore((s) => s.chapterId)
  // Re-fetch the snapshot count whenever a save completes (each save creates a
  // version), not only on chapter switch — otherwise the badge freezes for the
  // whole editing session.
  const lastSavedAt = useEditorStore((s) => s.lastSavedAt)
  const [versionCount, setVersionCount] = useState(0)

  useEffect(() => {
    if (!storyId || !chapterId) return
    void window.api.listVersions(storyId, chapterId).then((v) => setVersionCount(v.length))
  }, [storyId, chapterId, lastSavedAt])

  const item = (def: NavDef): JSX.Element => {
    const active = def.id === activeView
    return (
      <div key={def.id} className={`nav-item${active ? ' active' : ''}`}
           onClick={() => setActiveView(def.id)}>
        {def.icon}
        {t.nav[def.id]}
        {def.id === 'versions' && versionCount > 0 && (
          <span className="nav-badge">{versionCount}</span>
        )}
      </div>
    )
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <IconFeather size={20} className="sidebar-icon" />
        <span className="sidebar-title">{t.nav.bookTitle}</span>
        <IconLayoutSidebarLeftCollapse
          size={19} className="sidebar-collapse" title={t.nav.collapseSidebar} onClick={toggleSidebar}
        />
      </div>
      <div className="sidebar-section">{t.nav.sectionWork}</div>
      <nav className="sidebar-nav">{WORK.map(item)}</nav>
      <div className="sidebar-section">{t.nav.sectionGeneral}</div>
      <nav className="sidebar-nav">{GENERAL.map(item)}</nav>
    </aside>
  )
}
