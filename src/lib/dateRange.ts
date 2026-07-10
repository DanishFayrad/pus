// Date-range resolution for analytics and reports. Both must agree exactly, otherwise an
// exported report would not match the figures shown on screen for the same preset.
//
// Sales are stored as UTC instants. The shop reasons in Pakistan Standard Time (UTC+05:00),
// so calendar-boundary presets ("today", "this month") are anchored to PKT midnight rather
// than to the server's local midnight.

export const TZ = 'Asia/Karachi'

export type Preset =
  | 'all'
  | 'today'
  | 'yesterday'
  | '7days'
  | '30days'
  | 'thisMonth'
  | 'lastMonth'
  | 'thisYear'
  | 'custom'

export type GroupBy = 'hour' | 'day' | 'week' | 'month' | 'year'

/** Render a Date as its YYYY-MM-DD calendar day in PKT. */
export function formatPktDate(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d)
}

/** Turn a PKT calendar day (YYYY-MM-DD) into the UTC instant at its start or end. */
export function fromPktString(dateStr: string, isEnd = false): Date {
  return new Date(`${dateStr}T${isEnd ? '23:59:59.999' : '00:00:00.000'}+05:00`)
}

export function getRangeForPreset(
  preset: string,
  startParam?: string | null,
  endParam?: string | null,
): { startDate: Date; endDate: Date } {
  const now = new Date()
  let startDate: Date
  let endDate: Date

  switch (preset) {
    case 'today': {
      startDate = fromPktString(formatPktDate(now))
      endDate = now
      break
    }
    case 'yesterday': {
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000)
      const yestStr = formatPktDate(yesterday)
      startDate = fromPktString(yestStr)
      endDate = fromPktString(yestStr, true)
      break
    }
    case '7days': {
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
      endDate = now
      break
    }
    case '30days': {
      startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
      endDate = now
      break
    }
    case 'thisMonth': {
      const [year, month] = formatPktDate(now).split('-')
      startDate = fromPktString(`${year}-${month}-01`)
      endDate = now
      break
    }
    case 'lastMonth': {
      const [yearStr, monthStr] = formatPktDate(now).split('-')
      let y = parseInt(yearStr, 10)
      let m = parseInt(monthStr, 10) - 1
      if (m === 0) {
        m = 12
        y -= 1
      }
      const mPad = String(m).padStart(2, '0')
      startDate = fromPktString(`${y}-${mPad}-01`)
      // Day 0 of month m (1-indexed) is the last day of that month.
      const lastDay = new Date(y, m, 0).getDate()
      endDate = fromPktString(`${y}-${mPad}-${String(lastDay).padStart(2, '0')}`, true)
      break
    }
    case 'thisYear': {
      const [year] = formatPktDate(now).split('-')
      startDate = fromPktString(`${year}-01-01`)
      endDate = now
      break
    }
    case 'all': {
      startDate = new Date(0)
      endDate = now
      break
    }
    case 'custom':
    default: {
      // Bare YYYY-MM-DD from a date input is anchored to PKT, not parsed as UTC midnight,
      // so a custom range covers the whole shop day the user picked.
      const isDayOnly = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s)
      startDate = startParam
        ? isDayOnly(startParam)
          ? fromPktString(startParam)
          : new Date(startParam)
        : new Date(0)
      endDate = endParam
        ? isDayOnly(endParam)
          ? fromPktString(endParam, true)
          : new Date(endParam)
        : now
      break
    }
  }

  return { startDate, endDate }
}

/** Bucket key for a Date under a grouping granularity, in PKT. */
export function getDateGroupKey(date: Date, groupBy: string): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  const y = date.getFullYear()
  const m = pad(date.getMonth() + 1)
  const d = pad(date.getDate())
  const h = pad(date.getHours())

  if (groupBy === 'hour') return `${y}-${m}-${d} ${h}:00`
  if (groupBy === 'day') return `${y}-${m}-${d}`
  if (groupBy === 'week') {
    const sunday = new Date(date)
    sunday.setDate(date.getDate() - date.getDay())
    return `${sunday.getFullYear()}-${pad(sunday.getMonth() + 1)}-${pad(sunday.getDate())} (Wk)`
  }
  if (groupBy === 'month') return `${y}-${m}`
  if (groupBy === 'year') return `${y}`
  return `${y}-${m}-${d}`
}
