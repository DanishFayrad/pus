import { Fragment, useMemo, useState, useEffect, useCallback } from 'react'
import { useStore } from '../../context/StoreContext'
import { useConfirm } from '../../components/ConfirmProvider'
import Spinner from '../../components/Spinner'
import { formatMoney as fmt } from '../../lib/currency'
import { formatDateTime } from '../../lib/datetime'
import { useAuth } from '../../context/AuthContext'
import type { Sale } from '../../types'

interface CustomerGroup {
  id: string
  customerName: string
  customerPhone: string
  sales: Sale[]
  totalUnpaid: number
  totalPaid: number
  total: number
  lastDate: string
}

export default function AdminCredits() {
  const { updateSale, deleteSale } = useStore()
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'
  const confirm = useConfirm()
  const [expanded, setExpanded] = useState<string | null>(null)
  const [expandedReceipt, setExpandedReceipt] = useState<string | null>(null)
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [updateError, setUpdateError] = useState<string | null>(null)
  
  // Search and status filter states
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'unpaid' | 'paid'>('unpaid')

  // Fetch all credit sales directly from database (not capped by general sales limit)
  const [creditSales, setCreditSales] = useState<Sale[]>([])
  const [loadingCredits, setLoadingCredits] = useState(true)

  const fetchCredits = useCallback(async () => {
    try {
      setLoadingCredits(true)
      const res = await fetch('/api/sales?paymentMethod=credit&all=true')
      if (res.ok) {
        const data = await res.json()
        if (Array.isArray(data.sales)) {
          setCreditSales(data.sales)
        }
      }
    } catch (err) {
      console.error('Failed to load credit sales:', err)
    } finally {
      setLoadingCredits(false)
    }
  }, [])

  useEffect(() => {
    void fetchCredits()
  }, [fetchCredits])

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

  // Group credit sales by customer (matching by phone number first, then by lowercase trimmed name)
  const customerGroups = useMemo(() => {
    const groupsMap = new Map<string, Sale[]>()
    
    creditSales.forEach(s => {
      const phone = s.customerPhone?.trim()
      const name = s.customerName?.trim().toLowerCase()
      
      let key = ''
      if (phone) {
        key = `phone:${phone}`
      } else if (name) {
        key = `name:${name}`
      } else {
        key = 'unknown'
      }
      
      if (!groupsMap.has(key)) {
        groupsMap.set(key, [])
      }
      groupsMap.get(key)!.push(s)
    })
    
    const list: CustomerGroup[] = []
    
    groupsMap.forEach((groupSales, key) => {
      // Sort sales by date descending to get the latest customer name/phone and latest transaction date
      const sortedSales = [...groupSales].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      
      const latestSale = sortedSales[0]
      const customerName = latestSale.customerName || 'N/A'
      const customerPhone = latestSale.customerPhone || ''
      
      let totalUnpaid = 0
      let totalPaid = 0
      
      groupSales.forEach(s => {
        const isPaid = s.creditStatus === 'paid'
        if (isPaid) {
          totalPaid += s.total
        } else {
          totalUnpaid += s.total
        }
      })
      
      list.push({
        id: key,
        customerName,
        customerPhone,
        sales: sortedSales,
        totalUnpaid,
        totalPaid,
        total: totalUnpaid + totalPaid,
        lastDate: latestSale.date
      })
    })
    
    // Sort customer list by last transaction date descending
    return list.sort((a, b) => new Date(b.lastDate).getTime() - new Date(a.lastDate).getTime())
  }, [creditSales])

  // Filtered customer groups
  const filteredGroups = useMemo(() => {
    const q = searchQuery.toLowerCase().trim()
    return customerGroups.filter(g => {
      const matchesSearch = 
        !q || 
        g.customerName.toLowerCase().includes(q) ||
        g.customerPhone.includes(q) ||
        g.sales.some(s => s.id.toLowerCase().includes(q) || s.cashierName.toLowerCase().includes(q))
      
      let matchesStatus = false
      if (statusFilter === 'all') {
        matchesStatus = true
      } else if (statusFilter === 'unpaid') {
        matchesStatus = g.totalUnpaid > 0
      } else if (statusFilter === 'paid') {
        matchesStatus = g.totalPaid > 0 && g.totalUnpaid === 0
      }
      
      return matchesSearch && matchesStatus
    })
  }, [customerGroups, searchQuery, statusFilter])

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
      const newStatus = isPaying ? 'paid' : 'unpaid'
      await updateSale(id, { creditStatus: newStatus })
      setCreditSales((prev) =>
        prev.map((s) => (s.id === id ? { ...s, creditStatus: newStatus } : s)),
      )
    } catch (e) {
      setUpdateError(e instanceof Error ? e.message : 'Action failed')
    } finally {
      setUpdatingId(null)
    }
  }

  // Settle all unpaid credits for a customer group
  const settleAllCredits = async (group: CustomerGroup) => {
    const ok = await confirm({
      title: 'Settle All Balance',
      message: (
        <>
          Confirm receiving the entire outstanding balance of <span className="font-semibold text-emerald-600">{fmt(group.totalUnpaid)}</span> from <span className="font-semibold">{group.customerName}</span>? This will mark all their unpaid bills as settled.
        </>
      ),
      confirmLabel: 'Yes, Settle All',
      tone: 'success',
    })
    if (!ok) return

    setUpdatingId(group.id)
    setUpdateError(null)
    try {
      const unpaidSales = group.sales.filter(s => s.creditStatus !== 'paid')
      for (const s of unpaidSales) {
        await updateSale(s.id, { creditStatus: 'paid' })
      }
      setCreditSales((prev) =>
        prev.map((s) =>
          unpaidSales.some((u) => u.id === s.id) ? { ...s, creditStatus: 'paid' } : s,
        ),
      )
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
      setCreditSales((prev) => prev.filter((s) => s.id !== id))
      if (expandedReceipt === id) setExpandedReceipt(null)
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
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void fetchCredits()}
            disabled={loadingCredits}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 transition shadow-2xs cursor-pointer"
          >
            {loadingCredits ? <Spinner /> : (
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            )}
            Refresh
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-red-150 dark:border-red-955/40 p-4 sm:p-5 shadow-2xs flex flex-col justify-between">
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

        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-emerald-150 dark:border-emerald-955/40 p-4 sm:p-5 shadow-2xs flex flex-col justify-between">
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
        <div className="text-sm font-medium text-red-655 bg-red-50 dark:bg-red-950/20 border border-red-200/50 rounded-xl px-4 py-3 shadow-2xs">
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
        {loadingCredits && creditSales.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-slate-400">
            <Spinner />
            <span className="text-xs">Loading all credit records...</span>
          </div>
        ) : filteredGroups.length === 0 ? (
          <div className="text-sm text-slate-550 py-12 text-center border border-dashed border-slate-200 dark:border-slate-700 rounded-2xl bg-slate-50/20">
            No credit records match search and filters.
          </div>
        ) : (
          <div className="overflow-x-auto border border-slate-100 dark:border-slate-700/60 rounded-xl">
            <table className="w-full text-sm">
              <thead className="text-left text-slate-500 bg-slate-50 dark:bg-slate-900 border-b border-slate-100 dark:border-slate-700/50">
                <tr>
                  <th className="px-4 py-3 font-semibold text-xs uppercase tracking-wider">Customer</th>
                  <th className="px-4 py-3 font-semibold text-xs uppercase tracking-wider hidden sm:table-cell">Phone</th>
                  <th className="px-4 py-3 font-semibold text-xs uppercase tracking-wider text-center">Status</th>
                  <th className="px-4 py-3 font-semibold text-xs uppercase tracking-wider text-right">Outstanding</th>
                  <th className="px-4 py-3 font-semibold text-xs uppercase tracking-wider text-right hidden sm:table-cell">Recovered</th>
                  <th className="px-4 py-3 font-semibold text-xs uppercase tracking-wider text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60">
                {filteredGroups.map((g) => {
                  const isOpen = expanded === g.id
                  const isUpdating = updatingId === g.id
                  const hasUnpaid = g.totalUnpaid > 0
                  
                  return (
                    <Fragment key={g.id}>
                      <tr className={`${isUpdating ? 'opacity-50' : ''} hover:bg-slate-50/40 dark:hover:bg-slate-800/10 transition`}>
                        {/* Customer Name */}
                        <td className="px-4 py-3.5 font-bold text-slate-800 dark:text-slate-100">
                          {g.customerName}
                          <div className="text-[10px] text-slate-500 font-normal mt-0.5">
                            Last Active: {formatDateTime(g.lastDate)}
                          </div>
                        </td>

                        {/* Phone */}
                        <td className="px-4 py-3.5 text-slate-500 dark:text-slate-350 hidden sm:table-cell whitespace-nowrap font-medium">
                          {g.customerPhone || <span className="text-xs text-slate-350 dark:text-slate-650">—</span>}
                        </td>

                        {/* Status Label */}
                        <td className="px-4 py-3.5 text-center whitespace-nowrap">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                            hasUnpaid
                              ? 'bg-red-50 text-red-700 dark:bg-red-950/20 dark:text-red-400'
                              : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-400'
                          }`}>
                            {hasUnpaid ? '🔴 Unpaid' : '🟢 Settled'}
                          </span>
                        </td>

                        {/* Outstanding Amount */}
                        <td className="px-4 py-3.5 text-right font-bold text-red-600 dark:text-red-400 whitespace-nowrap">
                          {fmt(g.totalUnpaid)}
                        </td>

                        {/* Recovered Amount */}
                        <td className="px-4 py-3.5 text-right font-semibold text-emerald-600 dark:text-emerald-400 hidden sm:table-cell whitespace-nowrap">
                          {fmt(g.totalPaid)}
                        </td>

                        {/* Actions */}
                        <td className="px-4 py-3.5 text-right whitespace-nowrap gap-2">
                          <button
                            type="button"
                            onClick={() => setExpanded(isOpen ? null : g.id)}
                            className="text-xs font-bold text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 hover:underline mr-4 cursor-pointer"
                          >
                            {isOpen ? 'Hide Ledger' : `View Ledger (${g.sales.length})`}
                          </button>
                          
                          {hasUnpaid && (
                            <button
                              type="button"
                              disabled={updatingId !== null}
                              onClick={() => settleAllCredits(g)}
                              className="px-3 py-1.5 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-2xs hover:shadow-xs transition duration-150 cursor-pointer inline-flex items-center gap-1"
                            >
                              {updatingId === g.id ? (
                                <>
                                  <Spinner /> Settling…
                                </>
                              ) : (
                                'Settle All Balance'
                              )}
                            </button>
                          )}
                        </td>
                      </tr>

                      {/* Customer Detailed Ledger (Receipts List) */}
                      {isOpen && (
                        <tr className="bg-slate-50/40 dark:bg-slate-900/30">
                          <td colSpan={6} className="px-4 py-4 border-t border-b border-slate-100 dark:border-slate-800">
                            <div className="space-y-4 max-w-full">
                              <div className="flex items-center justify-between">
                                <h4 className="font-bold text-xs text-slate-400 uppercase tracking-wider">
                                  Transaction Ledger: {g.customerName}
                                </h4>
                                <span className="text-xs text-slate-500">
                                  Total credit sales: <strong>{g.sales.length}</strong>
                                </span>
                              </div>
                              
                              <div className="border border-slate-100 dark:border-slate-800/80 rounded-xl overflow-hidden bg-white dark:bg-slate-900/40">
                                <table className="w-full text-xs">
                                  <thead className="bg-slate-50 dark:bg-slate-900 text-slate-500 text-left font-semibold">
                                    <tr className="border-b border-slate-100 dark:border-slate-800">
                                      <th className="px-3 py-2">Receipt</th>
                                      <th className="px-3 py-2">Date</th>
                                      <th className="px-3 py-2 hidden sm:table-cell">Cashier</th>
                                      <th className="px-3 py-2 text-right">Amount</th>
                                      <th className="px-3 py-2 text-center">Status</th>
                                      <th className="px-3 py-2 text-right">Actions</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                    {g.sales.map((sale) => {
                                      const isReceiptOpen = expandedReceipt === sale.id
                                      const isSalePaid = sale.creditStatus === 'paid'
                                      const isSaleUpdating = updatingId === sale.id
                                      
                                      return (
                                        <Fragment key={sale.id}>
                                          <tr className={`hover:bg-slate-50/30 dark:hover:bg-slate-800/5 transition ${isSaleUpdating ? 'opacity-50' : ''}`}>
                                            <td className="px-3 py-2.5 font-mono text-slate-700 dark:text-slate-350">
                                              …{sale.id.slice(-8)}
                                            </td>
                                            <td className="px-3 py-2.5 text-slate-600 dark:text-slate-400">
                                              {formatDateTime(sale.date)}
                                            </td>
                                            <td className="px-3 py-2.5 text-slate-500 hidden sm:table-cell">
                                              {sale.cashierName}
                                            </td>
                                            <td className="px-3 py-2.5 text-right font-bold text-slate-900 dark:text-white">
                                              {fmt(sale.total)}
                                            </td>
                                            <td className="px-3 py-2.5 text-center">
                                              <span className={`inline-flex px-1.5 py-0.5 rounded-full text-[9px] font-bold uppercase ${
                                                isSalePaid
                                                  ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-400'
                                                  : 'bg-red-50 text-red-700 dark:bg-red-950/20 dark:text-red-400'
                                              }`}>
                                                {isSalePaid ? 'Paid' : 'Unpaid'}
                                              </span>
                                            </td>
                                            <td className="px-3 py-2.5 text-right gap-2">
                                              <button
                                                type="button"
                                                onClick={() => setExpandedReceipt(isReceiptOpen ? null : sale.id)}
                                                className="text-[11px] font-bold text-blue-600 hover:text-blue-700 dark:text-blue-400 mr-3 cursor-pointer"
                                              >
                                                {isReceiptOpen ? 'Hide Items' : 'View Items'}
                                              </button>
                                              
                                              <button
                                                type="button"
                                                disabled={updatingId !== null}
                                                onClick={() => togglePaidStatus(sale.id, sale.creditStatus, g.customerName, sale.total)}
                                                className={`px-2 py-1 rounded text-[10px] font-bold transition duration-150 cursor-pointer ${
                                                  isSalePaid
                                                    ? 'bg-amber-50 hover:bg-amber-100 text-amber-700 dark:bg-amber-950/20 dark:text-amber-400'
                                                    : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-400'
                                                }`}
                                              >
                                                {isSaleUpdating ? 'Updating…' : isSalePaid ? 'Mark Unpaid' : 'Mark Paid'}
                                              </button>
                                              
                                              {isAdmin && (
                                                <button
                                                  type="button"
                                                  disabled={updatingId !== null || deletingId === sale.id}
                                                  onClick={() => removeSale(sale.id, `${g.customerName} (${fmt(sale.total)})`)}
                                                  className="px-2 py-1 rounded text-[10px] font-bold bg-red-50 hover:bg-red-100 text-red-700 dark:bg-red-950/20 dark:text-red-400 transition ml-2 cursor-pointer"
                                                >
                                                  {deletingId === sale.id ? 'Deleting…' : 'Delete'}
                                                </button>
                                              )}
                                            </td>
                                          </tr>
                                          
                                          {/* Nested Items for this specific Receipt */}
                                          {isReceiptOpen && (
                                            <tr className="bg-slate-50/80 dark:bg-slate-900/60">
                                              <td colSpan={6} className="px-6 py-2.5">
                                                <div className="border border-slate-100 dark:border-slate-800 rounded-lg p-2 bg-white dark:bg-slate-900/20">
                                                  <table className="w-full text-[11px]">
                                                    <thead>
                                                      <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-500 font-semibold">
                                                        <th className="text-left py-1">Item Name</th>
                                                        <th className="text-right py-1">Qty</th>
                                                        <th className="text-right py-1">Price</th>
                                                        <th className="text-right py-1">Subtotal</th>
                                                      </tr>
                                                    </thead>
                                                    <tbody>
                                                      {sale.items.map((item) => (
                                                        <tr key={item.productId} className="border-b border-slate-50 dark:border-slate-800 last:border-b-0">
                                                          <td className="py-1 text-slate-700 dark:text-slate-300">{item.name}</td>
                                                          <td className="py-1 text-right text-slate-650 dark:text-slate-400">{item.quantity}</td>
                                                          <td className="py-1 text-right text-slate-500">{fmt(item.price)}</td>
                                                          <td className="py-1 text-right font-bold text-slate-800 dark:text-slate-200">
                                                            {fmt(item.price * item.quantity)}
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
