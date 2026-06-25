'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useAuth } from '../context/AuthContext'
import { useStore } from '../context/StoreContext'

export default function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth()
  const { returnRequests, pollReturns } = useStore()
  const router = useRouter()
  const pathname = usePathname()
  const [drawerOpen, setDrawerOpen] = useState(false)

  const pendingReturns = returnRequests.filter((r) => r.status === 'pending').length

  // Poll for new return requests so the admin gets a near-real-time notification.
  useEffect(() => {
    if (user?.role !== 'admin') return
    pollReturns()
    const t = setInterval(() => pollReturns(), 15000)
    return () => clearInterval(t)
  }, [user, pollReturns])

  // Close drawer on route change
  useEffect(() => {
    setDrawerOpen(false)
  }, [pathname])

  // Esc closes drawer + lock body scroll while open
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

  const isAdmin = user.role === 'admin'

  const navLinkClass = (path: string, mobile = false) => {
    const isActive = pathname === path || (path !== '/admin' && pathname?.startsWith(path))
    const base = mobile
      ? 'block w-full px-4 py-3 rounded-lg text-sm font-medium transition duration-200'
      : 'px-3 py-2 rounded-lg text-xs sm:text-sm font-medium whitespace-nowrap transition duration-200'
    return `${base} ${
      isActive
        ? 'bg-blue-50/80 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400 font-semibold shadow-xs'
        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-slate-800/50'
    }`
  }

  const renderLinks = (mobile: boolean) => {
    const cls = (p: string) => navLinkClass(p, mobile)
    if (isAdmin) {
      return (
        <>
          <Link href="/admin" className={cls('/admin')}>Dashboard</Link>
          <Link href="/admin/products" className={cls('/admin/products')}>Products</Link>
          <Link href="/admin/sales" className={cls('/admin/sales')}>Sales</Link>
          <Link href="/admin/credits" className={cls('/admin/credits')}>Credit Book</Link>
          <Link href="/admin/returns" className={`${cls('/admin/returns')} flex items-center justify-between gap-2`}>
            <span>Returns</span>
            {pendingReturns > 0 && (
              <span className="inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full text-[10px] font-bold bg-amber-500 text-white shadow-xs">
                {pendingReturns}
              </span>
            )}
          </Link>
          <Link href="/pos" className={cls('/pos')}>POS</Link>
        </>
      )
    }
    return (
      <>
        <Link href="/pos" className={cls('/pos')}>POS</Link>
        <Link href="/admin/credits" className={cls('/admin/credits')}>Credit Book</Link>
      </>
    )
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100">
      <header className="border-b border-slate-100 dark:border-slate-800 bg-white/80 dark:bg-slate-950/80 backdrop-blur-md sticky top-0 z-30 shadow-xs">
        <div className="max-w-7xl mx-auto px-3 sm:px-4 h-14 flex items-center gap-2 sm:gap-4">
          {/* Hamburger (mobile only) */}
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className="md:hidden -ml-1 p-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800"
            aria-label="Open menu"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 6h18M3 12h18M3 18h18" />
            </svg>
          </button>

          <span className="font-bold text-base sm:text-lg shrink-0 tracking-tight mr-2">
            <span className="bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">Sales</span>
            <span className="text-slate-800 dark:text-white">Point</span>
          </span>

          {/* Inline nav (desktop) */}
          <nav className="hidden md:flex items-center gap-1 flex-1 min-w-0">
            {renderLinks(false)}
          </nav>

          {/* Spacer for mobile (nav is in drawer) */}
          <div className="flex-1 md:hidden" />

          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            {isAdmin && (
              <Link
                href="/admin/returns"
                className="relative p-2 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-55 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-slate-800/50 transition duration-200"
                title={pendingReturns > 0 ? `${pendingReturns} pending return(s)` : 'Return requests'}
                aria-label="Return requests"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.73 21a2 2 0 0 1-3.46 0" />
                </svg>
                {pendingReturns > 0 && (
                  <span className="absolute top-0.5 right-0.5 inline-flex items-center justify-center min-w-4 h-4 px-1 rounded-full text-[10px] font-bold bg-amber-500 text-white animate-pulse">
                    {pendingReturns}
                  </span>
                )}
              </Link>
            )}
            <div className="text-right hidden lg:block mr-1">
              <div className="text-sm font-semibold text-slate-800 dark:text-slate-200">{user.name}</div>
              <div className="text-[10px] tracking-wider uppercase text-slate-400 font-bold">{user.role}</div>
            </div>
            <button
              type="button"
              onClick={async () => {
                await logout()
                router.replace('/login')
              }}
              className="px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-semibold border border-slate-200 hover:border-slate-300 dark:border-slate-700 bg-white hover:bg-slate-50 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-all duration-200 shadow-sm cursor-pointer hover:shadow-md"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      {/* Mobile drawer */}
      <div
        className={`md:hidden fixed inset-0 z-40 transition-opacity duration-300 ${
          drawerOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        aria-hidden={!drawerOpen}
      >
        {/* Backdrop */}
        <div
          className="absolute inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity duration-300"
          onClick={() => setDrawerOpen(false)}
        />
        {/* Panel */}
        <aside
          className={`absolute left-0 top-0 bottom-0 w-72 max-w-[85vw] bg-white dark:bg-slate-900 shadow-2xl flex flex-col transform transition-transform duration-300 ease-out ${
            drawerOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
          role="dialog"
          aria-modal="true"
        >
          <div className="h-14 px-4 flex items-center justify-between border-b border-slate-100 dark:border-slate-800">
            <span className="font-bold text-lg tracking-tight">
              <span className="bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">Sales</span>
              <span className="text-slate-800 dark:text-white">Point</span>
            </span>
            <button
              type="button"
              onClick={() => setDrawerOpen(false)}
              className="p-2 -mr-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-500"
              aria-label="Close menu"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>

          <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
            <div className="text-sm font-semibold text-slate-800 dark:text-slate-200">{user.name}</div>
            <div className="text-xs text-slate-400 capitalize font-medium">{user.role}</div>
          </div>

          <nav className="flex-1 overflow-y-auto p-3 space-y-1">
            {renderLinks(true)}
          </nav>

          <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/30">
            <button
              type="button"
              onClick={async () => {
                setDrawerOpen(false)
                await logout()
                router.replace('/login')
              }}
              className="w-full px-4 py-2.5 rounded-lg text-sm font-semibold border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-center transition"
            >
              Logout
            </button>
          </div>
        </aside>
      </div>

      <main className="flex-1">
        {children}
      </main>
    </div>
  )
}
