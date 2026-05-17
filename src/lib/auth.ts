import { cookies } from 'next/headers'
import jwt from 'jsonwebtoken'

const COOKIE_NAME = 'salespoint-session'
const MAX_AGE = 60 * 60 * 24 * 7 // 7 days

export interface SessionUser {
  id: string
  username: string
  name: string
  role: 'admin' | 'cashier'
}

function getSecret(): string {
  const s = process.env.JWT_SECRET
  if (!s || s.length < 16) {
    throw new Error('JWT_SECRET is not set or is too short. Set it in .env.local (and Vercel env).')
  }
  return s
}

export async function setSessionCookie(user: SessionUser) {
  const token = jwt.sign(user, getSecret(), { expiresIn: MAX_AGE })
  const c = await cookies()
  c.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: MAX_AGE,
  })
}

export async function clearSessionCookie() {
  const c = await cookies()
  c.delete(COOKIE_NAME)
}

export async function getSession(): Promise<SessionUser | null> {
  const c = await cookies()
  const token = c.get(COOKIE_NAME)?.value
  if (!token) return null
  try {
    const decoded = jwt.verify(token, getSecret()) as jwt.JwtPayload & SessionUser
    if (!decoded.id || !decoded.role) return null
    return {
      id: decoded.id,
      username: decoded.username,
      name: decoded.name,
      role: decoded.role,
    }
  } catch {
    return null
  }
}
