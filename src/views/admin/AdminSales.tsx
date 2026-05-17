import { Fragment, useMemo, useState } from 'react'
import { useStore } from '../../context/StoreContext'
import { formatMoney as fmt } from '../../lib/currency'

export default function AdminSales() {
  const { sales } = useStore()
  const [expanded, setExpanded] = useState<string | null>(null)

  const totals = useMemo(() => {
    return sales.reduce(
      (acc, s) => {
        acc.revenue += s.total
        acc.cost += s.cost
        acc.profit += s.profit
        return acc
      },
      { revenue: 0, cost: 0, profit: 0 },
    )
  }, [sales])

  return (
    <div className="max-w-7xl mx-auto p-4 space-y-4">
      <h1 className="text-2xl font-bold">Sales history</h1>

      <div className="grid sm:grid-cols-3 gap-3">
        <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-4">
          <div className="text-sm text-slate-500">Total revenue</div>
          <div className="text-2xl font-bold mt-1">{fmt(totals.revenue)}</div>
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-4">
          <div className="text-sm text-slate-500">Total cost</div>
          <div className="text-2xl font-bold mt-1">{fmt(totals.cost)}</div>
        </div>
        <div
          className={`bg-white dark:bg-slate-800 rounded-lg border p-4 ${
            totals.profit >= 0
              ? 'border-emerald-200 dark:border-emerald-900'
              : 'border-red-200 dark:border-red-900'
          }`}
        >
          <div className="text-sm text-slate-500">
            {totals.profit >= 0 ? 'Profit' : 'Loss'}
          </div>
          <div
            className={`text-2xl font-bold mt-1 ${
              totals.profit >= 0 ? 'text-emerald-600' : 'text-red-600'
            }`}
          >
            {fmt(Math.abs(totals.profit))}
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm overflow-hidden">
        {sales.length === 0 ? (
          <div className="p-6 text-center text-slate-500 text-sm">No sales recorded yet.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-slate-500 bg-slate-50 dark:bg-slate-900">
              <tr>
                <th className="px-4 py-2 font-medium">Receipt</th>
                <th className="px-4 py-2 font-medium">Date</th>
                <th className="px-4 py-2 font-medium">Cashier</th>
                <th className="px-4 py-2 font-medium text-right">Items</th>
                <th className="px-4 py-2 font-medium text-right">Total</th>
                <th className="px-4 py-2 font-medium text-right">Profit</th>
                <th />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
              {sales.map((s) => {
                const isOpen = expanded === s.id
                return (
                  <Fragment key={s.id}>
                    <tr>
                      <td className="px-4 py-2 font-mono text-xs">{s.id}</td>
                      <td className="px-4 py-2">{new Date(s.date).toLocaleString()}</td>
                      <td className="px-4 py-2">{s.cashierName}</td>
                      <td className="px-4 py-2 text-right">
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
                      <td className="px-4 py-2 text-right">
                        <button
                          type="button"
                          onClick={() => setExpanded(isOpen ? null : s.id)}
                          className="text-blue-600 hover:underline"
                        >
                          {isOpen ? 'Hide' : 'View'}
                        </button>
                      </td>
                    </tr>
                    {isOpen && (
                      <tr key={s.id + '-d'} className="bg-slate-50 dark:bg-slate-900/40">
                        <td colSpan={7} className="px-4 py-3">
                          <table className="w-full text-xs">
                            <thead className="text-slate-500">
                              <tr>
                                <th className="text-left py-1 font-medium">Product</th>
                                <th className="text-left py-1 font-medium">Barcode</th>
                                <th className="text-right py-1 font-medium">Qty</th>
                                <th className="text-right py-1 font-medium">Price</th>
                                <th className="text-right py-1 font-medium">Line</th>
                              </tr>
                            </thead>
                            <tbody>
                              {s.items.map((i) => (
                                <tr key={i.productId}>
                                  <td className="py-1">{i.name}</td>
                                  <td className="py-1 font-mono">{i.barcode}</td>
                                  <td className="py-1 text-right">{i.quantity}</td>
                                  <td className="py-1 text-right">{fmt(i.price)}</td>
                                  <td className="py-1 text-right">
                                    {fmt(i.price * i.quantity)}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
