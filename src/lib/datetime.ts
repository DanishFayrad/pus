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
  return new Date(iso).toLocaleDateString('en-CA', { timeZone: TZ })
}
