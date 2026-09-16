import { NextResponse } from 'next/server'
import dbConnect from '../../../../lib/mongodb'
import { getSession } from '../../../../lib/auth'
import MenuItem from '../../../../models/MenuItem'

export const runtime = 'nodejs'

export async function GET(req: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { searchParams } = new URL(req.url)
    const category = searchParams.get('category')
    const query = searchParams.get('q')

    await dbConnect()

    const filter: Record<string, any> = { enabled: true }
    if (category && category !== 'All') {
      filter.category = category
    }
    if (query && query.trim()) {
      filter.name = { $regex: query.trim(), $options: 'i' }
    }

    const items = await MenuItem.find(filter).sort({ category: 1, name: 1 }).lean()

    const formatted = items.map((i: any) => ({
      ...i,
      id: String(i._id),
      _id: undefined,
    }))

    // Dynamically query all distinct categories from MenuItem collection
    const menuCats = await MenuItem.distinct('category', { enabled: true })
    const allCatsSet = new Set<string>()
    menuCats.forEach((c: any) => c && allCatsSet.add(String(c).trim()))
    const categories = Array.from(allCatsSet).sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: 'base' }),
    )

    return NextResponse.json({
      items: formatted,
      categories: ['All', ...categories],
    })
  } catch (e) {
    console.error('GET /api/restaurant/menu error', e)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.role !== 'admin' && session.role !== 'cashier') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const body = await req.json().catch(() => ({}))
    const name = String(body.name || '').trim()
    const category = String(body.category || '').trim()
    const price = Number(body.price)
    const emoji = String(body.emoji || '🍽️').trim()

    if (!name) {
      return NextResponse.json({ error: 'Item name is required' }, { status: 400 })
    }
    if (!category) {
      return NextResponse.json({ error: 'Category is required' }, { status: 400 })
    }
    if (isNaN(price) || price < 0) {
      return NextResponse.json({ error: 'Valid price (positive number) is required' }, { status: 400 })
    }

    await dbConnect()
    const item = await MenuItem.create({
      name,
      category,
      price,
      emoji: emoji || '🍽️',
      enabled: true,
    })

    const menuCats = await MenuItem.distinct('category', { enabled: true })
    const allCatsSet = new Set<string>()
    menuCats.forEach((c: any) => c && allCatsSet.add(String(c).trim()))
    const categories = Array.from(allCatsSet).sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: 'base' }),
    )

    return NextResponse.json(
      {
        item: {
          ...item.toJSON(),
          id: String(item._id),
          _id: undefined,
        },
        categories: ['All', ...categories],
      },
      { status: 201 },
    )
  } catch (e) {
    console.error('POST /api/restaurant/menu error', e)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
