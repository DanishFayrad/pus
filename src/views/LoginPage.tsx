import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '../context/AuthContext'

export default function LoginPage() {
  const { login, user } = useAuth()
  const router = useRouter()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    setError(null)
  }, [username, password])

  useEffect(() => {
    if (user) {
      router.replace(user.role === 'admin' ? '/admin' : '/pos')
    }
  }, [user, router])

  if (user) return null

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const res = await login(username, password)
      if (!res.ok) {
        setError(res.error)
        return
      }
      router.replace(res.user.role === 'admin' ? '/admin' : '/pos')
    } finally {
      setSubmitting(false)
    }
  }

  const fillDemo = (u: string, p: string) => {
    setUsername(u)
    setPassword(p)
    setError(null)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100 dark:bg-slate-900 px-4">
      <form
        onSubmit={submit}
        className="w-full max-w-sm bg-white dark:bg-slate-800 rounded-lg shadow-md p-8 space-y-5"
      >
        <div className="text-center">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
            <span className="text-blue-600">Sales</span>Point
          </h1>
          <p className="text-sm text-slate-500 mt-1">Sign in to continue</p>
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
            Username
          </label>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoFocus
            required
            className="w-full px-3 py-2 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
            Password
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="w-full px-3 py-2 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {error && (
          <div className="text-sm text-red-600 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-md px-3 py-2">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="w-full py-2 rounded-md bg-blue-600 hover:bg-blue-500 disabled:bg-blue-300 disabled:cursor-not-allowed text-white font-medium transition"
        >
          {submitting ? 'Signing in…' : 'Sign in'}
        </button>

        <div className="text-xs text-slate-500 border-t border-slate-200 dark:border-slate-700 pt-4">
          <div className="font-medium mb-2">Demo credentials (click to fill)</div>
          <div className="flex flex-col gap-1">
            <button
              type="button"
              onClick={() => fillDemo('admin', 'admin123')}
              className="text-left hover:text-blue-600 hover:underline"
            >
              admin / admin123
            </button>
            <button
              type="button"
              onClick={() => fillDemo('cashier', 'cashier123')}
              className="text-left hover:text-blue-600 hover:underline"
            >
              cashier / cashier123
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}
