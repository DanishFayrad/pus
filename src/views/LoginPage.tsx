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
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-tr from-slate-50 via-white to-blue-50/30 dark:from-slate-950 dark:to-slate-900 px-4">
      <form
        onSubmit={submit}
        className="w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl shadow-[0_12px_40px_rgba(0,0,0,0.03)] border border-slate-100 dark:border-slate-800/60 p-8 md:p-10 space-y-6 transition-all duration-300"
      >
        <div className="text-center">
          <span className="font-extrabold text-2xl sm:text-3xl tracking-tight">
            <span className="bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">Sales</span>
            <span className="text-slate-800 dark:text-white">Point</span>
          </span>
          <p className="text-sm font-semibold text-slate-450 dark:text-slate-400 mt-2">Sign in to your cashier or admin account</p>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-400">
            Username
          </label>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoFocus
            required
            placeholder="Enter username"
            className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 shadow-2xs transition-all duration-200 placeholder:text-slate-400 text-sm font-semibold"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-400">
            Password
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            placeholder="••••••••"
            className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 shadow-2xs transition-all duration-200 placeholder:text-slate-400 text-sm font-semibold"
          />
        </div>

        {error && (
          <div className="text-xs font-medium text-red-600 bg-red-50 dark:bg-red-950/20 border border-red-200/50 rounded-xl px-4 py-3 flex items-center gap-2 animate-[slideDown_0.2s_ease-out]">
            <svg className="w-4 h-4 text-red-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <span>{error}</span>
          </div>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="w-full py-3.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 disabled:from-blue-300 disabled:to-indigo-300 disabled:cursor-not-allowed text-white font-bold transition duration-200 shadow-md hover:shadow-lg disabled:shadow-none active:scale-[0.98] cursor-pointer text-center text-sm"
        >
          {submitting ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  )
}
