import { NextResponse } from 'next/server'
import dbConnect from '../../../lib/mongodb'
import { getSession } from '../../../lib/auth'
import User from '../../../models/User'

export const runtime = 'nodejs'

/** GET /api/users — admin only. Returns names and roles, never passwords. */
export async function GET() {
  const session = await getSession()
  if (!session || session.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    await dbConnect()
    const users = await User.find({}, { name: 1, username: 1, role: 1 }).sort({ role: 1, name: 1 }).lean()
    return NextResponse.json({
      users: users.map((u) => ({ id: String(u._id), name: u.name, username: u.username, role: u.role })),
    })
  } catch (e) {
    console.error('GET /users error', e)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
