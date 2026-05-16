import { NextResponse } from 'next/server'
import dbConnect from '../../../../lib/mongodb'
import User from '../../../../models/User'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null)
    if (!body || typeof body.username !== 'string' || typeof body.password !== 'string') {
      return NextResponse.json({ error: 'username and password required' }, { status: 400 })
    }

    const username = body.username.trim().toLowerCase()
    const password = body.password.trim()

    await dbConnect()
    const user = await User.findOne({ username }).lean<{ _id: unknown; username: string; password: string; name: string; role: 'admin' | 'cashier' }>()
    if (!user || user.password !== password) {
      return NextResponse.json({ error: 'Invalid username or password' }, { status: 401 })
    }

    return NextResponse.json({
      user: {
        id: String(user._id),
        username: user.username,
        name: user.name,
        role: user.role,
      },
    })
  } catch (e) {
    console.error('login error', e)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
