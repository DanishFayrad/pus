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
