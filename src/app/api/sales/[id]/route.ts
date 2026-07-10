import { NextResponse } from 'next/server'
import mongoose from 'mongoose'
import dbConnect from '../../../../lib/mongodb'
import { getSession } from '../../../../lib/auth'
import Sale from '../../../../models/Sale'

export const runtime = 'nodejs'

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  if (!mongoose.isValidObjectId(id)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
  }

  try {
    await dbConnect()
    // Deleting only removes the sale record. It does NOT restore stock — the original
    // checkout already decremented stock, and that decrement stands. This is intentional:
    // delete is for correcting bad data, not for undoing a transaction. If a sale truly
    // needs to be reversed (refund/void), use the returns flow which adjusts stock.
    const deleted = await Sale.findByIdAndDelete(id)
    if (!deleted) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('DELETE /sales/[id] error', e)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  if (!mongoose.isValidObjectId(id)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
  }

  try {
    const body = await req.json().catch(() => null)
    if (!body) {
      return NextResponse.json({ error: 'Body required' }, { status: 400 })
    }

    if (body.creditStatus !== undefined && !['unpaid', 'paid'].includes(body.creditStatus)) {
      return NextResponse.json({ error: 'Invalid creditStatus' }, { status: 400 })
    }
    if (body.paymentMethod !== undefined && !['cash', 'credit'].includes(body.paymentMethod)) {
      return NextResponse.json({ error: 'Invalid paymentMethod' }, { status: 400 })
    }

    // Cashiers settle credit from the Credit Book, so creditStatus and customer details stay
    // open to them. Switching paymentMethod rewrites what kind of sale this was and would drop
    // a bill out of the credit book entirely, so that stays with admins.
    if (body.paymentMethod !== undefined && session.role !== 'admin') {
      return NextResponse.json({ error: 'Only an admin can change the payment method' }, { status: 403 })
    }

    await dbConnect()
    const sale = await Sale.findById(id)
    if (!sale) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    if (body.creditStatus !== undefined) {
      sale.creditStatus = body.creditStatus
    }
    if (body.customerName !== undefined) {
      sale.customerName = String(body.customerName).trim()
    }
    if (body.customerPhone !== undefined) {
      sale.customerPhone = String(body.customerPhone).trim()
    }
    if (body.paymentMethod !== undefined) {
      sale.paymentMethod = body.paymentMethod
    }

    await sale.save()
    return NextResponse.json({ sale: sale.toJSON() })
  } catch (e) {
    console.error('PUT /sales/[id] error', e)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
