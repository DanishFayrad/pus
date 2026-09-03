import { useMemo, useEffect, useState } from 'react'
import { useStore } from '../../context/StoreContext'
import { useConfirm } from '../../components/ConfirmProvider'
import Spinner from '../../components/Spinner'
import { formatMoney as fmt } from '../../lib/currency'
import { formatDateTime, pktDayKey } from '../../lib/datetime'

type Accent = 'indigo' | 'emerald' | 'red' | 'amber' | 'violet' | 'cyan' | 'slate'

const ACCENT: Record<Accent, string> = {
  indigo: 'bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-400',
  emerald: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400',
  red: 'bg-red-50 text-red-600 dark:bg-red-950/50 dark:text-red-400',
  amber: 'bg-amber-50 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400',
  violet: 'bg-violet-50 text-violet-600 dark:bg-violet-950/50 dark:text-violet-400',
  cyan: 'bg-cyan-50 text-cyan-600 dark:bg-cyan-950/50 dark:text-cyan-400',
  slate: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
}

const ICON: Record<string, string> = {
  revenue: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  cost: 'M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z',
  profit: 'M13 7h8m0 0v8m0-8l-8 8-4-4-6 6',
  sales: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2',
  today: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z',
  items: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4',
  inventory: 'M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10',
  lowstock: 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z',
}

