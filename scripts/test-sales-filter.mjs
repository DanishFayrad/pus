// Test script to verify date & time filtering logic from AdminSales.tsx
const TZ = 'Asia/Karachi'

function pktDayKey(iso) {
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

function pktTimeKey(iso) {
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

// Helper to get previous or next day in YYYY-MM-DD
function shiftDay(dayStr, offsetDays) {
  const [y, m, d] = dayStr.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d + offsetDays))
  return dt.toISOString().split('T')[0]
}

function refinedMatchesDateTimeFilter(isoDate, {
  dateFilter,
  customStart,
  customEnd,
  timeFilter,
  customTimeStart,
  customTimeEnd,
  todayStr
}) {
  if (!isoDate) return false
  const day = pktDayKey(isoDate)
  const time = pktTimeKey(isoDate)

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
    isTimeFiltered = true
  }

  // Determine effective shift date and whether time matches
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
        effectiveDate = shiftDay(day, -1)
      } else {
        // Outside shift window (e.g. 02:01 to 17:59)
        return false
      }
    }
  }

  // 2. Date Matching against effectiveDate
  if (dateFilter === 'custom') {
    if (customStart && customEnd) {
      return effectiveDate >= customStart && effectiveDate <= customEnd
    } else if (customStart) {
      return effectiveDate >= customStart
    } else if (customEnd) {
      return effectiveDate <= customEnd
    }
    return true
  }

  const today = todayStr || '2026-09-15'
  switch (dateFilter) {
    case 'today':
      return effectiveDate === today
    case 'yesterday':
      return effectiveDate === shiftDay(today, -1)
    case 'last7':
      return effectiveDate >= shiftDay(today, -6) && effectiveDate <= today
    case 'last10':
      return effectiveDate >= shiftDay(today, -9) && effectiveDate <= today
    case 'last30':
      return effectiveDate >= shiftDay(today, -29) && effectiveDate <= today
    case 'all':
    default:
      return true
  }
}

console.log('--- TEST CASES ---')

// Case 1: The exact case from user screenshot
// customStart: '2026-09-14', customEnd: '2026-09-15'
// customTimeStart: '18:00', customTimeEnd: '02:00'
const params = {
  dateFilter: 'custom',
  customStart: '2026-09-14',
  customEnd: '2026-09-15',
  timeFilter: 'custom',
  customTimeStart: '18:00',
  customTimeEnd: '02:00',
}

console.log('Parameters:', params)

const testSales = [
  { label: '14-Sep 18:30 (Evening of 14th)', date: '2026-09-14T13:30:00.000Z' }, // 18:30 PKT (UTC+5)
  { label: '14-Sep 23:50 (Late night 14th)', date: '2026-09-14T18:50:00.000Z' }, // 23:50 PKT
  { label: '15-Sep 01:30 (After midnight, 14th shift)', date: '2026-09-14T20:30:00.000Z' }, // 01:30 PKT on 15th
  { label: '15-Sep 02:05 (Just after shift ends)', date: '2026-09-14T21:05:00.000Z' }, // 02:05 PKT on 15th
  { label: '15-Sep 12:00 (Afternoon of 15th)', date: '2026-09-15T07:00:00.000Z' }, // 12:00 PKT on 15th
  { label: '15-Sep 19:00 (Evening of 15th)', date: '2026-09-15T14:00:00.000Z' }, // 19:00 PKT on 15th
  { label: '16-Sep 01:30 (After midnight, 15th shift)', date: '2026-09-15T20:30:00.000Z' }, // 01:30 PKT on 16th
]

testSales.forEach(s => {
  const day = pktDayKey(s.date)
  const time = pktTimeKey(s.date)
  const match = refinedMatchesDateTimeFilter(s.date, params)
  console.log(`[${match ? 'MATCH  ' : 'NO MATCH'}] ${s.label} -> PKT: ${day} ${time}`)
})

// Case 2: What if Start Date is 14-Sep AND End Date is 14-Sep (single day selected!)
console.log('\n--- Case 2: Single Day 14-Sep, Time 18:00 to 02:00 ---')
const paramsSingleDay = {
  dateFilter: 'custom',
  customStart: '2026-09-14',
  customEnd: '2026-09-14',
  timeFilter: 'custom',
  customTimeStart: '18:00',
  customTimeEnd: '02:00',
}
testSales.forEach(s => {
  const day = pktDayKey(s.date)
  const time = pktTimeKey(s.date)
  const match = refinedMatchesDateTimeFilter(s.date, paramsSingleDay)
  console.log(`[${match ? 'MATCH  ' : 'NO MATCH'}] ${s.label} -> PKT: ${day} ${time}`)
})

// Case 3: Daytime Custom (09:00 to 17:00) with Multi-Day Date Range (14-Sep to 15-Sep)
console.log('\n--- Case 3: Multi-Day 14-Sep to 15-Sep, Daytime 09:00 to 17:00 ---')
const paramsDaytime = {
  dateFilter: 'custom',
  customStart: '2026-09-14',
  customEnd: '2026-09-15',
  timeFilter: 'custom',
  customTimeStart: '09:00',
  customTimeEnd: '17:00',
}
testSales.forEach(s => {
  const day = pktDayKey(s.date)
  const time = pktTimeKey(s.date)
  const match = refinedMatchesDateTimeFilter(s.date, paramsDaytime)
  console.log(`[${match ? 'MATCH  ' : 'NO MATCH'}] ${s.label} -> PKT: ${day} ${time}`)
})

// Case 4: Preset 'today' (where today is 14-Sep) with Overnight 18:00 to 02:00
console.log('\n--- Case 4: Preset Today (14-Sep), Overnight 18:00 to 02:00 ---')
const paramsTodayOvernight = {
  dateFilter: 'today',
  timeFilter: 'custom',
  customTimeStart: '18:00',
  customTimeEnd: '02:00',
  todayStr: '2026-09-14',
}
testSales.forEach(s => {
  const day = pktDayKey(s.date)
  const time = pktTimeKey(s.date)
  const match = refinedMatchesDateTimeFilter(s.date, paramsTodayOvernight)
  console.log(`[${match ? 'MATCH  ' : 'NO MATCH'}] ${s.label} -> PKT: ${day} ${time}`)
})

// Case 5: Preset 'morning' (08:00 - 15:59) for Today (15-Sep)
console.log('\n--- Case 5: Preset Morning (08:00-15:59), Today 15-Sep ---')
const paramsMorning = {
  dateFilter: 'today',
  timeFilter: 'morning',
  todayStr: '2026-09-15',
}
testSales.forEach(s => {
  const day = pktDayKey(s.date)
  const time = pktTimeKey(s.date)
  const match = refinedMatchesDateTimeFilter(s.date, paramsMorning)
  console.log(`[${match ? 'MATCH  ' : 'NO MATCH'}] ${s.label} -> PKT: ${day} ${time}`)
})

