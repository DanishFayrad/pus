import { useMemo, useEffect, useState } from 'react'
import { useStore } from '../../context/StoreContext'
import { formatMoney as fmt } from '../../lib/currency'
import { formatDateTime, pktDayKey } from '../../lib/datetime'

export default function AdminDashboard() {
  const { products, sales, returnRequests, pollReturns, updateReturnRequest } = useStore()
  const [showToast, setShowToast] = useState(false)

  const pendingReturns = useMemo(() => returnRequests.filter(r => r.status === 'pending'), [returnRequests])

  useEffect(() => {
    const interval = setInterval(() => {
      pollReturns()
    }, 5000)
    return () => clearInterval(interval)
  }, [pollReturns])

  useEffect(() => {
    if (pendingReturns.length > 0) {
      setShowToast(true)
    } else {
      setShowToast(false)
    }
  }, [pendingReturns.length])

  const stats = useMemo(() => {
    const totalRevenue = sales.reduce((s, x) => s + x.total, 0)
    const totalCost = sales.reduce((s, x) => s + x.cost, 0)
    const profit = totalRevenue - totalCost
    const itemsSold = sales.reduce(
      (s, x) => s + x.items.reduce((a, i) => a + i.quantity, 0),
      0,
    )
    const inventoryValue = products.reduce((s, p) => s + p.cost * p.stock, 0)
    const lowStock = products.filter((p) => p.stock <= 5).length
    const today = pktDayKey(new Date())
    const todayRevenue = sales
      .filter((s) => pktDayKey(s.date) === today)
      .reduce((s, x) => s + x.total, 0)
    return { totalRevenue, totalCost, profit, itemsSold, inventoryValue, lowStock, todayRevenue }
  }, [products, sales])

  const recent = sales.slice(0, 5)

  const cards = [
    { label: 'Total Revenue', value: fmt(stats.totalRevenue), tone: 'indigo' as const },
    {
      label: stats.profit >= 0 ? 'Profit' : 'Loss',
      value: fmt(Math.abs(stats.profit)),
      tone: (stats.profit >= 0 ? 'emerald' : 'red') as 'emerald' | 'red',
    },
    { label: "Today's Revenue", value: fmt(stats.todayRevenue), tone: 'slate' as const },
    { label: 'Items Sold', value: String(stats.itemsSold), tone: 'slate' as const },
    { label: 'Inventory Value', value: fmt(stats.inventoryValue), tone: 'slate' as const },
    {
      label: 'Low Stock (≤5)',
      value: String(stats.lowStock),
      tone: (stats.lowStock > 0 ? 'amber' : 'slate') as 'amber' | 'slate',
    },
  ]

  const toneClass: Record<string, string> = {
    indigo: 'border-blue-200 dark:border-blue-900 text-blue-700 dark:text-blue-300',
    emerald: 'border-emerald-200 dark:border-emerald-900 text-emerald-700 dark:text-emerald-300',
    red: 'border-red-200 dark:border-red-900 text-red-700 dark:text-red-300',
    amber: 'border-amber-200 dark:border-amber-900 text-amber-700 dark:text-amber-300',
    slate: 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200',
  }

  return (
    <div className="max-w-7xl mx-auto p-3 sm:p-4 space-y-4 sm:space-y-6">
      <h1 className="text-xl sm:text-2xl font-bold">Dashboard</h1>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-3">
        {cards.map((c) => (
          <div
            key={c.label}
            className={`bg-white dark:bg-slate-800 border ${toneClass[c.tone]} rounded-lg p-3 sm:p-4`}
          >
            <div className="text-xs sm:text-sm text-slate-500">{c.label}</div>
            <div className="text-lg sm:text-2xl font-bold mt-1 truncate">{c.value}</div>
          </div>
        ))}
      </div>

      {pendingReturns.length > 0 && (
        <div className="bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-900 rounded-lg p-4 mb-4 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-orange-800 dark:text-orange-300">Pending Return Requests ({pendingReturns.length})</h2>
          </div>
          <div className="space-y-2">
            {pendingReturns.map(r => (
              <div key={r.id} className="flex flex-col sm:flex-row sm:items-center justify-between bg-white dark:bg-slate-900 p-3 rounded border border-orange-100 dark:border-orange-800/50">
                <div className="text-sm mb-2 sm:mb-0">
                  <span className="font-semibold text-slate-800 dark:text-slate-200">{r.quantity}x {r.productName}</span>
                  <span className="text-slate-500 ml-2">requested by {r.cashierName}</span>
                </div>
                <div className="flex gap-2">
                  <button 
                    onClick={() => updateReturnRequest(r.id, 'rejected')}
                    className="px-3 py-1.5 text-xs font-medium rounded bg-red-50 text-red-700 hover:bg-red-100 dark:bg-red-900/30 dark:text-red-300"
                  >
                    Reject
                  </button>
                  <button 
                    onClick={() => updateReturnRequest(r.id, 'approved')}
                    className="px-3 py-1.5 text-xs font-medium rounded bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-300"
                  >
                    Approve
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm overflow-hidden">
        <div className="px-3 sm:px-4 py-3 border-b border-slate-200 dark:border-slate-700">
          <h2 className="font-semibold">Recent sales</h2>
        </div>
        {recent.length === 0 ? (
          <div className="p-6 text-center text-slate-500 text-sm">No sales yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-slate-500 bg-slate-50 dark:bg-slate-900">
                <tr>
                  <th className="px-3 sm:px-4 py-2 font-medium">Date</th>
                  <th className="px-3 sm:px-4 py-2 font-medium hidden sm:table-cell">Cashier</th>
                  <th className="px-3 sm:px-4 py-2 font-medium">Items</th>
                  <th className="px-3 sm:px-4 py-2 font-medium text-right">Total</th>
                  <th className="px-3 sm:px-4 py-2 font-medium text-right hidden sm:table-cell">Profit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                {recent.map((s) => (
                  <tr key={s.id}>
                    <td className="px-3 sm:px-4 py-2 whitespace-nowrap">{formatDateTime(s.date)}</td>
                    <td className="px-3 sm:px-4 py-2 hidden sm:table-cell">{s.cashierName}</td>
                    <td className="px-3 sm:px-4 py-2">
                      {s.items.reduce((a, i) => a + i.quantity, 0)}
                    </td>
                    <td className="px-3 sm:px-4 py-2 text-right whitespace-nowrap">{fmt(s.total)}</td>
                    <td
                      className={`px-3 sm:px-4 py-2 text-right whitespace-nowrap hidden sm:table-cell ${
                        s.profit >= 0 ? 'text-emerald-600' : 'text-red-600'
                      }`}
                    >
                      {fmt(s.profit)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showToast && (
        <div className="fixed bottom-4 right-4 bg-orange-600 text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-3 z-50 animate-bounce">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
          </svg>
          <div>
            <div className="font-semibold text-sm">New Return Request!</div>
            <div className="text-xs text-orange-200">{pendingReturns.length} pending request(s)</div>
          </div>
          <button onClick={() => setShowToast(false)} className="ml-2 text-orange-200 hover:text-white">
            <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>
      )}
    </div>
  )
}
