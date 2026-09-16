// All timestamps are stored as UTC in MongoDB. These helpers render them in
// Pakistan Standard Time (Asia/Karachi) regardless of where the viewer's
// device is set, so the shop always sees consistent local time.
const TZ = 'Asia/Karachi'

export function formatDateTime(iso: string | Date): string {
  return new Date(iso).toLocaleString('en-PK', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  })
}

export function formatDate(iso: string | Date): string {
  return new Date(iso).toLocaleDateString('en-PK', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
}

/** YYYY-MM-DD in Pakistan time — for "is this today (PKT)?" comparisons. */
export function pktDayKey(iso: string | Date): string {
  const d = new Date(iso)
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  const parts = formatter.formatToParts(d)
  const year = parts.find((p) => p.type === 'year')?.value || '1970'
  const month = parts.find((p) => p.type === 'month')?.value || '01'
  const day = parts.find((p) => p.type === 'day')?.value || '01'
  return `${year}-${month}-${day}`
}

/** HH:MM in Pakistan time — for time-of-day comparisons. */
export function pktTimeKey(iso: string | Date): string {
  const d = new Date(iso)
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
  const parts = formatter.formatToParts(d)
  let hourStr = parts.find((p) => p.type === 'hour')?.value || '00'
  const minuteStr = parts.find((p) => p.type === 'minute')?.value || '00'
  if (hourStr === '24') hourStr = '00'
  return `${hourStr.padStart(2, '0')}:${minuteStr.padStart(2, '0')}`
}

/** Adds or subtracts offsetDays from a YYYY-MM-DD string in a calendar-safe way. */
export function shiftPktDay(dayStr: string, offsetDays: number): string {
  const [y, m, d] = dayStr.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d + offsetDays))
  const year = dt.getUTCFullYear()
  const month = String(dt.getUTCMonth() + 1).padStart(2, '0')
  const day = String(dt.getUTCDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export type DatePreset = 'all' | 'today' | 'yesterday' | 'last7' | 'last10' | 'last30' | 'custom'
export type TimePreset = 'all' | 'morning' | 'evening' | 'night' | 'custom'

export interface DateTimeFilterOptions {
  dateFilter: DatePreset
  customStart?: string
  customEnd?: string
  timeFilter: TimePreset
  customTimeStart?: string
  customTimeEnd?: string
  todayStr?: string
}

/**
 * Bulletproof filter that checks if a Date or ISO string matches the selected date & time filters.
 * Properly accounts for:
 * 1. Timezone (Asia/Karachi PKT UTC+5)
 * 2. Multi-day custom date ranges with daytime filters (e.g. 09:00 to 17:00)
 * 3. Overnight shifts (e.g. 18:00 to 02:00) spanning midnight across single day, multi-day, or presets (today/yesterday/last7)
 * 4. Presets (morning 08:00-15:59, evening 16:00-23:59, night 00:00-07:59)
 */
export function matchesDateTimeFilter(
  isoDate: string | Date | undefined | null,
  options: DateTimeFilterOptions,
): boolean {
  if (!isoDate) return false
  const day = pktDayKey(isoDate)
  const time = pktTimeKey(isoDate)

  const {
    dateFilter,
    customStart,
    customEnd,
    timeFilter,
    customTimeStart,
    customTimeEnd,
    todayStr,
  } = options

  // 1. Determine effective time bounds
  let startT = '00:00'
  let endT = '23:59'
  let isTimeFiltered = false

  if (timeFilter === 'morning') {
    startT = '08:00'
    endT = '15:59'
    isTimeFiltered = true
  } else if (timeFilter === 'evening') {
    startT = '16:00'
    endT = '23:59'
    isTimeFiltered = true
  } else if (timeFilter === 'night') {
    startT = '00:00'
    endT = '07:59'
    isTimeFiltered = true
  } else if (timeFilter === 'custom') {
    startT = customTimeStart || '00:00'
    endT = customTimeEnd || '23:59'
    if (startT !== '00:00' || endT !== '23:59') {
      isTimeFiltered = true
    }
  }

  // 2. Determine effective shift date and whether time matches
  let effectiveDate = day
  if (isTimeFiltered) {
    if (startT <= endT) {
      // Normal daytime window (e.g. 08:00 to 16:00 or 09:00 to 17:00)
      if (time < startT || time > endT) return false
      effectiveDate = day
    } else {
      // Overnight shift (e.g. 18:00 to 02:00)
      if (time >= startT) {
        effectiveDate = day
      } else if (time <= endT) {
        effectiveDate = shiftPktDay(day, -1)
      } else {
        // Outside shift window (e.g. 02:01 to 17:59)
        return false
      }
    }
  }

  // 3. Date Matching against effectiveDate
  if (dateFilter === 'custom') {
    if (customStart && customEnd) {
      const minDate = customStart <= customEnd ? customStart : customEnd
      const maxDate = customStart <= customEnd ? customEnd : customStart
      return effectiveDate >= minDate && effectiveDate <= maxDate
    } else if (customStart) {
      return effectiveDate >= customStart
    } else if (customEnd) {
      return effectiveDate <= customEnd
    }
    return true
  }

  const today = todayStr || pktDayKey(new Date())
  switch (dateFilter) {
    case 'today':
      return effectiveDate === today
    case 'yesterday':
      return effectiveDate === shiftPktDay(today, -1)
    case 'last7':
      return effectiveDate >= shiftPktDay(today, -6) && effectiveDate <= today
    case 'last10':
      return effectiveDate >= shiftPktDay(today, -9) && effectiveDate <= today
    case 'last30':
      return effectiveDate >= shiftPktDay(today, -29) && effectiveDate <= today
    case 'all':
    default:
      return true
  }
}
