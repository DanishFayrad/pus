import { NextResponse } from 'next/server'
import mongoose from 'mongoose'
import dbConnect from '../../../../../lib/mongodb'
import { getSession } from '../../../../../lib/auth'
import RestaurantTable from '../../../../../models/RestaurantTable'
import RestaurantOrder from '../../../../../models/RestaurantOrder'

export const runtime = 'nodejs'

function calculateTotals(items: any[], discount = 0, discountType = 'fixed', tax = 0) {
  const subtotal = items.reduce((acc, item) => acc + (Number(item.price) || 0) * (Number(item.quantity) || 1), 0)
  let disc = Number(discount) || 0
  if (discountType === 'percent') {
    disc = Math.round((subtotal * disc) / 100)
  }
  const taxable = Math.max(0, subtotal - disc)
  const total = Math.max(0, taxable + (Number(tax) || 0))
  return { subtotal, discount: disc, tax: Number(tax) || 0, total }
}

export async function GET(
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

    await dbConnect()
    const order = await RestaurantOrder.findById(id).lean()
    if (!order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    return NextResponse.json({
      order: {
        ...order,
        id: String(order._id),
        _id: undefined,
        tableId: String(order.tableId),
      },
    })
  } catch (e) {
    console.error('GET /api/restaurant/orders/[id] error', e)
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
    if (!mongoose.isValidObjectId(id)) {
      return NextResponse.json({ error: 'Invalid order id' }, { status: 400 })
    }

    const body = await req.json().catch(() => ({}))
    await dbConnect()

    const order = await RestaurantOrder.findById(id)
    if (!order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    // STRICT FINANCIAL RULE: Once a bill is paid, cannot edit items or totals
    if (order.status === 'paid') {
      return NextResponse.json(
        { error: 'Cannot modify a paid order. Financial history is locked.' },
        { status: 400 },
      )
    }

    // Update items if provided
    if (Array.isArray(body.items)) {
      order.items = body.items.map((item: any) => ({
        productId: String(item.productId || `item-${Date.now()}`),
        name: String(item.name || 'Item').trim(),
        category: String(item.category || 'General').trim(),
        price: Math.max(0, Number(item.price) || 0),
        quantity: Math.max(1, Number(item.quantity) || 1),
        notes: String(item.notes || '').trim(),
        round: Number(item.round) || 1,
        addedAt: item.addedAt ? new Date(item.addedAt) : new Date(),
      }))
    }

    if (body.notes !== undefined) {
      order.notes = String(body.notes).trim()
    }

    if (body.waiterName !== undefined) {
      order.waiterName = String(body.waiterName).trim()
    }

    if (body.discount !== undefined) {
      order.discount = Math.max(0, Number(body.discount) || 0)
    }

    if (body.discountType !== undefined) {
      order.discountType = body.discountType === 'percent' ? 'percent' : 'fixed'
    }

    if (body.tax !== undefined) {
      order.tax = Math.max(0, Number(body.tax) || 0)
    }

    if (body.paymentMethod !== undefined) {
      order.paymentMethod = String(body.paymentMethod)
    }

    // Status transition: e.g. change to 'billing' or 'cancelled'
    if (body.status && ['open', 'billing', 'cancelled'].includes(body.status)) {
      order.status = body.status
    }

    const { subtotal, discount, tax, total } = calculateTotals(
      order.items,
      order.discount,
      order.discountType,
      order.tax,
    )

    order.subtotal = subtotal
    order.discount = discount
    order.tax = tax
    order.total = total

    await order.save()

    // Update table info
    const table = await RestaurantTable.findById(order.tableId)
    if (table) {
      if (order.status === 'cancelled' || order.items.length === 0) {
        order.status = 'cancelled'
        await order.save()
        table.status = 'available'
        table.activeOrderId = null
        table.activeOrderTotal = 0
        table.activeItemsCount = 0
      } else {
        const itemsCount = order.items.reduce((sum: number, i: any) => sum + i.quantity, 0)
        table.activeOrderTotal = total
        table.activeItemsCount = itemsCount
        if (order.status === 'billing') {
          table.status = 'billing'
        }
      }
      await table.save()
    }

    return NextResponse.json({
      order: {
        ...order.toJSON(),
        id: String(order._id),
        _id: undefined,
        tableId: String(order.tableId),
      },
    })
  } catch (e) {
    console.error('PATCH /api/restaurant/orders/[id] error', e)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
