import { NextResponse } from 'next/server'
import dbConnect from '../../../lib/mongodb'
import { getSession } from '../../../lib/auth'
import ReturnRequest from '../../../models/ReturnRequest'

export const runtime = 'nodejs'

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    await dbConnect()
    let requests
    if (session.role === 'admin') {
      requests = await ReturnRequest.find().sort({ createdAt: -1 }).lean()
    } else {
      requests = await ReturnRequest.find({ cashierId: session.id }).sort({ createdAt: -1 }).lean()
    }
    return NextResponse.json({
      returnRequests: requests.map((r: any) => ({
        ...r,
        id: String(r._id),
        _id: undefined,
      })),
    })
  } catch (e) {
    console.error('GET /returns error', e)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body = await req.json().catch(() => null)
    if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })

    const { productId, productName, quantity } = body
    if (!productId || !productName || quantity <= 0) {
      return NextResponse.json({ error: 'Invalid return data' }, { status: 400 })
    }

    await dbConnect()

    const created = await ReturnRequest.create({
      productId,
      productName,
      quantity: Number(quantity),
      cashierId: session.id,
      cashierName: session.name,
      status: 'pending',
    })
    return NextResponse.json({ returnRequest: created.toJSON() }, { status: 201 })
  } catch (e) {
    console.error('POST /returns error', e)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
