import { useEffect, useMemo, useState } from 'react'
import { useStoryStore } from '@renderer/store/storyStore'
import { currentStreak, recordActiveDay, todayKey, type DayKey } from './stats'

const DAYS_KEY = 'scriptorium:activeDays'

function readDays(): DayKey[] {
  try {
    const raw = localStorage.getItem(DAYS_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    // Guard the shape, not just the parse: a non-array value would make the later
    // `new Set(days)` throw. Only accept an array of day-key strings.
    return Array.isArray(parsed) ? (parsed.filter((d) => typeof d === 'string') as DayKey[]) : []
  } catch {
    return []
  }
}

export function StatisticsView(): JSX.Element {
  const chapters = useStoryStore((s) => s.chapters)
  const total = useMemo(() => chapters.reduce((n, c) => n + c.wordCount, 0), [chapters])
  const [streak, setStreak] = useState(0)

  // Word counts in storyStore are captured at story load; refresh them on entry so
  // totals reflect edits made in the editor since (the counts are this view's point).
  useEffect(() => {
    void useStoryStore.getState().reload()
  }, [])

  useEffect(() => {
    const today = todayKey()
    const days = recordActiveDay(readDays(), today)
    localStorage.setItem(DAYS_KEY, JSON.stringify(days))
    setStreak(currentStreak(days, today))
  }, [])

  return (
    <div className="stats-view">
      <h2 className="stats-h">Статистика</h2>
      <div className="stats-cards">
        <div className="stats-card"><span className="stats-num">{total}</span><span>всего слов</span></div>
        <div className="stats-card"><span className="stats-num">{chapters.length}</span><span>глав</span></div>
        <div className="stats-card"><span className="stats-num">{streak}</span><span>дней подряд</span></div>
      </div>
      <h3 className="stats-h3">По главам</h3>
      <ul className="stats-list">
        {chapters.map((c) => (
          <li key={c.id}><span>{c.title}</span><span className="stats-words">{c.wordCount} сл</span></li>
        ))}
      </ul>
    </div>
  )
}
