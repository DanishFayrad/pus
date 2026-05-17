import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import dbConnect from '../../../../lib/mongodb'
import { setSessionCookie } from '../../../../lib/auth'
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
    const user = await User.findOne({ username }).lean<{
      _id: unknown
      username: string
      password: string
      name: string
      role: 'admin' | 'cashier'
    }>()
    if (!user) {
      return NextResponse.json({ error: 'Invalid username or password' }, { status: 401 })
    }

    // Support both hashed (new) and plaintext (legacy, pre-migration) stored passwords.
    const stored = user.password
    const ok = stored.startsWith('$2')
      ? await bcrypt.compare(password, stored)
      : stored === password
    if (!ok) {
      return NextResponse.json({ error: 'Invalid username or password' }, { status: 401 })
    }

    const sessionUser = {
      id: String(user._id),
      username: user.username,
      name: user.name,
      role: user.role,
    }
    await setSessionCookie(sessionUser)

    return NextResponse.json({ user: sessionUser })
  } catch (e) {
    console.error('login error', e)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
