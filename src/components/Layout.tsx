'use client'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useAuth } from '../context/AuthContext'
import { useStore } from '../context/StoreContext'
import type { Role } from '../types'

interface NavItem {
  href: string
  label: string
  icon: string // SVG path data
  roles: Role[]
}

// Single source of nav truth — drives the sidebar links AND the topbar page title.
const NAV: NavItem[] = [
  { href: '/admin', label: 'Dashboard', roles: ['admin'], icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
  { href: '/admin/analytics', label: 'Analytics', roles: ['admin'], icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z' },
  { href: '/admin/reports', label: 'Reports', roles: ['admin'], icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
  { href: '/admin/products', label: 'Products', roles: ['admin'], icon: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4' },
  { href: '/admin/sales', label: 'Sales', roles: ['admin'], icon: 'M9 7h6m-6 4h6m-6 4h4M5 3h14a2 2 0 012 2v14l-4-2-4 2-4-2-4 2V5a2 2 0 012-2z' },
  { href: '/admin/credits', label: 'Credit Book', roles: ['admin', 'cashier'], icon: 'M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z' },
  { href: '/admin/returns', label: 'Returns', roles: ['admin'], icon: 'M3 10h10a5 5 0 015 5v2m0 0l-3-3m3 3l3-3M3 10l4-4M3 10l4 4' },
  { href: '/pos', label: 'Point of Sale', roles: ['admin', 'cashier'], icon: 'M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z' },
]

function initials(name: string): string {
  const parts = name.trim().split(/\s+/)
  return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || 'U'
}

export default function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth()
  const { returnRequests, pollReturns } = useStore()
  const router = useRouter()
  const pathname = usePathname()
  const [drawerOpen, setDrawerOpen] = useState(false)

  const pendingReturns = returnRequests.filter((r) => r.status === 'pending').length

  const links = useMemo(
    () => (user ? NAV.filter((n) => n.roles.includes(user.role)) : []),
    [user],
  )

  const isActive = (href: string) =>
    pathname === href || (href !== '/admin' && pathname?.startsWith(href + '/')) ||
    (href !== '/admin' && pathname === href)

  const pageTitle = useMemo(() => {
    // Longest matching href wins, so /admin/analytics beats /admin.
    const match = [...links]
      .sort((a, b) => b.href.length - a.href.length)
      .find((n) => pathname === n.href || pathname?.startsWith(n.href + '/'))
    return match?.label ?? 'SalesPoint'
  }, [links, pathname])

  // Poll for new return requests so the admin gets a near-real-time notification.
  useEffect(() => {
    if (user?.role !== 'admin') return
    pollReturns()
    const t = setInterval(() => pollReturns(), 15000)
    return () => clearInterval(t)
  }, [user, pollReturns])

  // Close drawer on route change.
  useEffect(() => {
    setDrawerOpen(false)
  }, [pathname])

  // Esc closes drawer + lock body scroll while open.
  useEffect(() => {
    if (!drawerOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDrawerOpen(false)
    }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [drawerOpen])

  if (!user) return <>{children}</>

  const brand = (
    <div className="flex items-center gap-2.5 px-2">
      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-sm shadow-blue-600/25">
        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
      </div>
      <span className="text-lg font-extrabold tracking-tight">
        <span className="bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">Sales</span>
        <span className="text-slate-800 dark:text-white">Point</span>
      </span>
    </div>
  )

  const navList = (
    <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
      {links.map((n) => {
        const active = isActive(n.href)
        return (
          <Link
            key={n.href}
            href={n.href}
            className={`group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-all duration-200 ${
              active
                ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800/60 dark:hover:text-slate-100'
            }`}
          >
            {active && (
              <span className="absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full bg-gradient-to-b from-blue-600 to-indigo-600" />
            )}
            <svg
              className={`h-5 w-5 shrink-0 transition-colors ${active ? 'text-blue-600 dark:text-blue-400' : 'text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-300'}`}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d={n.icon} />
            </svg>
            <span className="flex-1">{n.label}</span>
            {n.href === '/admin/returns' && pendingReturns > 0 && (
              <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-500 px-1.5 text-[10px] font-bold text-white shadow-sm">
                {pendingReturns}
              </span>
            )}
          </Link>
        )
      })}
    </nav>
  )

  const userFooter = (
    <div className="border-t border-slate-200/70 dark:border-slate-800 p-3">
      <div className="flex items-center gap-3 rounded-xl px-2 py-2">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-600 to-indigo-600 text-xs font-bold text-white">
          {initials(user.name)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">{user.name}</div>
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{user.role}</div>
        </div>
      </div>
      <button
        type="button"
        onClick={async () => {
          setDrawerOpen(false)
          await logout()
          router.replace('/login')
        }}
        className="mt-1 flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 hover:shadow-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 cursor-pointer"
      >
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
        </svg>
        Logout
      </button>
    </div>
  )

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-slate-200/70 bg-white dark:border-slate-800 dark:bg-slate-900 lg:flex">
        <div className="flex h-16 items-center border-b border-slate-200/70 px-4 dark:border-slate-800">{brand}</div>
        {navList}
        {userFooter}
      </aside>

      {/* Mobile drawer */}
      <div
        className={`fixed inset-0 z-40 transition-opacity duration-300 lg:hidden ${
          drawerOpen ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'
        }`}
        aria-hidden={!drawerOpen}
      >
        <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setDrawerOpen(false)} />
        <aside
          className={`absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-white shadow-2xl transition-transform duration-300 ease-out dark:bg-slate-900 ${
            drawerOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
          role="dialog"
          aria-modal="true"
        >
          <div className="flex h-16 items-center justify-between border-b border-slate-200/70 px-4 dark:border-slate-800">
            {brand}
            <button
              type="button"
              onClick={() => setDrawerOpen(false)}
              className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              aria-label="Close menu"
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>
          {navList}
          {userFooter}
        </aside>
      </div>

      {/* Main column */}
      <div className="lg:pl-64">
        {/* Topbar */}
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-slate-200/70 bg-white/80 px-4 backdrop-blur-md dark:border-slate-800 dark:bg-slate-950/80 sm:px-6">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className="-ml-1 rounded-lg p-2 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 lg:hidden"
            aria-label="Open menu"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 6h18M3 12h18M3 18h18" />
            </svg>
          </button>

          <h1 className="flex-1 truncate text-lg font-bold tracking-tight text-slate-900 dark:text-white">
            {pageTitle}
          </h1>

          {user.role === 'admin' && (
            <Link
              href="/admin/returns"
              className="relative rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
              title={pendingReturns > 0 ? `${pendingReturns} pending return(s)` : 'Return requests'}
              aria-label="Return requests"
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
              {pendingReturns > 0 && (
                <span className="absolute right-0.5 top-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-bold text-white">
                  {pendingReturns}
                </span>
              )}
            </Link>
          )}

          <div className="hidden items-center gap-2.5 sm:flex">
            <div className="text-right">
              <div className="text-sm font-semibold leading-tight text-slate-800 dark:text-slate-200">{user.name}</div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{user.role}</div>
            </div>
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-blue-600 to-indigo-600 text-xs font-bold text-white">
              {initials(user.name)}
            </div>
          </div>
        </header>

        <main className="min-h-[calc(100vh-4rem)]">{children}</main>
      </div>
    </div>
  )
}
