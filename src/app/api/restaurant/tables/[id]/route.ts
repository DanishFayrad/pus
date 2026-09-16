import { NextResponse } from 'next/server'
import mongoose from 'mongoose'
import dbConnect from '../../../../../lib/mongodb'
import { getSession } from '../../../../../lib/auth'
import RestaurantTable from '../../../../../models/RestaurantTable'
import RestaurantOrder from '../../../../../models/RestaurantOrder'

export const runtime = 'nodejs'

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { id } = await params
    await dbConnect()

    const filter = mongoose.isValidObjectId(id)
      ? { _id: id }
      : { tableNumber: id.toUpperCase() }

    const table = await RestaurantTable.findOne(filter).lean()
    if (!table) {
      return NextResponse.json({ error: 'Table not found' }, { status: 404 })
    }

    let activeOrder = null
    if (table.activeOrderId) {
      activeOrder = await RestaurantOrder.findById(table.activeOrderId).lean()
    }

    return NextResponse.json({
      table: {
        ...table,
        id: String(table._id),
        _id: undefined,
        activeOrderId: table.activeOrderId ? String(table.activeOrderId) : null,
      },
      activeOrder: activeOrder
        ? {
            ...activeOrder,
            id: String(activeOrder._id),
            _id: undefined,
            tableId: String(activeOrder.tableId),
          }
        : null,
    })
  } catch (e) {
    console.error('GET /api/restaurant/tables/[id] error', e)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { id } = await params
    const body = await req.json().catch(() => ({}))
    const { status } = body

    if (!status || !['available', 'occupied', 'billing', 'cleaning'].includes(status)) {
      return NextResponse.json({ error: 'Valid status is required' }, { status: 400 })
    }

    await dbConnect()

    const filter = mongoose.isValidObjectId(id)
      ? { _id: id }
      : { tableNumber: id.toUpperCase() }

    const update: Record<string, any> = { status }

    // When reset to available, clear active order references and cancel open unpaid order
    if (status === 'available') {
      const currentTable = await RestaurantTable.findOne(filter)
      if (currentTable?.activeOrderId) {
        await RestaurantOrder.updateOne(
          { _id: currentTable.activeOrderId, status: { $ne: 'paid' } },
          { status: 'cancelled' },
        )
      }
      update.activeOrderId = null
      update.activeOrderTotal = 0
      update.activeItemsCount = 0
      update.openedAt = null
    }

    const updated = await RestaurantTable.findOneAndUpdate(filter, update, { new: true }).lean()
    if (!updated) {
      return NextResponse.json({ error: 'Table not found' }, { status: 404 })
    }

    return NextResponse.json({
      table: {
        ...updated,
        id: String(updated._id),
        _id: undefined,
        activeOrderId: updated.activeOrderId ? String(updated.activeOrderId) : null,
      },
    })
  } catch (e) {
    console.error('PATCH /api/restaurant/tables/[id] error', e)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
