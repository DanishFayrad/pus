'use client'
import { useState, useEffect, useMemo, useCallback } from 'react'
import Link from 'next/link'
import { formatMoney } from '../../lib/currency'
import { formatDateTime } from '../../lib/datetime'
import { printCustomerReceipt, printCashierBill, printWaiterSlip } from '../../lib/restaurantReceipt'
import type { RestaurantOrder } from '../../types'

interface SectionMetric {
  section: string
  totalSales: number
  orderCount: number
  itemsCount: number
  avgOrderValue: number
  percentage: number
}

interface TableMetric {
  tableName: string
  section: string
  waiterName?: string
  waitersList?: string[]
  totalSales: number
  orderCount: number
  itemsCount: number
  avgOrderValue: number
  topDish: string
  percentage: number
}

interface WaiterMetric {
  waiterName: string
  totalSales: number
  orderCount: number
  itemsCount: number
  avgOrderValue: number
  tablesServed: string[]
  percentage: number
}

interface DishMetric {
  name: string
  category: string
  quantity: number
  revenue: number
}

interface SalesResponse {
  summary: {
    totalRevenue: number
    totalSubtotal: number
    totalDiscount: number
    totalTax: number
    totalOrders: number
    totalItemsSold: number
    avgOrderValue: number
    paymentBreakdown: {
      cash: { count: number; total: number }
      card: { count: number; total: number }
      credit: { count: number; total: number }
    }
  }
  sections: SectionMetric[]
  tables: TableMetric[]
  waiters?: WaiterMetric[]
  allWaiters?: string[]
  topDishes: DishMetric[]
  orders: RestaurantOrder[]
}

