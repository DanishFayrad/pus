import { NextResponse } from 'next/server'
import dbConnect from '../../../lib/mongodb'
import Product from '../../../models/Product'
import User from '../../../models/User'
import { mockProducts, mockUsers } from '../../../data/mockData'

export const runtime = 'nodejs'

/**
 * POST /api/seed
 * Requires header `x-seed-secret: <SEED_SECRET env value>`.
 * Idempotent:
 *   - inserts products that don't exist (by barcode)
 *   - inserts users that don't exist (by username)
 *   - migrates plaintext user passwords to bcrypt hashes
 */
export async function POST(req: Request) {
  const expected = process.env.SEED_SECRET
  const provided = req.headers.get('x-seed-secret')
  if (!expected || !provided || provided !== expected) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    await dbConnect()

    let productsInserted = 0
    for (const p of mockProducts) {
      const exists = await Product.findOne({ barcode: p.barcode })
      if (!exists) {
        await Product.create({
          barcode: p.barcode,
          name: p.name,
          price: p.price,
          cost: p.cost,
          stock: p.stock,
        })
        productsInserted++
      }
    }

    let usersInserted = 0
    let usersMigrated = 0
    for (const u of mockUsers) {
      const existing = await User.findOne({ username: u.username.toLowerCase() })
      if (!existing) {
        // Pre-save hook hashes the plaintext from mockData.
        await User.create({
          username: u.username.toLowerCase(),
          password: u.password,
          name: u.name,
          role: u.role,
        })
        usersInserted++
      } else if (!existing.password.startsWith('$2')) {
        // Legacy plaintext password — migrate to bcrypt.
        existing.password = u.password
        await existing.save() // pre-save hook will hash
        usersMigrated++
      }
    }

    return NextResponse.json({
      ok: true,
      productsInserted,
      usersInserted,
      usersMigrated,
      totalProducts: await Product.countDocuments(),
      totalUsers: await User.countDocuments(),
    })
  } catch (e) {
    console.error('POST /seed error', e)
    return NextResponse.json({ error: 'Server error', details: String(e) }, { status: 500 })
  }
}
