import { NextResponse } from 'next/server'
import mongoose from 'mongoose'
import dbConnect from '../../../../lib/mongodb'
import { getSession } from '../../../../lib/auth'
import RestaurantTable from '../../../../models/RestaurantTable'
import RestaurantOrder from '../../../../models/RestaurantOrder'

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

export async function GET(req: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { searchParams } = new URL(req.url)
    const tableId = searchParams.get('tableId')
    const status = searchParams.get('status')
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '50', 10)))

    await dbConnect()

    const filter: Record<string, any> = {}
    if (tableId) {
      if (mongoose.isValidObjectId(tableId)) {
        filter.tableId = tableId
      }
    }
    if (status && status !== 'all') {
      filter.status = status
    }

    const orders = await RestaurantOrder.find(filter)
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean()

    const formatted = orders.map((o: any) => ({
      ...o,
      id: String(o._id),
      _id: undefined,
      tableId: String(o.tableId),
    }))

    return NextResponse.json({ orders: formatted })
  } catch (e) {
    console.error('GET /api/restaurant/orders error', e)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body = await req.json().catch(() => null)
    if (!body || (!body.tableId && !body.tableNumber)) {
      return NextResponse.json({ error: 'tableId or tableNumber is required' }, { status: 400 })
    }

    await dbConnect()

    // Find table
    const tableFilter = body.tableId && mongoose.isValidObjectId(body.tableId)
      ? { _id: body.tableId }
      : { tableNumber: String(body.tableNumber || body.tableId).toUpperCase() }

    const table = await RestaurantTable.findOne(tableFilter)
    if (!table) {
      return NextResponse.json({ error: 'Table not found' }, { status: 404 })
    }

    const incomingItems = Array.isArray(body.items) ? body.items : []

    // Check if table already has an active open order
    let existingOrder = null
    if (table.activeOrderId) {
      existingOrder = await RestaurantOrder.findOne({
        _id: table.activeOrderId,
        status: { $in: ['open', 'billing'] },
      })
    }

    if (existingOrder) {
      // SCENARIO: Adding items to an existing open table order
      const currentRound = existingOrder.items.reduce((max: number, i: any) => Math.max(max, i.round || 1), 1)
      const nextRound = incomingItems.length > 0 ? currentRound + 1 : currentRound

      const newItems = incomingItems.map((item: any) => ({
        productId: String(item.productId || `item-${Date.now()}`),
        name: String(item.name || 'Item').trim(),
        category: String(item.category || 'General').trim(),
        price: Math.max(0, Number(item.price) || 0),
        quantity: Math.max(1, Number(item.quantity) || 1),
        notes: String(item.notes || '').trim(),
        round: nextRound,
        addedAt: new Date(),
      }))

      existingOrder.items.push(...newItems)

      if (body.notes !== undefined) {
        existingOrder.notes = String(body.notes).trim()
      }
      if (body.discount !== undefined) {
        existingOrder.discount = Math.max(0, Number(body.discount) || 0)
      }
      if (body.discountType) {
        existingOrder.discountType = body.discountType === 'percent' ? 'percent' : 'fixed'
      }

      const { subtotal, discount, tax, total } = calculateTotals(
        existingOrder.items,
        existingOrder.discount,
        existingOrder.discountType,
        existingOrder.tax,
      )

      existingOrder.subtotal = subtotal
      existingOrder.discount = discount
      existingOrder.tax = tax
      existingOrder.total = total

      // Update waiter/cashier identity if provided
      if (body.waiterName !== undefined && String(body.waiterName).trim()) {
        existingOrder.waiterName = String(body.waiterName).trim()
      } else if (!existingOrder.waiterName && session.name) {
        existingOrder.waiterId = session.id
        existingOrder.waiterName = session.name
      }

      await existingOrder.save()

      // Update table
      const itemsCount = existingOrder.items.reduce((sum: number, i: any) => sum + i.quantity, 0)
      table.status = 'occupied'
      table.activeOrderTotal = total
      table.activeItemsCount = itemsCount
      await table.save()

      return NextResponse.json({
        order: {
          ...existingOrder.toJSON(),
          id: String(existingOrder._id),
          _id: undefined,
          tableId: String(existingOrder.tableId),
        },
        table: table.toJSON(),
      })
    }

    // SCENARIO: Creating a brand new order for the table
    if (incomingItems.length === 0) {
      return NextResponse.json({ error: 'Order must contain at least one item' }, { status: 400 })
    }

    const orderNumber = `RO-${Date.now().toString().slice(-6)}`
    const orderItems = incomingItems.map((item: any) => ({
      productId: String(item.productId || `item-${Date.now()}`),
      name: String(item.name || 'Item').trim(),
      category: String(item.category || 'General').trim(),
      price: Math.max(0, Number(item.price) || 0),
      quantity: Math.max(1, Number(item.quantity) || 1),
      notes: String(item.notes || '').trim(),
      round: 1,
      addedAt: new Date(),
    }))

    const discountVal = Math.max(0, Number(body.discount) || 0)
    const discountType = body.discountType === 'percent' ? 'percent' : 'fixed'
    const taxVal = Math.max(0, Number(body.tax) || 0)

    const { subtotal, discount, tax, total } = calculateTotals(orderItems, discountVal, discountType, taxVal)

    const newOrder = await RestaurantOrder.create({
      orderNumber,
      tableId: table._id,
      tableName: table.tableNumber,
      section: table.section,
      waiterId: session.id,
      waiterName: body.waiterName !== undefined && String(body.waiterName).trim() ? String(body.waiterName).trim() : (session.name || 'Staff'),
      status: 'open',
      items: orderItems,
      notes: String(body.notes || '').trim(),
      subtotal,
      discount,
      discountType,
      tax,
      total,
      paymentMethod: 'cash',
    })

    const itemsCount = orderItems.reduce((sum: number, i: any) => sum + i.quantity, 0)
    table.status = 'occupied'
    table.activeOrderId = newOrder._id
    table.activeOrderTotal = total
    table.activeItemsCount = itemsCount
    table.openedAt = new Date()
    await table.save()

    return NextResponse.json(
      {
        order: {
          ...newOrder.toJSON(),
          id: String(newOrder._id),
          _id: undefined,
          tableId: String(newOrder.tableId),
        },
        table: table.toJSON(),
      },
      { status: 201 },
    )
  } catch (e) {
    console.error('POST /api/restaurant/orders error', e)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
