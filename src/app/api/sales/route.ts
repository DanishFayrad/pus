import { NextResponse } from 'next/server'
import dbConnect from '../../../lib/mongodb'
import Product from '../../../models/Product'
import Sale from '../../../models/Sale'

export const runtime = 'nodejs'

interface IncomingItem {
  productId: string
  quantity: number
}

export async function GET() {
  try {
    await dbConnect()
    const sales = await Sale.find().sort({ date: -1 }).limit(500)
    return NextResponse.json({ sales: sales.map((s) => s.toJSON()) })
  } catch (e) {
    console.error('GET /sales error', e)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null)
    if (!body || !Array.isArray(body.items) || body.items.length === 0) {
      return NextResponse.json({ error: 'items required' }, { status: 400 })
    }
    if (!body.cashier || !body.cashier.id || !body.cashier.name) {
      return NextResponse.json({ error: 'cashier required' }, { status: 400 })
    }

    await dbConnect()

    const incoming: IncomingItem[] = body.items.map((i: { productId: string; quantity: number }) => ({
      productId: String(i.productId),
      quantity: Math.max(1, Number(i.quantity) || 1),
    }))

    const products = await Product.find({ _id: { $in: incoming.map((i) => i.productId) } })
    const byId = new Map(products.map((p) => [String(p._id), p]))

    const saleItems = []
    for (const line of incoming) {
      const p = byId.get(line.productId)
      if (!p) return NextResponse.json({ error: `Product not found: ${line.productId}` }, { status: 404 })
      if (p.stock < line.quantity) {
        return NextResponse.json({ error: `Not enough stock for ${p.name}` }, { status: 409 })
      }
      saleItems.push({
        productId: String(p._id),
        name: p.name,
        barcode: p.barcode,
        price: p.price,
        cost: p.cost,
        quantity: line.quantity,
      })
    }

    const total = saleItems.reduce((s, i) => s + i.price * i.quantity, 0)
    const cost = saleItems.reduce((s, i) => s + i.cost * i.quantity, 0)

    const sale = await Sale.create({
      date: new Date(),
      cashierId: String(body.cashier.id),
      cashierName: String(body.cashier.name),
      items: saleItems,
      total,
      cost,
      profit: total - cost,
    })

    // Decrement stock
    await Promise.all(
      saleItems.map((i) =>
        Product.findByIdAndUpdate(i.productId, { $inc: { stock: -i.quantity } }),
      ),
    )

    return NextResponse.json({ sale: sale.toJSON() }, { status: 201 })
  } catch (e) {
    console.error('POST /sales error', e)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
