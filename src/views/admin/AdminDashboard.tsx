import { useMemo } from 'react'
import { useStore } from '../../context/StoreContext'
import { formatMoney as fmt } from '../../lib/currency'

export default function AdminDashboard() {
  const { products, sales } = useStore()

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
    const today = new Date().toDateString()
    const todayRevenue = sales
      .filter((s) => new Date(s.date).toDateString() === today)
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
    <div className="max-w-7xl mx-auto p-4 space-y-6">
      <h1 className="text-2xl font-bold">Dashboard</h1>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {cards.map((c) => (
          <div
            key={c.label}
            className={`bg-white dark:bg-slate-800 border ${toneClass[c.tone]} rounded-lg p-4`}
          >
            <div className="text-sm text-slate-500">{c.label}</div>
            <div className="text-2xl font-bold mt-1">{c.value}</div>
          </div>
        ))}
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700">
          <h2 className="font-semibold">Recent sales</h2>
        </div>
        {recent.length === 0 ? (
          <div className="p-6 text-center text-slate-500 text-sm">No sales yet.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-slate-500 bg-slate-50 dark:bg-slate-900">
              <tr>
                <th className="px-4 py-2 font-medium">Date</th>
                <th className="px-4 py-2 font-medium">Cashier</th>
                <th className="px-4 py-2 font-medium">Items</th>
                <th className="px-4 py-2 font-medium text-right">Total</th>
                <th className="px-4 py-2 font-medium text-right">Profit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
              {recent.map((s) => (
                <tr key={s.id}>
                  <td className="px-4 py-2">{new Date(s.date).toLocaleString()}</td>
                  <td className="px-4 py-2">{s.cashierName}</td>
                  <td className="px-4 py-2">
                    {s.items.reduce((a, i) => a + i.quantity, 0)}
                  </td>
                  <td className="px-4 py-2 text-right">{fmt(s.total)}</td>
                  <td
                    className={`px-4 py-2 text-right ${
                      s.profit >= 0 ? 'text-emerald-600' : 'text-red-600'
                    }`}
                  >
                    {fmt(s.profit)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
