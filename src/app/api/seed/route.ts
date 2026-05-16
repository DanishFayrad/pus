import { NextResponse } from 'next/server'
import dbConnect from '../../../lib/mongodb'
import Product from '../../../models/Product'
import User from '../../../models/User'
import { mockProducts, mockUsers } from '../../../data/mockData'

export const runtime = 'nodejs'

/**
 * POST /api/seed
 * Idempotent: only inserts products/users that don't already exist (by barcode / username).
 * Call once after first deploy, then call again any time to top up missing demo rows.
 */
export async function POST() {
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
    for (const u of mockUsers) {
      const exists = await User.findOne({ username: u.username.toLowerCase() })
      if (!exists) {
        await User.create({
          username: u.username.toLowerCase(),
          password: u.password,
          name: u.name,
          role: u.role,
        })
        usersInserted++
      }
    }

    return NextResponse.json({
      ok: true,
      productsInserted,
      usersInserted,
      totalProducts: await Product.countDocuments(),
      totalUsers: await User.countDocuments(),
    })
  } catch (e) {
    console.error('POST /seed error', e)
    return NextResponse.json({ error: 'Server error', details: String(e) }, { status: 500 })
  }
}
