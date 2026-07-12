/** A local calendar day key, `YYYY-MM-DD`. */
export type DayKey = string

/** Today's local day key. */
export function todayKey(now: Date = new Date()): DayKey {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** Add `day` to the active-day list, returning a sorted-unique new array. Pure. */
export function recordActiveDay(days: readonly DayKey[], day: DayKey): DayKey[] {
  const set = new Set(days)
  set.add(day)
  return [...set].sort()
}

/** Count consecutive active days ending at `today` (0 if today isn't active). Pure. */
export function currentStreak(days: readonly DayKey[], today: DayKey): number {
  const set = new Set(days)
  if (!set.has(today)) return 0
  let streak = 0
  const cursor = new Date(`${today}T00:00:00`)
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const key = todayKey(cursor)
    if (!set.has(key)) break
    streak += 1
    cursor.setDate(cursor.getDate() - 1)
  }
  return streak
}
