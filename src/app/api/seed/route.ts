import { NextResponse } from 'next/server'
import dbConnect from '../../../lib/mongodb'
import User from '../../../models/User'
import { mockUsers } from '../../../data/mockData'

export const runtime = 'nodejs'

/**
 * POST /api/seed
 * Requires header `x-seed-secret: <SEED_SECRET env value>`.
 * Idempotent user setup only — does not touch products, sales, or returns.
 */
export async function POST(req: Request) {
  const expected = process.env.SEED_SECRET
  const provided = req.headers.get('x-seed-secret')
  if (!expected || !provided || provided !== expected) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    await dbConnect()

    await User.deleteMany({ role: 'cashier' })

    let usersInserted = 0
    let usersMigrated = 0
    for (const u of mockUsers) {
      const existing = await User.findOne({ username: u.username.toLowerCase() })
      if (!existing) {
        await User.create({
          username: u.username.toLowerCase(),
          password: u.password,
          name: u.name,
          role: u.role,
        })
        usersInserted++
      } else if (!existing.password.startsWith('$2')) {
        existing.password = u.password
        await existing.save()
        usersMigrated++
      }
    }

    return NextResponse.json({
      ok: true,
      usersInserted,
      usersMigrated,
      totalUsers: await User.countDocuments(),
    })
  } catch (e) {
    console.error('POST /seed error', e)
    return NextResponse.json({ error: 'Server error', details: String(e) }, { status: 500 })
  }
}
