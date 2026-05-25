import { NextResponse } from 'next/server'
import mongoose from 'mongoose'
import dbConnect from '../../../../lib/mongodb'
import { getSession } from '../../../../lib/auth'
import ReturnRequest from '../../../../models/ReturnRequest'
import Product from '../../../../models/Product'

export const runtime = 'nodejs'

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  if (!mongoose.isValidObjectId(id)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
  }

  try {
    const body = await req.json().catch(() => null)
    if (!body || !['approved', 'rejected'].includes(body.status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
    }

    await dbConnect()
    const request = await ReturnRequest.findById(id)
    if (!request) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (request.status !== 'pending') return NextResponse.json({ error: 'Already processed' }, { status: 400 })

    request.status = body.status
    await request.save()

    if (body.status === 'approved') {
      await Product.findByIdAndUpdate(request.productId, {
        $inc: { stock: request.quantity },
      })
    }

    return NextResponse.json({ returnRequest: request.toJSON() })
  } catch (e) {
    console.error('PUT /returns/[id] error', e)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

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
    // Deleting only removes the record. It does NOT reverse stock — an already-approved
    // return has already adjusted stock, and that adjustment stands.
    const deleted = await ReturnRequest.findByIdAndDelete(id)
    if (!deleted) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('DELETE /returns/[id] error', e)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
