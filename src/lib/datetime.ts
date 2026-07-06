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

