'use client'
import { useEffect, useMemo, useState } from 'react'
import { useStore } from '../../context/StoreContext'
import { useConfirm } from '../../components/ConfirmProvider'
import { formatDate, formatDateTime } from '../../lib/datetime'

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return formatDate(iso)
}

export default function AdminReturns() {
  const { returnRequests, updateReturnRequest, deleteReturnRequest, pollReturns } = useStore()
  const confirm = useConfirm()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Live-refresh while the admin is on this page.
  useEffect(() => {
    const t = setInterval(() => pollReturns(), 8000)
    return () => clearInterval(t)
  }, [pollReturns])

  const pending = useMemo(
    () => returnRequests.filter((r) => r.status === 'pending'),
    [returnRequests],
  )
  const processed = useMemo(
    () => returnRequests.filter((r) => r.status !== 'pending'),
    [returnRequests],
  )

  const act = async (id: string, name: string, qty: number, status: 'approved' | 'rejected') => {
    const ok = await confirm({
      title: status === 'approved' ? 'Approve return' : 'Reject return',
      message:
        status === 'approved'
          ? `Approve return of ${qty} × ${name}? Stock will be restored.`
          : `Reject return of ${qty} × ${name}? Stock will not change.`,
      confirmLabel: status === 'approved' ? 'Approve' : 'Reject',
      tone: status === 'approved' ? 'default' : 'danger',
    })
    if (!ok) return
    setBusyId(id)
    setError(null)
    try {
      await updateReturnRequest(id, status)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Action failed')
    } finally {
      setBusyId(null)
    }
  }

  const del = async (id: string, name: string, qty: number) => {
    const ok = await confirm({
      title: 'Delete return request',
      message: (
        <>
          Delete the return record for <span className="font-semibold">{qty} × {name}</span>?
          This only removes the record — it does not change stock.
        </>
      ),
      confirmLabel: 'Delete',
      tone: 'danger',
    })
    if (!ok) return
    setBusyId(id)
    setError(null)
    try {
      await deleteReturnRequest(id)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="max-w-5xl mx-auto p-3 sm:p-4 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl sm:text-2xl font-bold">Return requests</h1>
        {pending.length > 0 && (
          <span className="px-2.5 py-1 rounded-full text-sm font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
            {pending.length} pending
          </span>
        )}
      </div>

      {error && (
        <div className="text-sm text-red-600 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-md px-3 py-2">
          {error}
        </div>
      )}

      {/* Pending */}
      <section className="bg-white dark:bg-slate-800 rounded-lg shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700 font-semibold">
          Pending approval
        </div>
        {pending.length === 0 ? (
          <div className="p-6 text-center text-slate-500 text-sm">No pending return requests.</div>
        ) : (
          <ul className="divide-y divide-slate-200 dark:divide-slate-700">
            {pending.map((r) => (
              <li key={r.id} className="p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="font-medium">
                    <span className="text-amber-700 dark:text-amber-400">{r.quantity}×</span>{' '}
                    {r.productName}
                  </div>
                  <div className="text-xs text-slate-500">
                    Requested by {r.cashierName} · {timeAgo(r.createdAt)}
                  </div>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button
                    type="button"
                    disabled={busyId === r.id}
                    onClick={() => act(r.id, r.productName, r.quantity, 'approved')}
                    className="px-3 py-1.5 text-sm font-medium rounded-md bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white"
                  >
                    {busyId === r.id ? '…' : 'Approve'}
                  </button>
                  <button
                    type="button"
                    disabled={busyId === r.id}
                    onClick={() => act(r.id, r.productName, r.quantity, 'rejected')}
                    className="px-3 py-1.5 text-sm font-medium rounded-md border border-red-300 text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950/40 disabled:opacity-50"
                  >
                    Reject
                  </button>
                  <button
                    type="button"
                    disabled={busyId === r.id}
                    onClick={() => del(r.id, r.productName, r.quantity)}
                    className="px-2 py-1.5 text-sm font-medium rounded-md text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-50"
                    title="Delete request"
                    aria-label="Delete request"
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 5v6m4-6v6" />
                    </svg>
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* History */}
      <section className="bg-white dark:bg-slate-800 rounded-lg shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700 font-semibold">
          History
        </div>
        {processed.length === 0 ? (
          <div className="p-6 text-center text-slate-500 text-sm">No processed returns yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-slate-500 bg-slate-50 dark:bg-slate-900">
                <tr>
                  <th className="px-4 py-2 font-medium">Product</th>
                  <th className="px-4 py-2 font-medium text-right">Qty</th>
                  <th className="px-4 py-2 font-medium hidden sm:table-cell">Cashier</th>
                  <th className="px-4 py-2 font-medium hidden sm:table-cell">When</th>
                  <th className="px-4 py-2 font-medium text-right">Status</th>
                  <th className="px-4 py-2 font-medium text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                {processed.map((r) => (
                  <tr key={r.id}>
                    <td className="px-4 py-2">{r.productName}</td>
                    <td className="px-4 py-2 text-right">{r.quantity}</td>
                    <td className="px-4 py-2 hidden sm:table-cell">{r.cashierName}</td>
                    <td className="px-4 py-2 hidden sm:table-cell whitespace-nowrap">
                      {formatDateTime(r.updatedAt)}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <span
                        className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${
                          r.status === 'approved'
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300'
                            : 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300'
                        }`}
                      >
                        {r.status}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right">
                      <button
                        type="button"
                        disabled={busyId === r.id}
                        onClick={() => del(r.id, r.productName, r.quantity)}
                        className="text-red-600 hover:underline disabled:opacity-50"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