export default function AdminDashboard() {
  const { products, sales, returnRequests, stats: serverStats, pollReturns, updateReturnRequest, deleteSale } = useStore()
  const confirm = useConfirm()
  const [showToast, setShowToast] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const removeSale = async (id: string, label: string) => {
    const ok = await confirm({
      title: 'Delete sale',
      message: (
        <>
          Delete sale <span className="font-semibold">{label}</span>?
          This only removes the record — stock will not change.
        </>
      ),
      confirmLabel: 'Delete',
      tone: 'danger',
    })
    if (!ok) return
    setDeletingId(id)
    setDeleteError(null)
    try {
      await deleteSale(id)
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : 'Delete failed')
    } finally {
      setDeletingId(null)
    }
  }

  const pendingReturns = useMemo(() => returnRequests.filter((r) => r.status === 'pending'), [returnRequests])

  useEffect(() => {
    const interval = setInterval(() => {
      pollReturns()
    }, 5000)
    return () => clearInterval(interval)
  }, [pollReturns])

  useEffect(() => {
    setShowToast(pendingReturns.length > 0)
  }, [pendingReturns.length])

  const stats = useMemo(() => {
    let totalRevenue = serverStats ? serverStats.totalRevenue : sales.reduce((s, x) => s + (x.total || 0), 0)
    let totalCost = serverStats ? serverStats.totalCost : sales.reduce((s, x) => s + (x.cost || 0), 0)
    let profit = serverStats ? serverStats.profit : sales.reduce((s, x) => s + (x.profit || 0), 0)
    const salesCount = serverStats ? serverStats.salesCount : sales.length
    let itemsSold = serverStats
      ? serverStats.itemsSold
      : sales.reduce((s, x) => s + x.items.reduce((a, i) => a + (i.quantity || 0), 0), 0)

    const approvedReturns = returnRequests.filter((r) => r.status === 'approved')
    approvedReturns.forEach((r) => {
      const p = products.find((prod) => String(prod.id) === String(r.productId))
      if (p) {
        totalRevenue -= p.price * r.quantity
        totalCost -= p.cost * r.quantity
        profit -= (p.price - p.cost) * r.quantity
        itemsSold -= r.quantity
      }
    })

    const inventoryValue = products.reduce((s, p) => s + (p.cost * p.stock || 0), 0)
    const lowStock = products.filter((p) => p.stock <= 5).length
    const today = pktDayKey(new Date())

    let todayRevenue = serverStats
      ? serverStats.todayRevenue
      : sales
          .filter((s) => pktDayKey(s.date) === today)
          .reduce((s, x) => s + (x.total || 0), 0)

    approvedReturns
      .filter((r) => pktDayKey(r.updatedAt) === today)
      .forEach((r) => {
        const p = products.find((prod) => String(prod.id) === String(r.productId))
        if (p) todayRevenue -= p.price * r.quantity
      })

    const margin = totalRevenue > 0 ? (profit / totalRevenue) * 100 : 0
    return { totalRevenue, totalCost, profit, salesCount, itemsSold, inventoryValue, lowStock, todayRevenue, margin }
  }, [products, sales, returnRequests, serverStats])

  const recent = sales.slice(0, 5)

  const fmtCard = (n: number) => {
    if (Math.abs(n) >= 100000) {
      return 'Rs ' + Math.round(n).toLocaleString('en-PK')
    }
    return fmt(n)
  }

  const cards: { label: string; value: string; fullValue?: string; icon: string; accent: Accent; sub?: string }[] = [
    { label: 'Total Revenue', value: fmtCard(stats.totalRevenue), fullValue: fmt(stats.totalRevenue), icon: ICON.revenue, accent: 'indigo' },
    {
      label: stats.profit >= 0 ? 'Net Profit' : 'Net Loss',
      value: fmtCard(Math.abs(stats.profit)),
      fullValue: fmt(Math.abs(stats.profit)),
      icon: ICON.profit,
      accent: stats.profit >= 0 ? 'emerald' : 'red',
      sub: `${stats.margin.toFixed(1)}% margin`,
    },
    { label: "Today's Revenue", value: fmtCard(stats.todayRevenue), fullValue: fmt(stats.todayRevenue), icon: ICON.today, accent: 'violet' },
    { label: 'Sales', value: String(stats.salesCount), icon: ICON.sales, accent: 'cyan', sub: `${stats.itemsSold} items sold` },
    { label: 'Total Cost', value: fmtCard(stats.totalCost), fullValue: fmt(stats.totalCost), icon: ICON.cost, accent: 'slate' },
    { label: 'Items Sold', value: String(stats.itemsSold), icon: ICON.items, accent: 'slate' },
    { label: 'Inventory Value', value: fmtCard(stats.inventoryValue), fullValue: fmt(stats.inventoryValue), icon: ICON.inventory, accent: 'amber' },
    {
      label: 'Low Stock (≤5)',
      value: String(stats.lowStock),
      icon: ICON.lowstock,
      accent: stats.lowStock > 0 ? 'amber' : 'slate',
      sub: stats.lowStock > 0 ? 'needs restock' : 'all healthy',
    },
  ]

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6">
      <div>
        <h2 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">Store overview</h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Live performance across sales, profit and inventory.
        </p>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {cards.map((c) => (
          <div
            key={c.label}
            className="group rounded-2xl border border-slate-200/70 bg-white p-4 shadow-sm transition-shadow hover:shadow-md dark:border-slate-800 dark:bg-slate-900 sm:p-5"
          >
            <div className="flex items-start justify-between gap-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{c.label}</span>
              <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${ACCENT[c.accent]}`}>
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d={c.icon} />
                </svg>
              </span>
            </div>
            <div
              title={c.fullValue || c.value}
              className={`mt-3 truncate font-extrabold tracking-tight tabular-nums ${
                c.value.length > 13 ? 'text-lg sm:text-xl lg:text-2xl' : 'text-xl sm:text-2xl'
              }`}
            >
              {c.value}
            </div>
            {c.sub && <div className="mt-1 text-xs font-medium text-slate-400">{c.sub}</div>}
          </div>
        ))}
      </div>

      {/* Pending returns */}
      {pendingReturns.length > 0 && (
        <div className="overflow-hidden rounded-2xl border border-amber-200 bg-amber-50/60 shadow-sm dark:border-amber-900/60 dark:bg-amber-950/20">
          <div className="flex items-center gap-2 border-b border-amber-200/70 px-4 py-3 dark:border-amber-900/50">
            <svg className="h-5 w-5 text-amber-600 dark:text-amber-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
            <h3 className="text-sm font-bold text-amber-800 dark:text-amber-300">
              Pending return requests ({pendingReturns.length})
            </h3>
          </div>
          <div className="divide-y divide-amber-200/60 dark:divide-amber-900/40">
            {pendingReturns.map((r) => (
              <div key={r.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-sm">
                  <span className="font-semibold text-slate-800 dark:text-slate-100">
                    {r.quantity}× {r.productName}
                  </span>
                  <span className="ml-2 text-slate-500">requested by {r.cashierName}</span>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => updateReturnRequest(r.id, 'rejected')}
                    className="rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-red-700 ring-1 ring-red-200 transition hover:bg-red-50 dark:bg-slate-900 dark:text-red-300 dark:ring-red-900/50 cursor-pointer"
                  >
                    Reject
                  </button>
                  <button
                    onClick={() => updateReturnRequest(r.id, 'approved')}
                    className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-500 cursor-pointer"
                  >
                    Approve
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {deleteError && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600 dark:border-red-900 dark:bg-red-950/40">
          {deleteError}
        </div>
      )}

      {/* Recent sales */}
      <div className="overflow-hidden rounded-2xl border border-slate-200/70 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between border-b border-slate-200/70 px-4 py-3 dark:border-slate-800 sm:px-5">
          <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">Recent sales</h3>
          <span className="text-xs text-slate-400">Last {recent.length}</span>
        </div>
        {recent.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500">No sales yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500 dark:bg-slate-950/40">
                <tr>
                  <th className="px-4 py-2.5 font-semibold sm:px-5">Date</th>
                  <th className="hidden px-4 py-2.5 font-semibold sm:table-cell">Cashier</th>
                  <th className="px-4 py-2.5 font-semibold text-right">Items</th>
                  <th className="px-4 py-2.5 font-semibold text-right">Total</th>
                  <th className="hidden px-4 py-2.5 font-semibold text-right sm:table-cell">Profit</th>
                  <th className="px-4 py-2.5 font-semibold text-right sm:px-5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {recent.map((s) => {
                  const isDeleting = deletingId === s.id
                  return (
                    <tr
                      key={s.id}
                      className={`transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/40 ${isDeleting ? 'opacity-50' : ''}`}
                    >
                      <td className="whitespace-nowrap px-4 py-2.5 text-slate-600 dark:text-slate-300 sm:px-5">
                        {formatDateTime(s.date)}
                      </td>
                      <td className="hidden px-4 py-2.5 sm:table-cell">{s.cashierName}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">
                        {s.items.reduce((a, i) => a + i.quantity, 0)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-right font-semibold tabular-nums">{fmt(s.total)}</td>
                      <td
                        className={`hidden whitespace-nowrap px-4 py-2.5 text-right font-medium tabular-nums sm:table-cell ${
                          s.profit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
                        }`}
                      >
                        {fmt(s.profit)}
                      </td>
                      <td className="px-4 py-2.5 text-right sm:px-5">
                        <button
                          type="button"
                          disabled={isDeleting}
                          onClick={() => removeSale(s.id, `${fmt(s.total)} · ${formatDateTime(s.date)}`)}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-red-600 hover:underline disabled:opacity-50 dark:text-red-400"
                        >
                          {isDeleting ? (
                            <>
                              <Spinner /> Deleting…
                            </>
                          ) : (
                            'Delete'
                          )}
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showToast && (
        <div className="fixed bottom-4 right-4 z-50 flex items-center gap-3 rounded-xl bg-amber-600 px-4 py-3 text-white shadow-lg">
          <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
          </svg>
          <div>
            <div className="text-sm font-semibold">New return request</div>
            <div className="text-xs text-amber-100">{pendingReturns.length} pending request(s)</div>
          </div>
          <button onClick={() => setShowToast(false)} className="ml-2 text-amber-100 hover:text-white cursor-pointer">
            <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>
      )}
    </div>
  )
}
