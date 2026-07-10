import {
  IconFeather,
  IconLayoutSidebarLeftCollapse,
  IconEdit,
  IconList,
  IconInfoCircle,
  IconHistory,
  IconNotebook,
  IconChartBar,
  IconBooks,
  IconSettings
} from '@tabler/icons-react'
import { useUiStore, type ViewId } from '@renderer/store/uiStore'

interface NavDef {
  id: ViewId
  label: string
  icon: JSX.Element
}

const WORK: NavDef[] = [
  { id: 'editor', label: 'Редактор', icon: <IconEdit size={17} /> },
  { id: 'chapters', label: 'Главы', icon: <IconList size={17} /> },
  { id: 'story', label: 'О работе', icon: <IconInfoCircle size={17} /> },
  { id: 'versions', label: 'История версий', icon: <IconHistory size={17} /> },
  { id: 'notes', label: 'Заметки', icon: <IconNotebook size={17} /> },
  { id: 'statistics', label: 'Статистика', icon: <IconChartBar size={17} /> }
]
const GENERAL: NavDef[] = [
  { id: 'library', label: 'Библиотека', icon: <IconBooks size={17} /> },
  { id: 'settings', label: 'Настройки', icon: <IconSettings size={17} /> }
]

/** Only the Editor is live in M2; other items render inert (wired in M6). */
export function Sidebar(): JSX.Element {
  const activeView = useUiStore((s) => s.activeView)
  const toggleSidebar = useUiStore((s) => s.toggleSidebar)

  const item = (def: NavDef): JSX.Element => {
    const live = def.id === 'editor'
    const active = def.id === activeView
    return (
      <div key={def.id} className={`nav-item${active ? ' active' : ''}${live ? '' : ' inert'}`}>
        {def.icon}
        {def.label}
      </div>
    )
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <IconFeather size={20} className="sidebar-icon" />
        <span className="sidebar-title">Моя книга</span>
        <IconLayoutSidebarLeftCollapse
          size={19} className="sidebar-collapse" title="Свернуть меню" onClick={toggleSidebar}
        />
      </div>
      <div className="sidebar-section">РАБОТА</div>
      <nav className="sidebar-nav">{WORK.map(item)}</nav>
      <div className="sidebar-section">ОБЩЕЕ</div>
      <nav className="sidebar-nav">{GENERAL.map(item)}</nav>
    </aside>
  )
}
