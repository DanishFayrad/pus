import { NextResponse } from 'next/server'
import dbConnect from '../../../lib/mongodb'
import { getSession } from '../../../lib/auth'
import Product from '../../../models/Product'

export const runtime = 'nodejs'

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    await dbConnect()
    const products = await Product.find().sort({ name: 1 })
    return NextResponse.json({ products: products.map((p) => p.toJSON()) })
  } catch (e) {
    console.error('GET /products error', e)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  try {
    const body = await req.json().catch(() => null)
    if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })

    const { barcode, name, price, cost, stock } = body
    if (!barcode || !name) {
      return NextResponse.json({ error: 'barcode and name required' }, { status: 400 })
    }

    await dbConnect()
    const existing = await Product.findOne({ barcode: String(barcode).trim() })
    if (existing) {
      return NextResponse.json({ error: 'Barcode already exists' }, { status: 409 })
    }

    const created = await Product.create({
      barcode: String(barcode).trim(),
      name: String(name).trim(),
      price: Number(price) || 0,
      cost: Number(cost) || 0,
      stock: Number(stock) || 0,
    })
    return NextResponse.json({ product: created.toJSON() }, { status: 201 })
  } catch (e) {
    console.error('POST /products error', e)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
