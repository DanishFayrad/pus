import { NextResponse } from 'next/server'
import dbConnect from '../../../../lib/mongodb'
import { getSession } from '../../../../lib/auth'
import MenuItem from '../../../../models/MenuItem'
import Product from '../../../../models/Product'
import { getUnifiedMenuCategories } from '../../../../lib/restaurantMenu'

export const runtime = 'nodejs'

export async function GET(req: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { searchParams } = new URL(req.url)
    const category = searchParams.get('category')
    const query = searchParams.get('q')

    await dbConnect()

    const menuFilter: Record<string, any> = { enabled: true }
    const productFilter: Record<string, any> = {}

    if (category && category !== 'All') {
      const escaped = category.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      menuFilter.category = { $regex: new RegExp(`^${escaped}$`, 'i') }
      productFilter.category = { $regex: new RegExp(`^${escaped}$`, 'i') }
    }

    if (query && query.trim()) {
      const escapedQuery = query.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      menuFilter.name = { $regex: escapedQuery, $options: 'i' }
      productFilter.$or = [
        { name: { $regex: escapedQuery, $options: 'i' } },
        { barcode: { $regex: escapedQuery, $options: 'i' } },
        { category: { $regex: escapedQuery, $options: 'i' } },
      ]
    }

    const [menuDocs, productDocs] = await Promise.all([
      MenuItem.find(menuFilter).sort({ category: 1, name: 1 }).lean().catch(() => []),
      Product.find(productFilter).sort({ category: 1, name: 1 }).lean().catch(() => []),
    ])

    const seenNames = new Set<string>()
    const formatted: any[] = []

    // 1. Add customized MenuItems first
    for (const m of (menuDocs as any[])) {
      const nameKey = (m.name || '').trim().toLowerCase()
      if (nameKey) seenNames.add(nameKey)
      formatted.push({
        id: String(m._id),
        name: m.name,
        category: m.category || 'General',
        price: Number(m.price) || 0,
        emoji: m.emoji || '🍽️',
        enabled: m.enabled !== false,
      })
    }

    // 2. Add live products from Product collection (Biscuits, Bottles, Candy, etc.)
    for (const p of (productDocs as any[])) {
      const nameKey = (p.name || '').trim().toLowerCase()
      if (seenNames.has(nameKey)) continue
      seenNames.add(nameKey)

      formatted.push({
        id: String(p._id),
        name: p.name,
        category: p.category || 'General',
        price: Number(p.price) || 0,
        barcode: p.barcode,
        stock: p.stock,
        emoji: '🍽️',
        enabled: true,
      })
    }

    // Sort by category then name
    formatted.sort((a, b) => {
      const catCompare = (a.category || '').localeCompare(b.category || '', undefined, { sensitivity: 'base' })
      if (catCompare !== 0) return catCompare
      return (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' })
    })

    // Unified distinct categories from MenuItem and Product
    const categories = await getUnifiedMenuCategories()

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

    const categories = await getUnifiedMenuCategories()

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
