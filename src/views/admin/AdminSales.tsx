import { Fragment, useMemo, useState } from 'react'
import { useStore } from '../../context/StoreContext'
import { useConfirm } from '../../components/ConfirmProvider'
import Spinner from '../../components/Spinner'
import { formatMoney as fmt } from '../../lib/currency'
import { formatDateTime } from '../../lib/datetime'

export default function AdminSales() {
  const { sales, deleteSale } = useStore()
  const confirm = useConfirm()
  const [expanded, setExpanded] = useState<string | null>(null)
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
      if (expanded === id) setExpanded(null)
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : 'Delete failed')
    } finally {
      setDeletingId(null)
    }
  }

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
    <div className="max-w-7xl mx-auto p-3 sm:p-4 space-y-4">
      <h1 className="text-xl sm:text-2xl font-bold">Sales history</h1>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3">
        <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-3 sm:p-4">
          <div className="text-xs sm:text-sm text-slate-500">Total revenue</div>
          <div className="text-lg sm:text-2xl font-bold mt-1 truncate">{fmt(totals.revenue)}</div>
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-3 sm:p-4">
          <div className="text-xs sm:text-sm text-slate-500">Total cost</div>
          <div className="text-lg sm:text-2xl font-bold mt-1 truncate">{fmt(totals.cost)}</div>
        </div>
        <div
          className={`bg-white dark:bg-slate-800 rounded-lg border p-3 sm:p-4 col-span-2 sm:col-span-1 ${
            totals.profit >= 0
              ? 'border-emerald-200 dark:border-emerald-900'
              : 'border-red-200 dark:border-red-900'
          }`}
        >
          <div className="text-xs sm:text-sm text-slate-500">
            {totals.profit >= 0 ? 'Profit' : 'Loss'}
          </div>
          <div
            className={`text-lg sm:text-2xl font-bold mt-1 truncate ${
              totals.profit >= 0 ? 'text-emerald-600' : 'text-red-600'
            }`}
          >
            {fmt(Math.abs(totals.profit))}
          </div>
        </div>
      </div>

      {deleteError && (
        <div className="text-sm text-red-600 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-md px-3 py-2">
          {deleteError}
        </div>
      )}

      <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm overflow-hidden">
        {sales.length === 0 ? (
          <div className="p-6 text-center text-slate-500 text-sm">No sales recorded yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-slate-500 bg-slate-50 dark:bg-slate-900">
                <tr>
                  <th className="px-3 sm:px-4 py-2 font-medium">Receipt</th>
                  <th className="px-3 sm:px-4 py-2 font-medium hidden md:table-cell">Date</th>
                  <th className="px-3 sm:px-4 py-2 font-medium hidden sm:table-cell">Cashier</th>
                  <th className="px-3 sm:px-4 py-2 font-medium text-right hidden sm:table-cell">Items</th>
                  <th className="px-3 sm:px-4 py-2 font-medium text-right">Total</th>
                  <th className="px-3 sm:px-4 py-2 font-medium text-right hidden sm:table-cell">Profit</th>
                  <th />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                {sales.map((s) => {
                  const isOpen = expanded === s.id
                  const shortId = '…' + s.id.slice(-6)
                  const isDeleting = deletingId === s.id
                  return (
                    <Fragment key={s.id}>
                      <tr className={isDeleting ? 'opacity-50 transition-opacity' : ''}>
                        <td className="px-3 sm:px-4 py-2 font-mono text-xs">
                          <span className="sm:hidden">{shortId}</span>
                          <span className="hidden sm:inline">{s.id}</span>
                          <div className="text-[10px] text-slate-500 md:hidden mt-0.5">
                            {formatDateTime(s.date)}
                          </div>
                        </td>
                        <td className="px-3 sm:px-4 py-2 hidden md:table-cell whitespace-nowrap">
                          {formatDateTime(s.date)}
                        </td>
                        <td className="px-3 sm:px-4 py-2 hidden sm:table-cell">{s.cashierName}</td>
                        <td className="px-3 sm:px-4 py-2 text-right hidden sm:table-cell">
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
                        <td className="px-3 sm:px-4 py-2 text-right whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => setExpanded(isOpen ? null : s.id)}
                            className="text-blue-600 hover:underline mr-3"
                          >
                            {isOpen ? 'Hide' : 'View'}
                          </button>
                          <button
                            type="button"
                            disabled={isDeleting}
                            onClick={() => removeSale(s.id, `${fmt(s.total)} · ${formatDateTime(s.date)}`)}
                            className="text-red-600 hover:underline disabled:opacity-50 inline-flex items-center gap-1"
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
                      {isOpen && (
                        <tr key={s.id + '-d'} className="bg-slate-50 dark:bg-slate-900/40">
                          <td colSpan={7} className="px-3 sm:px-4 py-3">
                            <div className="overflow-x-auto">
                              <table className="w-full text-xs">
                                <thead className="text-slate-500">
                                  <tr>
                                    <th className="text-left py-1 font-medium">Product</th>
                                    <th className="text-left py-1 font-medium hidden sm:table-cell">Barcode</th>
                                    <th className="text-right py-1 font-medium">Qty</th>
                                    <th className="text-right py-1 font-medium">Price</th>
                                    <th className="text-right py-1 font-medium">Line</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {s.items.map((i) => (
                                    <tr key={i.productId}>
                                      <td className="py-1">{i.name}</td>
                                      <td className="py-1 font-mono hidden sm:table-cell">{i.barcode}</td>
                                      <td className="py-1 text-right">{i.quantity}</td>
                                      <td className="py-1 text-right whitespace-nowrap">{fmt(i.price)}</td>
                                      <td className="py-1 text-right whitespace-nowrap">
                                        {fmt(i.price * i.quantity)}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
