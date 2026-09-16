import { NextResponse } from 'next/server'
import dbConnect from '../../../../lib/mongodb'
import { getSession } from '../../../../lib/auth'
import RestaurantTable from '../../../../models/RestaurantTable'
import RestaurantOrder from '../../../../models/RestaurantOrder'

export const runtime = 'nodejs'

const EXPECTED_TABLES: Array<{ tableNumber: string; section: 'A' | 'B' | 'C'; capacity: number }> = [
  ...Array.from({ length: 16 }, (_, i) => ({ tableNumber: `A${i + 1}`, section: 'A' as const, capacity: 4 })),
  ...Array.from({ length: 16 }, (_, i) => ({ tableNumber: `B${i + 1}`, section: 'B' as const, capacity: 4 })),
  ...Array.from({ length: 6 }, (_, i) => ({ tableNumber: `C${i + 1}`, section: 'C' as const, capacity: 6 })),
]

async function ensureDefaultTables() {
  const existing = await RestaurantTable.find({}).lean()
  const existingNumbers = new Set(existing.map((t: any) => t.tableNumber))

  const toInsert = []
  for (const t of EXPECTED_TABLES) {
    if (!existingNumbers.has(t.tableNumber)) {
      toInsert.push({
        tableNumber: t.tableNumber,
        section: t.section,
        capacity: t.capacity,
        status: 'available',
        activeOrderId: null,
        activeOrderTotal: 0,
        activeItemsCount: 0,
      })
    }
  }

  if (toInsert.length > 0) {
    await RestaurantTable.insertMany(toInsert)
  }
}

export async function GET(req: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    await dbConnect()
    await ensureDefaultTables()

    const { searchParams } = new URL(req.url)
    const section = searchParams.get('section')
    const filter: Record<string, any> = {
      tableNumber: { $in: EXPECTED_TABLES.map((t) => t.tableNumber) },
    }
    if (section && ['A', 'B', 'C'].includes(section)) {
      filter.section = section
    }

    const tables = await RestaurantTable.find(filter).lean()

    // Natural sort: A1..A16, B1..B16, C1..C6
    tables.sort((a: any, b: any) => {
      if (a.section !== b.section) return a.section.localeCompare(b.section)
      const numA = parseInt(a.tableNumber.slice(1), 10) || 0
      const numB = parseInt(b.tableNumber.slice(1), 10) || 0
      return numA - numB
    })

    const formatted = tables.map((t: any) => ({
      ...t,
      id: String(t._id),
      _id: undefined,
      activeOrderId: t.activeOrderId ? String(t.activeOrderId) : null,
    }))

    return NextResponse.json({ tables: formatted })
  } catch (e) {
    console.error('GET /api/restaurant/tables error', e)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
