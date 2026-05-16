import { NextResponse } from 'next/server'
import mongoose from 'mongoose'
import dbConnect from '../../../../lib/mongodb'
import Product from '../../../../models/Product'

export const runtime = 'nodejs'

type Ctx = { params: Promise<{ id: string }> }

export async function PUT(req: Request, { params }: Ctx) {
  try {
    const { id } = await params
    if (!mongoose.isValidObjectId(id)) {
      return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
    }
    const body = await req.json().catch(() => null)
    if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })

    await dbConnect()

    if (body.barcode) {
      const dupe = await Product.findOne({
        barcode: String(body.barcode).trim(),
        _id: { $ne: id },
      })
      if (dupe) return NextResponse.json({ error: 'Barcode already exists' }, { status: 409 })
    }

    const patch: Record<string, unknown> = {}
    if (body.barcode !== undefined) patch.barcode = String(body.barcode).trim()
    if (body.name !== undefined) patch.name = String(body.name).trim()
    if (body.price !== undefined) patch.price = Number(body.price)
    if (body.cost !== undefined) patch.cost = Number(body.cost)
    if (body.stock !== undefined) patch.stock = Number(body.stock)

    const updated = await Product.findByIdAndUpdate(id, patch, { new: true })
    if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    return NextResponse.json({ product: updated.toJSON() })
  } catch (e) {
    console.error('PUT /products/:id error', e)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  try {
    const { id } = await params
    if (!mongoose.isValidObjectId(id)) {
      return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
    }
    await dbConnect()
    const deleted = await Product.findByIdAndDelete(id)
    if (!deleted) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('DELETE /products/:id error', e)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
