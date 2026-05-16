'use client'
import { createContext, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { User } from '../types'

interface AuthContextValue {
  // undefined = initial check in progress (SSR / before localStorage read)
  // null      = checked, not logged in
  // User      = logged in
  user: User | null | undefined
  loading: boolean
  login: (
    username: string,
    password: string,
  ) => Promise<{ ok: true; user: User } | { ok: false; error: string }>
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)
const STORAGE_KEY = 'salespoint.auth'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null | undefined>(undefined)

  // Hydrate from localStorage on client mount.
  useEffect(() => {
    try {
      const raw = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null
      setUser(raw ? (JSON.parse(raw) as User) : null)
    } catch {
      setUser(null)
    }
  }, [])

  // Persist whenever user is set after init.
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (user === undefined) return
    if (user) localStorage.setItem(STORAGE_KEY, JSON.stringify(user))
    else localStorage.removeItem(STORAGE_KEY)
  }, [user])

  const login: AuthContextValue['login'] = async (username, password) => {
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        return { ok: false, error: (data && data.error) || 'Login failed' }
      }
      const u = data.user as User
      setUser(u)
      return { ok: true, user: u }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : 'Network error' }
    }
  }

  const logout = () => setUser(null)

  return (
    <AuthContext.Provider value={{ user, loading: user === undefined, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
