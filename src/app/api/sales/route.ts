import { NextResponse } from 'next/server'
import mongoose from 'mongoose'
import dbConnect from '../../../lib/mongodb'
import { getSession } from '../../../lib/auth'
import Product from '../../../models/Product'
import Sale from '../../../models/Sale'

export const runtime = 'nodejs'

interface IncomingItem {
  productId: string
  quantity: number
}

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    await dbConnect()
    const sales = await Sale.find().sort({ date: -1 })
    return NextResponse.json({ sales: sales.map((s) => s.toJSON()) })
  } catch (e) {
    console.error('GET /sales error', e)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body = await req.json().catch(() => null)
    if (!body || !Array.isArray(body.items) || body.items.length === 0) {
      return NextResponse.json({ error: 'items required' }, { status: 400 })
    }

    await dbConnect()

    const incoming: IncomingItem[] = body.items.map((i: { productId: string; quantity: number }) => ({
      productId: String(i.productId),
      quantity: Math.max(1, Number(i.quantity) || 1),
    }))

    // Two lines for the same product must be summed before the stock check, otherwise each
    // line passes independently while their combined decrement oversells the product.
    const merged = new Map<string, number>()
    for (const line of incoming) {
      if (!mongoose.isValidObjectId(line.productId)) {
        return NextResponse.json({ error: `Invalid product id: ${line.productId}` }, { status: 400 })
      }
      merged.set(line.productId, (merged.get(line.productId) || 0) + line.quantity)
    }

    const products = await Product.find({ _id: { $in: [...merged.keys()] } })
    const byId = new Map(products.map((p) => [String(p._id), p]))

    const saleItems = []
    for (const [productId, quantity] of merged) {
      const p = byId.get(productId)
      if (!p) return NextResponse.json({ error: `Product not found: ${productId}` }, { status: 404 })
      saleItems.push({
        productId,
        name: p.name,
        barcode: p.barcode,
        price: p.price,
        cost: p.cost,
        quantity,
      })
    }

    const total = saleItems.reduce((s, i) => s + i.price * i.quantity, 0)
    const cost = saleItems.reduce((s, i) => s + i.cost * i.quantity, 0)

    const paymentMethod = body.paymentMethod === 'credit' ? 'credit' : 'cash'
    const customerName = String(body.customerName || '').trim()
    const customerPhone = String(body.customerPhone || '').trim()

    if (paymentMethod === 'credit' && !customerName) {
      return NextResponse.json({ error: 'Customer name is required for credit sales' }, { status: 400 })
    }

    // Reserve stock before writing the sale. Each update is conditional on there still being
    // enough stock, so two concurrent checkouts cannot both pass the same check and oversell.
    // Any line that fails rolls back the lines already taken.
    const reserved: typeof saleItems = []
    for (const i of saleItems) {
      const ok = await Product.findOneAndUpdate(
        { _id: i.productId, stock: { $gte: i.quantity } },
        { $inc: { stock: -i.quantity } },
      )
      if (!ok) {
        await Promise.all(
          reserved.map((r) => Product.findByIdAndUpdate(r.productId, { $inc: { stock: r.quantity } })),
        )
        return NextResponse.json({ error: `Not enough stock for ${i.name}` }, { status: 409 })
      }
      reserved.push(i)
    }

    try {
      // Cashier identity is taken from the verified session, NOT from the request body.
      const sale = await Sale.create({
        date: new Date(),
        cashierId: session.id,
        cashierName: session.name,
        items: saleItems,
        total,
        cost,
        profit: total - cost,
        paymentMethod,
        customerName,
        customerPhone,
        creditStatus: paymentMethod === 'credit' ? 'unpaid' : undefined,
      })
      return NextResponse.json({ sale: sale.toJSON() }, { status: 201 })
    } catch (e) {
      // The sale never landed — give the reserved stock back rather than leaking it.
      await Promise.all(
        reserved.map((r) => Product.findByIdAndUpdate(r.productId, { $inc: { stock: r.quantity } })),
      )
      throw e
    }
  } catch (e) {
    console.error('POST /sales error', e)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
