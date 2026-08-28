import { NextResponse } from 'next/server'
import mongoose from 'mongoose'
import dbConnect from '../../../../lib/mongodb'
import { getSession } from '../../../../lib/auth'
import Sale from '../../../../models/Sale'
import Product from '../../../../models/Product'
import ReturnRequest from '../../../../models/ReturnRequest'

export const runtime = 'nodejs'

interface ReturnItemPayload {
  productId: string
  quantity: number
}

export async function POST(req: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body = await req.json().catch(() => null)
    if (!body || !body.saleId || !Array.isArray(body.items) || body.items.length === 0) {
      return NextResponse.json({ error: 'saleId and items array are required' }, { status: 400 })
    }

    const { saleId, items } = body as { saleId: string; items: ReturnItemPayload[]; reason?: string }

    if (!mongoose.isValidObjectId(saleId)) {
      return NextResponse.json({ error: 'Invalid saleId' }, { status: 400 })
    }

    await dbConnect()

    const sale = await Sale.findById(saleId)
    if (!sale) {
      return NextResponse.json({ error: 'Sale / Invoice not found' }, { status: 404 })
    }

    // Validate quantities against the original sale
    const processedItems: {
      productId: string
      productName: string
      barcode: string
      price: number
      quantity: number
      refund: number
    }[] = []

    let totalRefund = 0

    for (const retItem of items) {
      const qty = Number(retItem.quantity)
      if (qty <= 0) continue

      const saleLine = sale.items.find((i: { productId: string; quantity: number }) => String(i.productId) === String(retItem.productId))
      if (!saleLine) {
        return NextResponse.json({ error: `Item ${retItem.productId} not found in this sale` }, { status: 400 })
      }

      if (qty > saleLine.quantity) {
        return NextResponse.json(
          { error: `Return quantity (${qty}) exceeds purchased quantity (${saleLine.quantity}) for ${saleLine.name}` },
          { status: 400 }
        )
      }

      // Restock the product in inventory
      await Product.findByIdAndUpdate(retItem.productId, {
        $inc: { stock: qty },
      })

      // Create approved return record
      await ReturnRequest.create({
        productId: retItem.productId,
        productName: saleLine.name,
        quantity: qty,
        cashierId: session.id,
        cashierName: session.name,
        status: 'approved',
      })

      const lineRefund = saleLine.price * qty
      totalRefund += lineRefund

      processedItems.push({
        productId: retItem.productId,
        productName: saleLine.name,
        barcode: saleLine.barcode,
        price: saleLine.price,
        quantity: qty,
        refund: lineRefund,
      })
    }

    if (processedItems.length === 0) {
      return NextResponse.json({ error: 'No valid items to return' }, { status: 400 })
    }

    return NextResponse.json({
      ok: true,
      saleId: sale._id.toString(),
      receiptNo: `#${sale._id.toString().slice(-8).toUpperCase()}`,
      items: processedItems,
      totalRefund,
      cashierName: session.name,
      customerName: sale.customerName || '',
      paymentMethod: sale.paymentMethod,
      returnDate: new Date().toISOString(),
    })
  } catch (e) {
    console.error('POST /api/returns/process error', e)
    return NextResponse.json({ error: 'Server error', details: String(e) }, { status: 500 })
  }
}
