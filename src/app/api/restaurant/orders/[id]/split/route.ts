import { NextResponse } from 'next/server'
import mongoose from 'mongoose'
import dbConnect from '../../../../../../lib/mongodb'
import { getSession } from '../../../../../../lib/auth'
import RestaurantOrder from '../../../../../../models/RestaurantOrder'

export const runtime = 'nodejs'

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { id } = await params
    if (!mongoose.isValidObjectId(id)) {
      return NextResponse.json({ error: 'Invalid order id' }, { status: 400 })
    }

    const body = await req.json().catch(() => ({}))
    const { splits } = body

    if (!Array.isArray(splits) || splits.length === 0) {
      return NextResponse.json({ error: 'splits array is required' }, { status: 400 })
    }

    await dbConnect()

    const order = await RestaurantOrder.findById(id)
    if (!order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    if (order.status === 'paid') {
      return NextResponse.json({ error: 'Cannot split an already paid order' }, { status: 400 })
    }

    // Process each split
    const splitBills = splits.map((s: any, idx: number) => {
      const items = Array.isArray(s.items) ? s.items : []
      const subtotal = items.reduce(
        (sum: number, it: any) => sum + (Number(it.price) || 0) * (Number(it.quantity) || 1),
        0,
      )
      const discount = Math.max(0, Number(s.discount) || 0)
      const total = Math.max(0, subtotal - discount)

      return {
        splitNumber: idx + 1,
        label: String(s.label || `Bill #${idx + 1}`).trim(),
        items: items.map((it: any) => ({
          name: String(it.name),
          price: Number(it.price),
          quantity: Number(it.quantity),
        })),
        subtotal,
        discount,
        total,
        status: s.status === 'paid' ? 'paid' : 'unpaid',
        paymentMethod: s.paymentMethod || 'cash',
        paidAt: s.status === 'paid' ? new Date() : undefined,
      }
    })

    order.splitBills = splitBills
    await order.save()

    return NextResponse.json({
      order: {
        ...order.toJSON(),
        id: String(order._id),
        _id: undefined,
        tableId: String(order.tableId),
      },
    })
  } catch (e) {
    console.error('POST /api/restaurant/orders/[id]/split error', e)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
