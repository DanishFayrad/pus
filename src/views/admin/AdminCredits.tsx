import { Fragment, useMemo, useState } from 'react'
import { useStore } from '../../context/StoreContext'
import { useConfirm } from '../../components/ConfirmProvider'
import Spinner from '../../components/Spinner'
import { formatMoney as fmt } from '../../lib/currency'
import { formatDateTime } from '../../lib/datetime'
import { useAuth } from '../../context/AuthContext'

export default function AdminCredits() {
  const { sales, updateSale, deleteSale } = useStore()
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'
  const confirm = useConfirm()
  const [expanded, setExpanded] = useState<string | null>(null)
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [updateError, setUpdateError] = useState<string | null>(null)
  
  // Search and status filter states
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'unpaid' | 'paid'>('unpaid')

  // Get only credit sales
  const creditSales = useMemo(() => {
    return sales.filter(s => s.paymentMethod === 'credit')
  }, [sales])

  // Calculate summary metrics
  const metrics = useMemo(() => {
    let totalUnpaid = 0
    let totalPaid = 0
    const uniqueDebtors = new Set<string>()

    creditSales.forEach(s => {
      const amount = s.total || 0
      const isPaid = s.creditStatus === 'paid'
      if (isPaid) {
        totalPaid += amount
      } else {
        totalUnpaid += amount
        if (s.customerName) {
          uniqueDebtors.add(s.customerName.toLowerCase().trim())
        }
      }
    })

    return {
      totalUnpaid,
      totalPaid,
      activeDebtors: uniqueDebtors.size
    }
  }, [creditSales])

  // Filtered sales list
  const filteredSales = useMemo(() => {
    const q = searchQuery.toLowerCase().trim()
    return creditSales.filter(s => {
      const matchesSearch = 
        !q || 
        (s.customerName || '').toLowerCase().includes(q) ||
        (s.customerPhone || '').includes(q) ||
        (s.cashierName || '').toLowerCase().includes(q) ||
        s.id.toLowerCase().includes(q)

      const matchesStatus = 
        statusFilter === 'all' || 
        (statusFilter === 'unpaid' && s.creditStatus !== 'paid') ||
        (statusFilter === 'paid' && s.creditStatus === 'paid')

      return matchesSearch && matchesStatus
    })
  }, [creditSales, searchQuery, statusFilter])

  // Mark a credit sale as paid
  const togglePaidStatus = async (id: string, currentStatus: string | undefined, customer: string | undefined, amount: number) => {
    const isPaying = currentStatus !== 'paid'
    const title = isPaying ? 'Mark as Paid' : 'Mark as Unpaid'
    const message = isPaying ? (
      <>
        Confirm receiving <span className="font-semibold text-emerald-600">{fmt(amount)}</span> from <span className="font-semibold">{customer || 'Customer'}</span>? This will mark this debt as settled.
      </>
    ) : (
      <>
        Revert payment status for <span className="font-semibold">{customer || 'Customer'}</span>? This will make this bill unpaid again.
      </>
    )

    const ok = await confirm({
      title,
      message,
      confirmLabel: isPaying ? 'Yes, Paid' : 'Revert to Unpaid',
      tone: isPaying ? 'success' : 'warning',
    })
    if (!ok) return

    setUpdatingId(id)
    setUpdateError(null)
    try {
      await updateSale(id, { creditStatus: isPaying ? 'paid' : 'unpaid' })
    } catch (e) {
      setUpdateError(e instanceof Error ? e.message : 'Action failed')
    } finally {
      setUpdatingId(null)
    }
  }

  // Delete a credit sale record (admin only)
  const removeSale = async (id: string, label: string) => {
    const ok = await confirm({
      title: 'Delete credit record',
      message: (
        <>
          Delete credit record for <span className="font-semibold">{label}</span>?
          This only removes the record from the ledger — stock will not change.
        </>
      ),
      confirmLabel: 'Delete',
      tone: 'danger',
    })
    if (!ok) return

    setDeletingId(id)
    setUpdateError(null)
    try {
      await deleteSale(id)
      if (expanded === id) setExpanded(null)
    } catch (e) {
      setUpdateError(e instanceof Error ? e.message : 'Delete failed')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="max-w-7xl mx-auto p-3 sm:p-4 space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Credit Book</h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">Track and manage credit sales and customer accounts.</p>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-red-150 dark:border-red-950/40 p-4 sm:p-5 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs sm:text-sm font-bold uppercase tracking-wider text-red-500/80">Total Outstanding Credit</span>
            <span className="p-1.5 rounded-lg bg-red-50 text-red-650 dark:bg-red-950/20 dark:text-red-400">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </span>
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-red-600 dark:text-red-400 mt-3 sm:mt-4 truncate">
            {fmt(metrics.totalUnpaid)}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-emerald-150 dark:border-emerald-950/40 p-4 sm:p-5 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs sm:text-sm font-bold uppercase tracking-wider text-emerald-500/80">Total Recovered (Paid)</span>
            <span className="p-1.5 rounded-lg bg-emerald-50 text-emerald-650 dark:bg-emerald-950/20 dark:text-emerald-400">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </span>
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-emerald-600 dark:text-emerald-400 mt-3 sm:mt-4 truncate">
            {fmt(metrics.totalPaid)}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-150 dark:border-slate-700/60 p-4 sm:p-5 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs sm:text-sm font-bold uppercase tracking-wider text-slate-450 dark:text-slate-400">Active Debtors</span>
            <span className="p-1.5 rounded-lg bg-slate-50 text-slate-600 dark:bg-slate-900 dark:text-slate-400">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </span>
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-slate-800 dark:text-slate-200 mt-3 sm:mt-4 truncate">
            {metrics.activeDebtors}
          </div>
        </div>
      </div>

      {updateError && (
        <div className="text-sm font-medium text-red-650 bg-red-50 dark:bg-red-950/20 border border-red-200/50 rounded-xl px-4 py-3 shadow-2xs">
          ⚠️ {updateError}
        </div>
      )}

      {/* Filters & Table */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700/50 shadow-xs overflow-hidden flex flex-col gap-4 p-4">
        
        {/* Search & Tabs */}
        <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
          <div className="flex-1 relative">
            <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </span>
            <input
              type="text"
              placeholder="Search by customer name, phone, cashier, or receipt..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition shadow-2xs text-sm"
            />
          </div>
          
          <div className="flex bg-slate-50 dark:bg-slate-900/60 p-1 rounded-xl border border-slate-200/30 dark:border-slate-800 shadow-2xs">
            <button
              onClick={() => setStatusFilter('unpaid')}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold transition duration-150 cursor-pointer ${
                statusFilter === 'unpaid'
                  ? 'bg-white dark:bg-slate-800 text-red-600 dark:text-red-400 shadow-xs'
                  : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
              }`}
            >
              🔴 Unpaid Debt
            </button>
            <button
              onClick={() => setStatusFilter('paid')}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold transition duration-150 cursor-pointer ${
                statusFilter === 'paid'
                  ? 'bg-white dark:bg-slate-800 text-emerald-600 dark:text-emerald-400 shadow-xs'
                  : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
              }`}
            >
              🟢 Paid Ledger
            </button>
            <button
              onClick={() => setStatusFilter('all')}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold transition duration-150 cursor-pointer ${
                statusFilter === 'all'
                  ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-xs'
                  : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
              }`}
            >
              All Records
            </button>
          </div>
        </div>

        {/* Ledger Table */}
        {filteredSales.length === 0 ? (
          <div className="text-sm text-slate-550 py-12 text-center border border-dashed border-slate-200 dark:border-slate-700 rounded-2xl bg-slate-50/20">
            No credit records match search and filters.
          </div>
        ) : (
          <div className="overflow-x-auto border border-slate-100 dark:border-slate-700/60 rounded-xl">
            <table className="w-full text-sm">
              <thead className="text-left text-slate-500 bg-slate-50 dark:bg-slate-900 border-b border-slate-100 dark:border-slate-700/50">
                <tr>
                  <th className="px-4 py-3 font-semibold text-xs uppercase tracking-wider">Receipt</th>
                  <th className="px-4 py-3 font-semibold text-xs uppercase tracking-wider">Customer</th>
                  <th className="px-4 py-3 font-semibold text-xs uppercase tracking-wider hidden sm:table-cell">Phone</th>
                  <th className="px-4 py-3 font-semibold text-xs uppercase tracking-wider hidden md:table-cell">Date</th>
                  <th className="px-4 py-3 font-semibold text-xs uppercase tracking-wider hidden sm:table-cell">Cashier</th>
                  <th className="px-4 py-3 font-semibold text-xs uppercase tracking-wider text-right">Amount</th>
                  <th className="px-4 py-3 font-semibold text-xs uppercase tracking-wider text-center">Status</th>
                  <th className="px-4 py-3 font-semibold text-xs uppercase tracking-wider text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60">
                {filteredSales.map((s) => {
                  const isOpen = expanded === s.id
                  const isUpdating = updatingId === s.id
                  const isPaid = s.creditStatus === 'paid'
                  return (
                    <Fragment key={s.id}>
                      <tr className={`${isUpdating ? 'opacity-50' : ''} hover:bg-slate-50/40 dark:hover:bg-slate-800/10 transition`}>
                        {/* Receipt ID */}
                        <td className="px-4 py-3.5 font-mono text-xs text-slate-800 dark:text-slate-200">
                          <span className="sm:hidden">…{s.id.slice(-6)}</span>
                          <span className="hidden sm:inline">{s.id}</span>
                          <div className="text-[10px] text-slate-500 md:hidden mt-0.5">
                            {formatDateTime(s.date)}
                          </div>
                        </td>

                        {/* Customer */}
                        <td className="px-4 py-3.5 font-semibold text-slate-800 dark:text-slate-100">
                          {s.customerName || 'N/A'}
                        </td>

                        {/* Phone */}
                        <td className="px-4 py-3.5 text-slate-500 dark:text-slate-350 hidden sm:table-cell whitespace-nowrap">
                          {s.customerPhone || <span className="text-xs text-slate-350 dark:text-slate-600">—</span>}
                        </td>

                        {/* Date */}
                        <td className="px-4 py-3.5 text-slate-600 dark:text-slate-350 hidden md:table-cell whitespace-nowrap">
                          {formatDateTime(s.date)}
                        </td>

                        {/* Cashier */}
                        <td className="px-4 py-3.5 text-slate-650 dark:text-slate-350 hidden sm:table-cell">
                          {s.cashierName}
                        </td>

                        {/* Amount */}
                        <td className="px-4 py-3.5 text-right font-bold text-slate-900 dark:text-white whitespace-nowrap">
                          {fmt(s.total)}
                        </td>

                        {/* Status */}
                        <td className="px-4 py-3.5 text-center whitespace-nowrap">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                            isPaid
                              ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-400'
                              : 'bg-red-50 text-red-700 dark:bg-red-950/20 dark:text-red-400'
                          }`}>
                            {isPaid ? '🟢 Settled' : '🔴 Unpaid'}
                          </span>
                        </td>

                        {/* Actions */}
                        <td className="px-4 py-3.5 text-right whitespace-nowrap gap-2">
                          <button
                            type="button"
                            onClick={() => setExpanded(isOpen ? null : s.id)}
                            className="text-xs font-bold text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 hover:underline mr-4 cursor-pointer"
                          >
                            {isOpen ? 'Hide items' : 'View items'}
                          </button>
                          
                          <button
                            type="button"
                            disabled={isUpdating}
                            onClick={() => togglePaidStatus(s.id, s.creditStatus, s.customerName, s.total)}
                            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition duration-150 cursor-pointer inline-flex items-center gap-1 ${
                              isPaid
                                ? 'bg-amber-50 hover:bg-amber-100 text-amber-700 dark:bg-amber-950/20 dark:text-amber-400'
                                : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-2xs hover:shadow-xs'
                            }`}
                          >
                            {isUpdating ? (
                              <>
                                <Spinner /> Setting…
                              </>
                            ) : isPaid ? (
                              'Mark Unpaid'
                            ) : (
                              'Mark as Paid'
                            )}
                          </button>

                          {isAdmin && (
                            <button
                              type="button"
                              disabled={isUpdating || deletingId === s.id}
                              onClick={() => removeSale(s.id, `${s.customerName || 'N/A'} (${fmt(s.total)})`)}
                              className="px-3 py-1.5 rounded-xl text-xs font-bold bg-red-50 hover:bg-red-100 text-red-750 dark:bg-red-950/20 dark:text-red-400 transition duration-150 cursor-pointer inline-flex items-center gap-1 ml-2"
                            >
                              {deletingId === s.id ? (
                                <>
                                  <Spinner /> Deleting…
                                </>
                              ) : (
                                'Delete'
                              )}
                            </button>
                          )}
                        </td>
                      </tr>

                      {/* Items details nested list */}
                      {isOpen && (
                        <tr className="bg-slate-50/50 dark:bg-slate-900/30">
                          <td colSpan={8} className="px-4 py-3 border-t border-b border-slate-100 dark:border-slate-800">
                            <div className="overflow-x-auto max-w-full">
                              <table className="w-full text-xs">
                                <thead className="text-slate-500">
                                  <tr className="border-b border-slate-150/40 dark:border-slate-800/40">
                                    <th className="text-left py-1.5 font-semibold">Product Name</th>
                                    <th className="text-left py-1.5 font-semibold hidden sm:table-cell">Barcode</th>
                                    <th className="text-right py-1.5 font-semibold">Qty</th>
                                    <th className="text-right py-1.5 font-semibold">Price</th>
                                    <th className="text-right py-1.5 font-semibold">Subtotal</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {s.items.map((i) => (
                                    <tr key={i.productId} className="hover:bg-slate-50/60 dark:hover:bg-slate-900/40">
                                      <td className="py-1.5 text-slate-700 dark:text-slate-350">{i.name}</td>
                                      <td className="py-1.5 font-mono hidden sm:table-cell text-slate-500">{i.barcode}</td>
                                      <td className="py-1.5 text-right font-medium text-slate-750 dark:text-slate-300">{i.quantity}</td>
                                      <td className="py-1.5 text-right text-slate-600 dark:text-slate-350">{fmt(i.price)}</td>
                                      <td className="py-1.5 text-right font-bold text-slate-800 dark:text-slate-200">
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
