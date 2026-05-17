'use client'
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'

interface ConfirmOptions {
  title?: string
  message: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  tone?: 'default' | 'danger'
}

type ConfirmFn = (opts: ConfirmOptions) => Promise<boolean>

const ConfirmContext = createContext<ConfirmFn | null>(null)

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [opts, setOpts] = useState<ConfirmOptions | null>(null)
  const resolverRef = useRef<((v: boolean) => void) | null>(null)

  const confirm: ConfirmFn = useCallback((o) => {
    setOpts(o)
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve
    })
  }, [])

  const respond = useCallback((v: boolean) => {
    resolverRef.current?.(v)
    resolverRef.current = null
    setOpts(null)
  }, [])

  // Esc closes (= cancel)
  useEffect(() => {
    if (!opts) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') respond(false)
      if (e.key === 'Enter') respond(true)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [opts, respond])

  const tone = opts?.tone ?? 'default'
  const confirmBtn =
    tone === 'danger'
      ? 'bg-red-600 hover:bg-red-500 focus:ring-red-500'
      : 'bg-blue-600 hover:bg-blue-500 focus:ring-blue-500'

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {opts && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-[fadeIn_0.12s_ease-out]"
          onClick={() => respond(false)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="w-full max-w-md bg-white rounded-xl shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 pt-6 pb-4">
              {opts.title && (
                <h2 className="text-lg font-semibold text-slate-900 mb-1">
                  {opts.title}
                </h2>
              )}
              <div className="text-sm text-slate-600">{opts.message}</div>
            </div>
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => respond(false)}
                className="px-4 py-2 text-sm font-medium rounded-md border border-slate-300 text-slate-700 bg-white hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-400"
              >
                {opts.cancelLabel ?? 'Cancel'}
              </button>
              <button
                type="button"
                autoFocus
                onClick={() => respond(true)}
                className={`px-4 py-2 text-sm font-medium rounded-md text-white focus:outline-none focus:ring-2 ${confirmBtn}`}
              >
                {opts.confirmLabel ?? 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  )
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext)
  if (!ctx) throw new Error('useConfirm must be used inside ConfirmProvider')
  return ctx
}
