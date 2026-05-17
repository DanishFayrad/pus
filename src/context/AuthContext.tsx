'use client'
import { createContext, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { User } from '../types'

interface AuthContextValue {
  // undefined = initial check in progress
  // null      = checked, not logged in
  // User      = logged in
  user: User | null | undefined
  loading: boolean
  login: (
    username: string,
    password: string,
  ) => Promise<{ ok: true; user: User } | { ok: false; error: string }>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null | undefined>(undefined)

  // On mount, verify session by hitting the server. The session is in an HTTP-only
  // cookie that JS can't read, so we ask the server who we are.
  useEffect(() => {
    let cancelled = false
    fetch('/api/auth/me', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : { user: null }))
      .then((data) => {
        if (!cancelled) setUser((data?.user as User | null) ?? null)
      })
      .catch(() => {
        if (!cancelled) setUser(null)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const login: AuthContextValue['login'] = async (username, password) => {
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
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

  const logout: AuthContextValue['logout'] = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' })
    } catch {
      /* ignore — clear local state anyway */
    }
    setUser(null)
  }

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
