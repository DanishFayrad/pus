import { NextResponse } from 'next/server'
import mongoose from 'mongoose'
import dbConnect from '../../../../../lib/mongodb'
import { getSession } from '../../../../../lib/auth'
import MenuItem from '../../../../../models/MenuItem'
import Product from '../../../../../models/Product'
import { getUnifiedMenuCategories } from '../../../../../lib/restaurantMenu'

export const runtime = 'nodejs'

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.role !== 'admin' && session.role !== 'cashier') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const { id } = await params
    if (!mongoose.isValidObjectId(id)) {
      return NextResponse.json({ error: 'Invalid item id' }, { status: 400 })
    }

    const body = await req.json().catch(() => ({}))
    await dbConnect()

    let item = await MenuItem.findById(id)
    if (!item) {
      // Check if it's a product from Product collection
      const prod = await Product.findById(id)
      if (prod) {
        if (body.name !== undefined) prod.name = String(body.name).trim()
        if (body.category !== undefined) prod.category = String(body.category).trim()
        if (body.price !== undefined) {
          const p = Number(body.price)
          if (!isNaN(p) && p >= 0) prod.price = p
        }
        await prod.save()
        const categories = await getUnifiedMenuCategories()
        return NextResponse.json({
          item: {
            id: String(prod._id),
            name: prod.name,
            category: prod.category,
            price: prod.price,
            barcode: prod.barcode,
            stock: prod.stock,
            enabled: true,
          },
          categories: ['All', ...categories],
        })
      }
      return NextResponse.json({ error: 'Item not found' }, { status: 404 })
    }

    if (body.name !== undefined) item.name = String(body.name).trim()
    if (body.category !== undefined) item.category = String(body.category).trim()
    if (body.price !== undefined) {
      const p = Number(body.price)
      if (!isNaN(p) && p >= 0) item.price = p
    }
    if (body.emoji !== undefined) item.emoji = String(body.emoji).trim() || '🍽️'
    if (body.enabled !== undefined) item.enabled = Boolean(body.enabled)

    await item.save()
    const categories = await getUnifiedMenuCategories()

    return NextResponse.json({
      item: {
        ...item.toJSON(),
        id: String(item._id),
        _id: undefined,
      },
      categories: ['All', ...categories],
    })
  } catch (e) {
    console.error('PATCH /api/restaurant/menu/[id] error', e)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const { id } = await params
    if (!mongoose.isValidObjectId(id)) {
      return NextResponse.json({ error: 'Invalid item id' }, { status: 400 })
    }

    await dbConnect()
    const deletedItem = await MenuItem.findByIdAndDelete(id)
    if (!deletedItem) {
      await Product.findByIdAndDelete(id)
    }
    const categories = await getUnifiedMenuCategories()

    return NextResponse.json({
      ok: true,
      categories: ['All', ...categories],
    })
  } catch (e) {
    console.error('DELETE /api/restaurant/menu/[id] error', e)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