export default function RestaurantSalesView() {
  const [data, setData] = useState<SalesResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Filter States
  const [dateRange, setDateRange] = useState<'today' | 'yesterday' | 'last7' | 'last30' | 'custom'>('today')
  const [startDate, setStartDate] = useState(() => new Date().toISOString().split('T')[0])
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split('T')[0])
  const [selectedSection, setSelectedSection] = useState<string>('ALL')
  const [selectedTable, setSelectedTable] = useState<string>('ALL')
  const [selectedWaiter, setSelectedWaiter] = useState<string>('ALL')
  const [paymentMethod, setPaymentMethod] = useState<string>('ALL')
  const [searchQuery, setSearchQuery] = useState('')

  // View States: 3 Tabs (Tables, Orders Ledger, Dishes)
  const [activeTab, setActiveTab] = useState<'tables' | 'orders' | 'dishes'>('tables')
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null)

  // Fetch Sales Data
  const fetchSalesData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      params.set('range', dateRange)
      if (dateRange === 'custom') {
        params.set('startDate', startDate)
        params.set('endDate', endDate)
      }
      if (selectedSection !== 'ALL') params.set('section', selectedSection)
      if (selectedTable !== 'ALL') params.set('table', selectedTable)
      if (selectedWaiter !== 'ALL') params.set('waiter', selectedWaiter)
      if (paymentMethod !== 'ALL') params.set('paymentMethod', paymentMethod)
      if (searchQuery.trim()) params.set('q', searchQuery.trim())

      const res = await fetch(`/api/restaurant/sales?${params.toString()}`)
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || 'Failed to load restaurant sales data')
      }
      const json = await res.json()
      setData(json)
    } catch (err) {
      console.error('Restaurant sales fetch error:', err)
      setError(err instanceof Error ? err.message : 'Failed to fetch sales')
    } finally {
      setLoading(false)
    }
  }, [dateRange, startDate, endDate, selectedSection, selectedTable, selectedWaiter, paymentMethod, searchQuery])

  useEffect(() => {
    fetchSalesData()
  }, [fetchSalesData])

  // Summary Report Printout
  const handlePrintSummary = () => {
    if (!data) return
    const printWindow = window.open('', '_blank', 'width=380,height=700')
    if (!printWindow) return

    const summary = data.summary
    const sectionsHtml = data.sections
      .map(
        (s) => `
        <div style="display: flex; justify-content: space-between; font-size: 11px; padding: 2px 0;">
          <strong>Section ${s.section}:</strong>
          <span>${formatMoney(s.totalSales)} (${s.orderCount} orders • ${s.percentage}%)</span>
        </div>
      `,
      )
      .join('')

    const tablesHtml = data.tables
      .filter((t) => t.totalSales > 0)
      .map(
        (t) => `
        <tr>
          <td style="padding: 3px 0; text-align: left;">${t.tableName}</td>
          <td style="padding: 3px 0; text-align: center;">${t.section}</td>
          <td style="padding: 3px 0; text-align: right;">${t.orderCount}</td>
          <td style="padding: 3px 0; text-align: right; font-weight: bold;">${formatMoney(t.totalSales)}</td>
        </tr>
      `,
      )
      .join('')

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Restaurant Sales Summary</title>
          <style>
            @page { margin: 0; size: auto; }
            body {
              font-family: 'Courier New', Courier, monospace;
              font-size: 11px;
              color: #000;
              margin: 0 auto;
              padding: 10px;
              max-width: 260px;
              text-align: center;
            }
            .title { font-size: 16px; font-weight: 900; text-transform: uppercase; }
            .badge { display: inline-block; background: #000; color: #fff; padding: 2px 6px; font-size: 10px; font-weight: bold; margin: 4px 0; }
            .divider { border-top: 1px dashed #000; margin: 6px 0; }
            table { width: 100%; border-collapse: collapse; font-size: 10px; margin-top: 4px; }
            th { border-bottom: 1px solid #000; padding-bottom: 2px; }
          </style>
        </head>
        <body>
          <div class="title">MILANO GARDEN</div>
          <div class="badge">RESTAURANT SALES REPORT</div>
          <div style="font-size: 9.5px; margin-bottom: 4px;">
            Range: ${dateRange.toUpperCase()}<br/>
            Printed: ${formatDateTime(new Date())}
          </div>
          <div class="divider"></div>

          <div style="text-align: left; font-size: 11px;">
            <div style="display: flex; justify-content: space-between; font-weight: bold; font-size: 13px; margin-bottom: 4px;">
              <span>TOTAL REVENUE:</span>
              <span>${formatMoney(summary.totalRevenue)}</span>
            </div>
            <div style="display: flex; justify-content: space-between;">
              <span>Total Orders:</span>
              <strong>${summary.totalOrders}</strong>
            </div>
            <div style="display: flex; justify-content: space-between;">
              <span>Dishes Served:</span>
              <strong>${summary.totalItemsSold}</strong>
            </div>
            <div style="display: flex; justify-content: space-between;">
              <span>Avg Bill/Table:</span>
              <strong>${formatMoney(summary.avgOrderValue)}</strong>
            </div>
          </div>

          <div class="divider"></div>
          <div style="font-weight: 900; text-align: left; font-size: 11px; margin-bottom: 2px;">SECTION BREAKDOWN:</div>
          ${sectionsHtml}

          <div class="divider"></div>
          <div style="font-weight: 900; text-align: left; font-size: 11px; margin-bottom: 2px;">TABLE SALES BREAKDOWN:</div>
          <table>
            <thead>
              <tr>
                <th style="text-align: left;">Table</th>
                <th style="text-align: center;">Sec</th>
                <th style="text-align: right;">Orders</th>
                <th style="text-align: right;">Sales</th>
              </tr>
            </thead>
            <tbody>
              ${tablesHtml}
            </tbody>
          </table>

          <div class="divider"></div>
          <div style="font-size: 9px; line-height: 1.4;">
            Manager Signature: ______________<br/>
            Printed by System
          </div>

          <script>
            window.onload = function() {
              window.print();
              setTimeout(function() { window.close(); }, 400);
            };
          </script>
        </body>
      </html>
    `
    printWindow.document.write(html)
    printWindow.document.close()
  }

  // Section Color Helper
  const getSectionBadge = (sec: string) => {
    const s = sec.toUpperCase()
    if (s === 'A') return 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800'
    if (s === 'B') return 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800'
    if (s === 'C') return 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800'
    return 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-800'
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto animate-in fade-in duration-150">
      {/* ========================================================================= */}
      {/* 1. TOP HEADER & DATE RANGE CONTROLS                                       */}
      {/* ========================================================================= */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-2xl">📊</span>
            <h1 className="text-xl font-black text-slate-900 dark:text-white tracking-tight">
              Restaurant POS Sales
            </h1>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300">
              Live DB
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Dedicated dining sales ledger, Section-wise (A, B, C) analytics, and separate table revenue.
          </p>
        </div>

        {/* Action Controls: Floor Plan Link, Refresh, Print Summary */}
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/admin/restaurant"
            className="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-100 hover:border-slate-300 transition shadow-sm flex items-center gap-1.5"
          >
            <span>🍽️</span>
            <span>Floor Plan POS</span>
          </Link>

          <button
            type="button"
            onClick={fetchSalesData}
            disabled={loading}
            className="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-100 transition shadow-sm flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            title="Refresh sales records"
          >
            <span className={loading ? 'animate-spin' : ''}>🔄</span>
            <span>Refresh</span>
          </button>

          <button
            type="button"
            onClick={handlePrintSummary}
            disabled={!data || data.summary.totalOrders === 0}
            className="px-4 py-2 rounded-xl bg-slate-900 text-white dark:bg-white dark:text-slate-900 text-xs font-black shadow-sm flex items-center gap-1.5 hover:opacity-90 transition cursor-pointer disabled:opacity-40"
            title="Print Closing / Summary Slip"
          >
            <span>🖨️</span>
            <span>Print Summary Slip</span>
          </button>
        </div>
      </div>

      {/* Date Range Selector Pills & Custom Inputs */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white dark:bg-slate-900 p-3.5 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-bold text-slate-400 mr-1">Period:</span>
          {(
            [
              { id: 'today', label: '📅 Today' },
              { id: 'yesterday', label: 'Yesterday' },
              { id: 'last7', label: 'Last 7 Days' },
              { id: 'last30', label: 'Last 30 Days' },
              { id: 'custom', label: 'Custom Range' },
            ] as const
          ).map((pill) => (
            <button
              key={pill.id}
              type="button"
              onClick={() => setDateRange(pill.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                dateRange === pill.id
                  ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/25'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              {pill.label}
            </button>
          ))}
        </div>

        {dateRange === 'custom' && (
          <div className="flex items-center gap-2 animate-in fade-in duration-150">
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="px-2.5 py-1.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-white"
            />
            <span className="text-xs text-slate-400">to</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="px-2.5 py-1.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-white"
            />
          </div>
        )}
      </div>

      {error && (
        <div className="p-4 rounded-2xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-red-700 dark:text-red-300 text-xs font-bold flex items-center justify-between">
          <span>⚠️ {error}</span>
          <button type="button" onClick={fetchSalesData} className="underline cursor-pointer">
            Try again
          </button>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. OVERALL KPI STATS CARDS                                                */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        {/* Card 1: Total Revenue */}
        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Restaurant Revenue</span>
            <span className="h-8 w-8 rounded-xl bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold text-sm">
              💰
            </span>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black text-slate-900 dark:text-white">
              {formatMoney(data?.summary.totalRevenue || 0)}
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">
              Disc: -{formatMoney(data?.summary.totalDiscount || 0)} • Tax: +{formatMoney(data?.summary.totalTax || 0)}
            </div>
          </div>
        </div>

        {/* Card 2: Total Orders */}
        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Completed Orders</span>
            <span className="h-8 w-8 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold text-sm">
              🧾
            </span>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400">
              {data?.summary.totalOrders || 0}
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">
              Average Bill: <strong>{formatMoney(data?.summary.avgOrderValue || 0)}</strong>
            </div>
          </div>
        </div>

        {/* Card 3: Dishes Served */}
        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Food Items Served</span>
            <span className="h-8 w-8 rounded-xl bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400 flex items-center justify-center font-bold text-sm">
              🍽️
            </span>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black text-slate-900 dark:text-white">
              {data?.summary.totalItemsSold || 0}
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5 truncate">
              Top: {data?.topDishes?.[0] ? `${data.topDishes[0].name} (${data.topDishes[0].quantity}x)` : 'None'}
            </div>
          </div>
        </div>

        {/* Card 4: Payment Split */}
        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Payment Breakdown</span>
            <span className="h-8 w-8 rounded-xl bg-purple-50 dark:bg-purple-950/50 text-purple-600 dark:text-purple-400 flex items-center justify-center font-bold text-sm">
              💳
            </span>
          </div>
          <div className="mt-2 space-y-1 text-xs">
            <div className="flex justify-between text-slate-700 dark:text-slate-300">
              <span>Cash ({data?.summary.paymentBreakdown.cash.count || 0}):</span>
              <strong className="text-emerald-600">{formatMoney(data?.summary.paymentBreakdown.cash.total || 0)}</strong>
            </div>
            <div className="flex justify-between text-slate-700 dark:text-slate-300">
              <span>Online ({data?.summary.paymentBreakdown.card.count || 0}):</span>
              <strong className="text-blue-600">{formatMoney(data?.summary.paymentBreakdown.card.total || 0)}</strong>
            </div>
            <div className="flex justify-between text-slate-700 dark:text-slate-300">
              <span>Credit ({data?.summary.paymentBreakdown.credit.count || 0}):</span>
              <strong className="text-amber-600">{formatMoney(data?.summary.paymentBreakdown.credit.total || 0)}</strong>
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 3. A, B, C SECTIONS SEPARATE SALES CARDS (Exact User Requirement!)        */}
      {/* ========================================================================= */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-base">🏢</span>
            <h2 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-wider">
              Section-wise Sales (A, B, C Breakdown)
            </h2>
          </div>
          <span className="text-xs text-slate-400">Click a section card to filter tables</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
          {data?.sections.map((sec) => {
            const isSelected = selectedSection === sec.section
            const badgeClass = getSectionBadge(sec.section)

            return (
              <div
                key={sec.section}
                onClick={() => setSelectedSection(isSelected ? 'ALL' : sec.section)}
                className={`p-4 rounded-2xl border transition-all duration-150 cursor-pointer flex flex-col justify-between shadow-sm hover:shadow-md ${
                  isSelected
                    ? 'border-blue-500 bg-blue-50/40 dark:bg-blue-950/40 ring-2 ring-blue-500/20'
                    : 'border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-slate-300'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className={`px-3 py-1 rounded-xl text-xs font-black border ${badgeClass}`}>
                      SECTION {sec.section}
                    </span>
                    <span className="text-xs font-bold text-slate-400">
                      {sec.percentage}% of total sales
                    </span>
                  </div>

                  <div className="mt-2">
                    <div className="text-2xl font-black text-slate-900 dark:text-white">
                      {formatMoney(sec.totalSales)}
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 flex items-center justify-between">
                      <span>{sec.orderCount} completed orders</span>
                      <span>Avg Bill: {formatMoney(sec.avgOrderValue)}</span>
                    </div>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-800">
                  <div className="h-2 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-blue-600 transition-all duration-300"
                      style={{ width: `${Math.min(100, Math.max(0, sec.percentage))}%` }}
                    />
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 4. TABLE-BY-TABLE SALES, ORDERS LEDGER & DISHES TABS                      */}
      {/* ========================================================================= */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm overflow-hidden">
        {/* Header & Tabs Bar with Filters */}
        <div className="p-3.5 border-b border-slate-200/80 dark:border-slate-800 flex flex-col xl:flex-row xl:items-center justify-between gap-3 bg-white dark:bg-slate-900">
          {/* 3 Tabs */}
          <div className="flex flex-wrap items-center gap-1.5 bg-slate-100/90 dark:bg-slate-800/70 p-1 rounded-xl">
            <button
              type="button"
              onClick={() => setActiveTab('tables')}
              className={`px-3 py-1.5 rounded-lg text-xs font-black transition cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'tables'
                  ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <span>🪑</span>
              <span>Table-by-Table Sales ({data?.tables?.length || 0})</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('orders')}
              className={`px-3 py-1.5 rounded-lg text-xs font-black transition cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'orders'
                  ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <span>🧾</span>
              <span>All Orders Ledger ({data?.orders?.length || 0})</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('dishes')}
              className={`px-3 py-1.5 rounded-lg text-xs font-black transition cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'dishes'
                  ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <span>🍽️</span>
              <span>Popular Dishes Sold</span>
            </button>
          </div>

          {/* Right: Filters */}
          <div className="flex flex-wrap items-center gap-2">
            {/* 1. Waiter Filter Dropdown */}
            <select
              value={selectedWaiter}
              onChange={(e) => setSelectedWaiter(e.target.value)}
              className="px-2.5 py-1.5 text-xs font-black rounded-xl border border-purple-300 dark:border-purple-700 bg-purple-50/80 dark:bg-purple-950/40 text-purple-900 dark:text-purple-200 focus:outline-none focus:ring-2 focus:ring-purple-500/40 shadow-2xs cursor-pointer"
              title="Filter sales by Waiter"
            >
              <option value="ALL">🤵 All Waiters</option>
              {data?.allWaiters?.map((w) => (
                <option key={w} value={w}>
                  Waiter: {w}
                </option>
              ))}
            </select>

            {/* 2. Section Filter Dropdown */}
            <select
              value={selectedSection}
              onChange={(e) => setSelectedSection(e.target.value)}
              className="px-2.5 py-1.5 text-xs font-bold rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 cursor-pointer"
            >
              <option value="ALL">All Sections</option>
              <option value="A">Section A</option>
              <option value="B">Section B</option>
              <option value="C">Section C</option>
            </select>

            {/* 3. Table Filter Dropdown */}
            <select
              value={selectedTable}
              onChange={(e) => setSelectedTable(e.target.value)}
              className="px-2.5 py-1.5 text-xs font-bold rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 cursor-pointer"
            >
              <option value="ALL">All Tables</option>
              {data?.tables?.filter((t) => Boolean(t.tableName)).map((t) => (
                <option key={t.tableName} value={t.tableName}>
                  {t.tableName} (Sec {t.section})
                </option>
              ))}
            </select>

            {/* 4. Search Input */}
            <div className="relative">
              <input
                type="text"
                placeholder="Search order, table, dish..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-36 sm:w-48 pl-7 pr-3 py-1.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400">🔍</span>
            </div>
          </div>
        </div>

        {/* Waiter-wise Summary Chips Row */}
        {data?.waiters && data.waiters.length > 0 && (
          <div className="px-4 py-2.5 bg-slate-50/70 dark:bg-slate-800/30 border-b border-slate-200/80 dark:border-slate-800 flex flex-wrap items-center gap-2 text-xs">
            <span className="text-[11px] font-black uppercase tracking-wider text-slate-400 mr-1 flex items-center gap-1">
              <span>🤵</span> Waiters:
            </span>
            {data.waiters.map((w) => {
              const isSelected = selectedWaiter === w.waiterName
              return (
                <button
                  key={w.waiterName}
                  type="button"
                  onClick={() => setSelectedWaiter(isSelected ? 'ALL' : w.waiterName)}
                  className={`px-2.5 py-1 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer border ${
                    isSelected
                      ? 'bg-purple-600 text-white border-purple-600 shadow-xs'
                      : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-slate-300'
                  }`}
                  title={`Filter sales for Waiter ${w.waiterName}`}
                >
                  <span>🤵 {w.waiterName}</span>
                  <span
                    className={`px-1.5 py-0.2 rounded-md text-[10px] font-black ${
                      isSelected
                        ? 'bg-purple-700 text-white'
                        : 'bg-purple-50 text-purple-700 dark:bg-purple-950 dark:text-purple-300'
                    }`}
                  >
                    {formatMoney(w.totalSales)}
                  </span>
                  <span className="text-[10px] opacity-60">({w.orderCount} orders)</span>
                </button>
              )
            })}
            {selectedWaiter !== 'ALL' && (
              <button
                type="button"
                onClick={() => setSelectedWaiter('ALL')}
                className="text-[11px] font-bold text-blue-600 hover:underline cursor-pointer ml-1"
              >
                Clear Waiter Filter
              </button>
            )}
          </div>
        )}

        {/* ========================================================================= */}
        {/* VIEW 1: TABLE-BY-TABLE SALES (Default View)                                */}
        {/* ========================================================================= */}
        {activeTab === 'tables' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200/80 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 text-[11px] font-black uppercase text-slate-400 tracking-wider">
                  <th className="py-3 px-4">Table Name</th>
                  <th className="py-3 px-4 text-center">Section</th>
                  <th className="py-3 px-4">Waiter Name</th>
                  <th className="py-3 px-4 text-right">Orders Count</th>
                  <th className="py-3 px-4 text-right">Dishes Served</th>
                  <th className="py-3 px-4 text-right">Average Bill</th>
                  <th className="py-3 px-4 text-right">Total Revenue</th>
                  <th className="py-3 px-4 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                {data?.tables.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-slate-400 font-bold">
                      No tables found matching active filters.
                    </td>
                  </tr>
                ) : (
                  data?.tables.map((t) => (
                    <tr
                      key={t.tableName}
                      className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition"
                    >
                      <td className="py-3 px-4 font-black text-slate-900 dark:text-white flex items-center gap-2">
                        <span className="h-7 w-7 rounded-lg bg-blue-600/10 text-blue-600 dark:text-blue-400 flex items-center justify-center font-black text-xs">
                          {t.tableName?.replace(/^Table\s*/i, '') || t.tableName || 'T'}
                        </span>
                        <span>{t.tableName || 'Table'}</span>
                      </td>

                      <td className="py-3 px-4 text-center">
                        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black border ${getSectionBadge(t.section)}`}>
                          Sec {t.section}
                        </span>
                      </td>

                      {/* Waiter Name Column */}
                      <td className="py-3 px-4">
                        {t.waitersList && t.waitersList.length > 0 ? (
                          <div className="flex flex-wrap items-center gap-1">
                            {t.waitersList.map((w) => (
                              <button
                                key={w}
                                type="button"
                                onClick={() => setSelectedWaiter(w)}
                                className="px-2 py-0.5 rounded-lg text-[10.5px] font-bold bg-purple-50 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300 border border-purple-200/80 dark:border-purple-900/40 hover:bg-purple-100 transition cursor-pointer"
                                title={`Filter all sales for Waiter ${w}`}
                              >
                                🤵 {w}
                              </button>
                            ))}
                          </div>
                        ) : (
                          <span className="text-slate-400 text-xs italic">Staff</span>
                        )}
                      </td>

                      <td className="py-3 px-4 text-right font-bold text-slate-700 dark:text-slate-300">
                        {t.orderCount}
                      </td>

                      <td className="py-3 px-4 text-right text-slate-500">
                        {t.itemsCount}
                      </td>

                      <td className="py-3 px-4 text-right font-bold text-slate-600 dark:text-slate-300">
                        {formatMoney(t.avgOrderValue)}
                      </td>

                      {/* Total Sales (Kis Table Kitni Sales Hain) */}
                      <td className="py-3 px-4 text-right font-black text-sm text-slate-900 dark:text-white">
                        {formatMoney(t.totalSales)}
                      </td>

                      <td className="py-3 px-4 text-center">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedTable(selectedTable === t.tableName ? 'ALL' : t.tableName)
                            setActiveTab('orders')
                          }}
                          className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-blue-50 hover:text-blue-600 dark:hover:bg-blue-950 transition cursor-pointer"
                          title={`View individual order receipts for ${t.tableName}`}
                        >
                          View Orders
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* ========================================================================= */}
        {/* VIEW 2: DETAILED ORDERS LEDGER                                             */}
        {/* ========================================================================= */}
        {activeTab === 'orders' && (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            <div className="p-3 bg-blue-50/40 dark:bg-blue-950/30 flex items-center justify-between text-xs font-bold text-slate-600 dark:text-slate-300">
              <div className="flex items-center gap-2">
                <span>🧾 Orders Ledger</span>
                {selectedTable !== 'ALL' && (
                  <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 text-[10px]">
                    Filtered to {selectedTable}
                  </span>
                )}
                {selectedWaiter !== 'ALL' && (
                  <span className="px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200 text-[10px]">
                    Waiter: {selectedWaiter}
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => {
                  setSelectedTable('ALL')
                  setActiveTab('tables')
                }}
                className="text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
              >
                ← Back to Table Sales
              </button>
            </div>

            {data?.orders.length === 0 ? (
              <div className="py-16 text-center text-slate-400 font-bold">
                <span className="text-3xl">🧾</span>
                <p className="mt-2 text-xs">No restaurant orders found matching current filters</p>
              </div>
            ) : (
              data?.orders.map((order) => {
                const isExpanded = expandedOrderId === order.id

                return (
                  <div key={order.id} className="p-4 transition hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      {/* Left: Table & Order # */}
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-xl bg-blue-600 text-white font-black text-sm flex items-center justify-center shrink-0 shadow-sm">
                          {order.tableName?.replace(/^Table\s*/i, '') || 'T'}
                        </div>
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-black text-xs text-slate-900 dark:text-white">
                              {order.tableName}
                            </span>
                            <span className={`px-2 py-0.2 rounded-full text-[10px] font-bold border ${getSectionBadge(order.section)}`}>
                              Sec {order.section}
                            </span>
                            <span className="font-mono font-bold text-xs text-blue-600 dark:text-blue-400">
                              {order.orderNumber}
                            </span>
                            {/* Prominent Waiter Name Badge */}
                            <button
                              type="button"
                              onClick={() => {
                                if (order.waiterName) {
                                  setSelectedWaiter(order.waiterName)
                                }
                              }}
                              className="px-2.5 py-0.5 rounded-lg text-[11px] font-black bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300 border border-purple-300 dark:border-purple-800 hover:bg-purple-200 dark:hover:bg-purple-900 transition cursor-pointer flex items-center gap-1 shadow-2xs"
                              title={order.waiterName ? `Filter by Waiter ${order.waiterName}` : 'Staff'}
                            >
                              <span>🤵 Waiter: {order.waiterName || 'Staff'}</span>
                            </button>
                          </div>
                          <div className="text-[11px] text-slate-400 mt-1 flex items-center gap-2">
                            <span>{formatDateTime(order.createdAt)}</span>
                            {order.cashierName && <span>• Cashier: {order.cashierName}</span>}
                          </div>
                        </div>
                      </div>

                      {/* Right: Payment, Amount, and Actions */}
                      <div className="flex items-center gap-3 self-end sm:self-auto">
                        <span className="px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800">
                          {order.paymentMethod || 'Cash'}
                        </span>

                        <div className="text-right">
                          <div className="text-sm font-black text-slate-900 dark:text-white">
                            {formatMoney(order.total)}
                          </div>
                          <div className="text-[10px] text-slate-400">
                            {order.items?.length || 0} dishes
                          </div>
                        </div>

                        {/* Print Dropdown / Buttons */}
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => printWaiterSlip(order)}
                            className="p-1.5 rounded-lg border border-purple-200 dark:border-purple-800 bg-purple-50 text-purple-700 hover:bg-purple-100 transition text-xs font-bold cursor-pointer"
                            title="Print Waiter Slip"
                          >
                            🤵
                          </button>
                          <button
                            type="button"
                            onClick={() => printCashierBill(order)}
                            className="p-1.5 rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition text-xs font-bold cursor-pointer"
                            title="Print Cashier Slip"
                          >
                            💵
                          </button>
                          <button
                            type="button"
                            onClick={() => printCustomerReceipt(order)}
                            className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 text-slate-700 hover:bg-slate-100 transition text-xs font-bold cursor-pointer"
                            title="Print Customer Receipt"
                          >
                            🧾
                          </button>
                          <button
                            type="button"
                            onClick={() => setExpandedOrderId(isExpanded ? null : order.id)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 transition cursor-pointer"
                            title="View Items Details"
                          >
                            {isExpanded ? '▲' : '▼'}
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Expandable Order Dishes Breakdown */}
                    {isExpanded && (
                      <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 text-xs animate-in fade-in duration-150">
                        <div className="font-bold text-slate-500 mb-1.5">Items Ordered:</div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                          {order.items?.map((it, idx) => (
                            <div
                              key={idx}
                              className="p-2 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700 flex justify-between"
                            >
                              <div>
                                <span className="font-bold text-slate-900 dark:text-white">
                                  {it.quantity}x {it.name}
                                </span>
                                {it.notes && (
                                  <div className="text-[10px] text-amber-600 dark:text-amber-400 italic">
                                    Note: {it.notes}
                                  </div>
                                )}
                              </div>
                              <span className="font-bold text-slate-700 dark:text-slate-300">
                                {formatMoney(it.price * it.quantity)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })
            )}
          </div>
        )}

        {/* ========================================================================= */}
        {/* VIEW 3: POPULAR DISHES SOLD RANKING                                       */}
        {/* ========================================================================= */}
        {activeTab === 'dishes' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200/80 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 text-[11px] font-black uppercase text-slate-400 tracking-wider">
                  <th className="py-3 px-4"># Rank</th>
                  <th className="py-3 px-4">Dish Name</th>
                  <th className="py-3 px-4">Category</th>
                  <th className="py-3 px-4 text-right">Quantity Sold</th>
                  <th className="py-3 px-4 text-right">Total Revenue</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                {!data?.topDishes || data.topDishes.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-12 text-center text-slate-400 font-bold">
                      No dish sales data available for this range.
                    </td>
                  </tr>
                ) : (
                  data.topDishes.map((dish, idx) => (
                    <tr key={dish.name} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition">
                      <td className="py-3 px-4 font-black text-slate-500">
                        {idx === 0 ? '🥇 1' : idx === 1 ? '🥈 2' : idx === 2 ? '🥉 3' : `${idx + 1}`}
                      </td>
                      <td className="py-3 px-4 font-bold text-slate-900 dark:text-white">
                        {dish.name}
                      </td>
                      <td className="py-3 px-4">
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                          {dish.category}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right font-black text-blue-600 dark:text-blue-400">
                        {dish.quantity}x
                      </td>
                      <td className="py-3 px-4 text-right font-black text-slate-900 dark:text-white">
                        {formatMoney(dish.revenue)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
