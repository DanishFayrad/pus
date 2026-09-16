import { NextResponse } from 'next/server'
import mongoose from 'mongoose'
import dbConnect from '../../../../../../lib/mongodb'
import { getSession } from '../../../../../../lib/auth'
import RestaurantTable from '../../../../../../models/RestaurantTable'
import RestaurantOrder from '../../../../../../models/RestaurantOrder'

export const runtime = 'nodejs'

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Security: Only cashier or admin can process payment
  if (session.role !== 'admin' && session.role !== 'cashier') {
    return NextResponse.json({ error: 'Permission denied: Only Cashier or Admin can process payment' }, { status: 403 })
  }

  try {
    const { id } = await params
    if (!mongoose.isValidObjectId(id)) {
      return NextResponse.json({ error: 'Invalid order id' }, { status: 400 })
    }

    const body = await req.json().catch(() => ({}))
    const paymentMethod = ['cash', 'credit', 'card', 'online'].includes(body.paymentMethod)
      ? body.paymentMethod
      : 'cash'

    await dbConnect()

    const order = await RestaurantOrder.findById(id)
    if (!order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    if (order.status === 'paid') {
      return NextResponse.json({ error: 'Order is already marked as paid' }, { status: 400 })
    }

    const splitNumber = body.splitNumber != null ? Number(body.splitNumber) : null

    if (splitNumber != null) {
      // Pay a specific split bill
      if (!Array.isArray(order.splitBills) || order.splitBills.length === 0) {
        return NextResponse.json({ error: 'No split bills found on this order' }, { status: 400 })
      }

      const targetSplit = order.splitBills.find((sb: any) => sb.splitNumber === splitNumber)
      if (!targetSplit) {
        return NextResponse.json({ error: `Split bill #${splitNumber} not found` }, { status: 404 })
      }

      if (targetSplit.status === 'paid') {
        return NextResponse.json({ error: `Split bill #${splitNumber} is already paid` }, { status: 400 })
      }

      targetSplit.status = 'paid'
      targetSplit.paymentMethod = paymentMethod
      targetSplit.paidAt = new Date()

      const allSplitsPaid = order.splitBills.every((sb: any) => sb.status === 'paid')

      let table = null
      if (allSplitsPaid) {
        order.status = 'paid'
        order.paymentMethod = paymentMethod
        order.cashierId = session.id
        order.cashierName = session.name
        order.paidAt = new Date()

        table = await RestaurantTable.findById(order.tableId)
        if (table) {
          table.status = 'cleaning'
          table.activeOrderId = null
          table.activeOrderTotal = 0
          table.activeItemsCount = 0
          await table.save()
        }
      } else {
        const remainingTotal = order.splitBills
          .filter((sb: any) => sb.status === 'unpaid')
          .reduce((sum: number, sb: any) => sum + (sb.total || 0), 0)

        table = await RestaurantTable.findById(order.tableId)
        if (table) {
          table.activeOrderTotal = remainingTotal
          table.status = 'billing'
          await table.save()
        }
      }

      await order.save()

      return NextResponse.json({
        order: {
          ...order.toJSON(),
          id: String(order._id),
          _id: undefined,
          tableId: String(order.tableId),
        },
        paidSplit: targetSplit,
        allSettled: allSplitsPaid,
        table: table ? table.toJSON() : null,
      })
    }

    // Full order payment
    order.status = 'paid'
    order.paymentMethod = paymentMethod
    order.cashierId = session.id
    order.cashierName = session.name
    order.paidAt = new Date()

    // If there were split bills, mark all unpaid split bills as paid too
    if (Array.isArray(order.splitBills)) {
      order.splitBills.forEach((sb: any) => {
        if (sb.status === 'unpaid') {
          sb.status = 'paid'
          sb.paymentMethod = paymentMethod
          sb.paidAt = new Date()
        }
      })
    }

    await order.save()

    // Update table status to cleaning (or paid)
    const table = await RestaurantTable.findById(order.tableId)
    if (table) {
      table.status = 'cleaning'
      table.activeOrderId = null
      table.activeOrderTotal = 0
      table.activeItemsCount = 0
      await table.save()
    }

    return NextResponse.json({
      order: {
        ...order.toJSON(),
        id: String(order._id),
        _id: undefined,
        tableId: String(order.tableId),
      },
      table: table ? table.toJSON() : null,
    })
  } catch (e) {
    console.error('POST /api/restaurant/orders/[id]/pay error', e)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
