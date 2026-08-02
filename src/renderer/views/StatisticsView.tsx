import { useEffect, useMemo, useState } from 'react'
import { useStoryStore } from '@renderer/store/storyStore'
import { useSettingsStore } from '@renderer/store/settingsStore'
import { useT } from '@renderer/i18n/useT'
import { plural } from '@renderer/i18n/plural'
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
  const t = useT()
  const language = useSettingsStore((s) => s.settings?.language ?? 'ru')
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
      <h2 className="stats-h">{t.statistics.heading}</h2>
      <div className="stats-cards">
        <div className="stats-card"><span className="stats-num">{total}</span><span>{t.statistics.totalWords}</span></div>
        <div className="stats-card"><span className="stats-num">{chapters.length}</span><span>{t.statistics.chaptersCount}</span></div>
        <div className="stats-card"><span className="stats-num">{streak}</span><span>{t.statistics.streakDays}</span></div>
      </div>
      <h3 className="stats-h3">{t.statistics.byChapter}</h3>
      <ul className="stats-list">
        {chapters.map((c) => (
          <li key={c.id}><span>{c.title}</span><span className="stats-words">{c.wordCount} {plural(c.wordCount, t.plurals.words, language)}</span></li>
        ))}
      </ul>
    </div>
  )
}
