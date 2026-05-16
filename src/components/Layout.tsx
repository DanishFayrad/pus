import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useAuth } from '../context/AuthContext'

export default function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth()
  const router = useRouter()
  const pathname = usePathname()

  if (!user) return <>{children}</>

  const isAdmin = user.role === 'admin'

  const navLinkClass = (path: string) => {
    const isActive = pathname === path || (path !== '/admin' && pathname?.startsWith(path))
    return `px-3 py-2 rounded-md text-sm font-medium transition ${
      isActive
        ? 'bg-blue-600 text-white'
        : 'text-slate-700 hover:bg-slate-200 dark:text-slate-200 dark:hover:bg-slate-700'
    }`
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100">
      <header className="border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-6">
            <span className="font-bold text-lg">
              <span className="text-blue-600">Sales</span>Point
            </span>
            <nav className="flex items-center gap-1">
              {isAdmin ? (
                <>
                  <Link href="/admin" className={navLinkClass('/admin')}>Dashboard</Link>
                  <Link href="/admin/products" className={navLinkClass('/admin/products')}>Products</Link>
                  <Link href="/admin/sales" className={navLinkClass('/admin/sales')}>Sales</Link>
                  <Link href="/pos" className={navLinkClass('/pos')}>POS</Link>
                </>
              ) : (
                <Link href="/pos" className={navLinkClass('/pos')}>POS</Link>
              )}
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right hidden sm:block">
              <div className="text-sm font-medium">{user.name}</div>
              <div className="text-xs text-slate-500 capitalize">{user.role}</div>
            </div>
            <button
              type="button"
              onClick={() => {
                logout()
                router.replace('/login')
              }}
              className="px-3 py-1.5 rounded-md text-sm font-medium bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700"
            >
              Logout
            </button>
          </div>
        </div>
      </header>
      <main className="flex-1">
        {children}
      </main>
    </div>
  )
}
