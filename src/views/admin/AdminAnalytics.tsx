'use client'

import { useState, useEffect, useMemo } from 'react'
import dynamic from 'next/dynamic'
import { formatMoney as fmt } from '../../lib/currency'

// Dynamically import react-apexcharts to prevent SSR errors in Next.js
const Chart = dynamic(() => import('react-apexcharts'), { ssr: false })

type Preset = 'all' | 'today' | 'yesterday' | '7days' | '30days' | 'thisMonth' | 'lastMonth' | 'thisYear' | 'custom'
type GroupBy = 'hour' | 'day' | 'week' | 'month' | 'year'

interface KPIData {
  totalRevenue: number
  totalCost: number
  totalProfit: number
  totalOrders: number
  totalSalesQty: number
  aov: number
  profitMargin: number
}

interface TrendItem {
  time: string
  revenue: number
  profit: number
  cost: number
  orders: number
  salesQty: number
  candle: {
    x: string
    y: [number, number, number, number] // [O, H, L, C]
  }
}

interface ProductStat {
  id: string
  name: string
  barcode: string
  category: string
  quantity: number
  revenue: number
  cost: number
  profit: number
}

interface CategoryStat {
  name: string
  revenue: number
  profit: number
  quantity: number
}

interface PaymentStats {
  cash: number
  credit: number
  cashCount: number
  creditCount: number
}

interface BranchStat {
  name: string
  revenue: number
  profit: number
  orders: number
}

interface RefundStats {
  totalReturnsCount: number
  pendingReturnsCount: number
  approvedReturnsCount: number
  rejectedReturnsCount: number
  totalRefundedAmount: number
  totalRefundedQty: number
}

interface AnalyticsResponse {
  kpis: KPIData
  previousKPIs: KPIData
  growths: {
    revenue: number
    profit: number
    orders: number
    salesQty: number
    aov: number
  }
  trends: TrendItem[]
  topProducts: ProductStat[]
  bestCategories: CategoryStat[]
  paymentMethodStats: PaymentStats
  branchAnalytics: BranchStat[]
  refundStats: RefundStats
  groupBy: GroupBy
  startDate: string
  endDate: string
}

export default function AdminAnalytics() {
  const [preset, setPreset] = useState<Preset>('all')
  const [groupBy, setGroupBy] = useState<GroupBy>('day')
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')
  
  const [data, setData] = useState<AnalyticsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isDarkMode, setIsDarkMode] = useState(false)

  // Track page theme for Chart custom styling
  useEffect(() => {
    const checkTheme = () => {
      const isDark = document.documentElement.classList.contains('dark')
      setIsDarkMode(isDark)
    }
    
    checkTheme()
    
    // Set up a mutation observer to detect theme changes on documentElement
    const observer = new MutationObserver(checkTheme)
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    
    return () => observer.disconnect()
  }, [])

  // Auto-adjust default grouping based on the selected preset
  useEffect(() => {
    if (preset === 'today' || preset === 'yesterday') {
      setGroupBy('hour')
    } else if (preset === '7days' || preset === '30days' || preset === 'thisMonth' || preset === 'lastMonth' || preset === 'all') {
      setGroupBy('day')
    } else if (preset === 'thisYear') {
      setGroupBy('month')
    }
  }, [preset])

  // Fetch analytics data
  const fetchAnalytics = async () => {
    try {
      setLoading(true)
      setError(null)

      let url = `/api/analytics?preset=${preset}&groupBy=${groupBy}`
      if (preset === 'custom') {
        if (!customStart || !customEnd) {
          setError('Please select both start and end dates.')
          setLoading(false)
          return
        }
        url += `&startDate=${new Date(customStart).toISOString()}&endDate=${new Date(customEnd + 'T23:59:59').toISOString()}`
      }

      const res = await fetch(url)
      const json = await res.json()

      if (!res.ok) {
        throw new Error(json.error || 'Failed to fetch analytics')
      }

      setData(json)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (preset !== 'custom') {
      void fetchAnalytics()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset, groupBy])

  const handleCustomApply = () => {
    void fetchAnalytics()
  }

  // --- Chart Configs ---

  const candlestickData = useMemo(() => {
    if (!data || !data.trends) return []
    return data.trends.map((t) => ({
      x: t.time,
      y: t.candle.y,
    }))
  }, [data])

  const chartTheme = isDarkMode ? 'dark' : 'light'
  const textClr = isDarkMode ? '#94a3b8' : '#475569'
  const borderClr = isDarkMode ? '#334155' : '#e2e8f0'

  const candlestickOptions = useMemo((): ApexCharts.ApexOptions => {
    const trends = data?.trends || []
    return {
      chart: {
        type: 'candlestick',
        height: 380,
        background: 'transparent',
        toolbar: { show: true, tools: { download: true, zoom: true, zoomin: true, zoomout: true, pan: true, reset: true } },
        animations: { enabled: true, speed: 800 },
      },
      theme: { mode: chartTheme },
      grid: { borderColor: borderClr },
      xaxis: {
        type: 'category',
        labels: { style: { colors: textClr, fontFamily: 'inherit' } },
        axisBorder: { color: borderClr },
        axisTicks: { color: borderClr },
      },
      yaxis: {
        labels: {
          formatter: (val) => 'Rs ' + Math.round(val).toLocaleString(),
          style: { colors: textClr, fontFamily: 'inherit' },
        },
      },
      plotOptions: {
        candlestick: {
          colors: {
            upward: '#10b981', // emerald-500
            downward: '#ef4444', // red-500
          },
          wick: { useFillColor: true },
        },
      },
      tooltip: {
        shared: true,
        custom: ({ dataPointIndex }) => {
          const item = trends[dataPointIndex]
          if (!item) return ''
          const [o, h, l, c] = item.candle.y
          return `
            <div class="p-3 bg-slate-900 border border-slate-700 text-white rounded-lg shadow-xl text-xs space-y-1.5 font-sans min-w-[200px]">
              <div class="font-bold border-b border-slate-700 pb-1 mb-1 text-slate-300 text-center">${item.time}</div>
              <div class="grid grid-cols-2 gap-x-2">
                <span class="text-slate-400">Open:</span> <span class="text-right font-mono font-semibold">Rs ${o.toFixed(2)}</span>
                <span class="text-slate-400">High:</span> <span class="text-right font-mono font-semibold text-emerald-400">Rs ${h.toFixed(2)}</span>
                <span class="text-slate-400">Low:</span> <span class="text-right font-mono font-semibold text-rose-400">Rs ${l.toFixed(2)}</span>
                <span class="text-slate-400">Close:</span> <span class="text-right font-mono font-semibold">Rs ${c.toFixed(2)}</span>
              </div>
              <div class="border-t border-slate-800 pt-1.5 mt-1 space-y-1">
                <div class="flex justify-between font-semibold"><span class="text-blue-400">Revenue:</span> <span>Rs ${item.revenue.toLocaleString()}</span></div>
                <div class="flex justify-between font-semibold"><span class="text-emerald-400">Profit:</span> <span>Rs ${item.profit.toLocaleString()}</span></div>
                <div class="flex justify-between"><span class="text-slate-400">Orders:</span> <span>${item.orders}</span></div>
                <div class="flex justify-between"><span class="text-slate-400">Items Sold:</span> <span>${item.salesQty}</span></div>
              </div>
            </div>
          `
        },
      },
    }
  }, [data, chartTheme, borderClr, textClr])

  // Revenue vs Profit Area Chart options
  const revProfitOptions = useMemo((): ApexCharts.ApexOptions => {
    return {
      chart: {
        type: 'area',
        height: 300,
        background: 'transparent',
        toolbar: { show: false },
      },
      theme: { mode: chartTheme },
      stroke: { curve: 'smooth', width: 2 },
      colors: ['#3b82f6', '#10b981'], // blue-500, emerald-500
      dataLabels: { enabled: false },
      grid: { borderColor: borderClr },
      xaxis: {
        categories: data?.trends.map((t) => t.time) || [],
        labels: { style: { colors: textClr } },
        axisBorder: { color: borderClr },
      },
      yaxis: {
        labels: {
          formatter: (val) => 'Rs ' + Math.round(val).toLocaleString(),
          style: { colors: textClr },
        },
      },
      fill: {
        type: 'gradient',
        gradient: {
          opacityFrom: 0.45,
          opacityTo: 0.05,
        },
      },
      tooltip: {
        x: { show: true },
        y: {
          formatter: (val) => fmt(val),
        },
      },
    }
  }, [data, chartTheme, borderClr, textClr])

  const revProfitSeries = useMemo(() => {
    if (!data) return []
    return [
      { name: 'Revenue', data: data.trends.map((t) => t.revenue) },
      { name: 'Profit', data: data.trends.map((t) => t.profit) },
    ]
  }, [data])

  // Orders vs Sales Volume Bar Chart options
  const ordersSalesOptions = useMemo((): ApexCharts.ApexOptions => {
    return {
      chart: {
        type: 'bar',
        height: 300,
        background: 'transparent',
        toolbar: { show: false },
      },
      theme: { mode: chartTheme },
      stroke: { show: true, width: 2, colors: ['transparent'] },
      colors: ['#6366f1', '#f59e0b'], // indigo-500, amber-500
      dataLabels: { enabled: false },
      grid: { borderColor: borderClr },
      xaxis: {
        categories: data?.trends.map((t) => t.time) || [],
        labels: { style: { colors: textClr } },
        axisBorder: { color: borderClr },
      },
      yaxis: [
        {
          title: { text: 'Orders', style: { color: '#6366f1' } },
          labels: { style: { colors: textClr } },
        },
        {
          opposite: true,
          title: { text: 'Items Sold', style: { color: '#f59e0b' } },
          labels: { style: { colors: textClr } },
        },
      ],
      tooltip: {
        shared: true,
        intersect: false,
      },
    }
  }, [data, chartTheme, borderClr, textClr])

  const ordersSalesSeries = useMemo(() => {
    if (!data) return []
    return [
      { name: 'Orders Count', data: data.trends.map((t) => t.orders) },
      { name: 'Items Sold (Qty)', data: data.trends.map((t) => t.salesQty) },
    ]
  }, [data])

  // Donut chart configurations
  const donutOptions = (labels: string[]): ApexCharts.ApexOptions => ({
    chart: { type: 'donut', background: 'transparent' },
    theme: { mode: chartTheme },
    labels,
    colors: ['#3b82f6', '#10b981', '#6366f1', '#f59e0b', '#ec4899', '#8b5cf6', '#14b8a6'],
    legend: { position: 'bottom', labels: { colors: textClr } },
    stroke: { colors: [isDarkMode ? '#1e293b' : '#ffffff'] },
    dataLabels: { enabled: true, style: { fontSize: '10px' } },
    plotOptions: {
      pie: {
        donut: {
          size: '65%',
          labels: {
            show: true,
            total: {
              show: true,
              label: 'Total',
              color: textClr,
              formatter: (w) => {
                const sum = w.globals.seriesTotals.reduce((a: number, b: number) => a + b, 0)
                return sum > 1000 ? 'Rs ' + Math.round(sum).toLocaleString() : sum
              },
            },
          },
        },
      },
    },
  })

  // Render Growth Badge helper
  const renderGrowth = (growth: number) => {
    if (preset === 'all') return null
    
    const isPositive = growth >= 0
    const absGrowth = Math.abs(growth).toFixed(1)
    
    if (growth === 0) {
      return (
        <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400">
          0%
        </span>
      )
    }

    return (
      <span
        className={`inline-flex items-center text-xs font-semibold px-2 py-0.5 rounded-full ${
          isPositive
            ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400'
            : 'bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-400'
        }`}
      >
        <svg
          className={`w-3 h-3 mr-1 ${isPositive ? '' : 'transform rotate-180'}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth="2.5"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 10l7-7m0 0l7 7m-7-7v18" />
        </svg>
        {absGrowth}%
      </span>
    )
  }

  const presets: { value: Preset; label: string }[] = [
    { value: 'all', label: 'All Time' },
    { value: 'today', label: 'Today' },
    { value: 'yesterday', label: 'Yesterday' },
    { value: '7days', label: 'Last 7 Days' },
    { value: '30days', label: 'Last 30 Days' },
    { value: 'thisMonth', label: 'This Month' },
    { value: 'lastMonth', label: 'Last Month' },
    { value: 'thisYear', label: 'This Year' },
    { value: 'custom', label: 'Custom' },
  ]

  const groupings: { value: GroupBy; label: string }[] = [
    { value: 'hour', label: 'Hourly' },
    { value: 'day', label: 'Daily' },
    { value: 'week', label: 'Weekly' },
    { value: 'month', label: 'Monthly' },
    { value: 'year', label: 'Yearly' },
  ]

  return (
    <div className="max-w-7xl mx-auto p-3 sm:p-4 md:p-6 space-y-6">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-5">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight bg-gradient-to-r from-slate-900 to-slate-700 dark:from-white dark:to-slate-300 bg-clip-text text-transparent">
            Analytics Dashboard
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Real-time business performance insights, trading charting, and sales comparison metrics.
          </p>
        </div>

        {/* Date Filter & Grouping Selectors */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex bg-slate-100 dark:bg-slate-800 rounded-lg p-0.5 overflow-x-auto border border-slate-200/50 dark:border-slate-700/50 max-w-full">
            {presets.map((p) => (
              <button
                key={p.value}
                onClick={() => setPreset(p.value)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md whitespace-nowrap transition-all duration-200 cursor-pointer ${
                  preset === p.value
                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs font-bold'
                    : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          <div className="flex bg-slate-100 dark:bg-slate-800 rounded-lg p-0.5 border border-slate-200/50 dark:border-slate-700/50">
            {groupings.map((g) => (
              <button
                key={g.value}
                onClick={() => setGroupBy(g.value)}
                disabled={preset === 'today' || preset === 'yesterday'}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all duration-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                  groupBy === g.value
                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs font-bold'
                    : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
                }`}
              >
                {g.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Custom Date Range Selection Row */}
      {preset === 'custom' && (
        <div className="bg-white dark:bg-slate-800/60 border border-slate-150 dark:border-slate-800 rounded-xl p-4 flex flex-wrap items-end gap-4 shadow-xs animate-fadeIn">
          <div className="flex-1 min-w-[200px] space-y-1">
            <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Start Date</label>
            <input
              type="date"
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex-1 min-w-[200px] space-y-1">
            <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">End Date</label>
            <input
              type="date"
              value={customEnd}
              onChange={(e) => setCustomEnd(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <button
            onClick={handleCustomApply}
            className="px-5 py-2 text-sm font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition duration-150 cursor-pointer shadow-sm shadow-blue-500/20"
          >
            Apply Filters
          </button>
        </div>
      )}

      {/* Loading & Error States */}
      {loading && (
        <div className="flex flex-col items-center justify-center py-20 space-y-4">
          <div className="w-12 h-12 border-4 border-blue-600/35 border-t-blue-600 rounded-full animate-spin" />
          <span className="text-sm font-medium text-slate-500 dark:text-slate-400">Loading metrics and compiling charts...</span>
        </div>
      )}

      {error && (
        <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 rounded-xl p-4 text-center">
          <span className="text-sm text-red-600 dark:text-red-400 font-semibold">{error}</span>
          <button
            onClick={fetchAnalytics}
            className="mt-3 block mx-auto px-4 py-1.5 text-xs font-bold bg-red-100 hover:bg-red-200 text-red-700 rounded-md transition"
          >
            Try Again
          </button>
        </div>
      )}

      {/* Dashboard Content */}
      {!loading && !error && data && (
        <div className="space-y-6">
          {/* KPI Cards Grid */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
            {/* Total Revenue */}
            <div className="bg-white dark:bg-slate-800 border border-slate-150 dark:border-slate-800/80 rounded-xl p-3.5 sm:p-4 shadow-xs relative overflow-hidden">
              <div className="absolute top-0 left-0 w-1.5 h-full bg-blue-500" />
              <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Revenue</div>
              <div className="text-lg sm:text-xl font-black mt-1.5 truncate text-slate-900 dark:text-slate-100">{fmt(data.kpis.totalRevenue)}</div>
              {preset !== 'all' ? (
                <div className="flex items-center gap-1.5 mt-2">
                  {renderGrowth(data.growths.revenue)}
                  <span className="text-[10px] text-slate-400 font-medium whitespace-nowrap">vs prev period</span>
                </div>
              ) : (
                <div className="text-[10px] text-slate-400 font-semibold mt-2.5">All-time record</div>
              )}
            </div>

            {/* Total Profit */}
            <div className="bg-white dark:bg-slate-800 border border-slate-150 dark:border-slate-800/80 rounded-xl p-3.5 sm:p-4 shadow-xs relative overflow-hidden">
              <div className="absolute top-0 left-0 w-1.5 h-full bg-emerald-500" />
              <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Profit</div>
              <div className="text-lg sm:text-xl font-black mt-1.5 truncate text-slate-900 dark:text-slate-100">{fmt(data.kpis.totalProfit)}</div>
              {preset !== 'all' ? (
                <div className="flex items-center gap-1.5 mt-2">
                  {renderGrowth(data.growths.profit)}
                  <span className="text-[10px] text-slate-400 font-medium whitespace-nowrap">vs prev period</span>
                </div>
              ) : (
                <div className="text-[10px] text-slate-400 font-semibold mt-2.5">All-time record</div>
              )}
            </div>

            {/* Profit Margin */}
            <div className="bg-white dark:bg-slate-800 border border-slate-150 dark:border-slate-800/80 rounded-xl p-3.5 sm:p-4 shadow-xs relative overflow-hidden">
              <div className="absolute top-0 left-0 w-1.5 h-full bg-teal-500" />
              <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Margin</div>
              <div className="text-lg sm:text-xl font-black mt-1.5 truncate text-slate-900 dark:text-slate-100">
                {data.kpis.profitMargin.toFixed(1)}%
              </div>
              <div className="w-full bg-slate-100 dark:bg-slate-700 h-1.5 rounded-full mt-3 overflow-hidden">
                <div 
                  className="bg-teal-500 h-full rounded-full transition-all duration-500" 
                  style={{ width: `${Math.min(100, Math.max(0, data.kpis.profitMargin))}%` }}
                />
              </div>
            </div>

            {/* Total Orders */}
            <div className="bg-white dark:bg-slate-800 border border-slate-150 dark:border-slate-800/80 rounded-xl p-3.5 sm:p-4 shadow-xs relative overflow-hidden">
              <div className="absolute top-0 left-0 w-1.5 h-full bg-indigo-500" />
              <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Orders</div>
              <div className="text-lg sm:text-xl font-black mt-1.5 truncate text-slate-900 dark:text-slate-100">{data.kpis.totalOrders}</div>
              {preset !== 'all' ? (
                <div className="flex items-center gap-1.5 mt-2">
                  {renderGrowth(data.growths.orders)}
                  <span className="text-[10px] text-slate-400 font-medium whitespace-nowrap">vs prev period</span>
                </div>
              ) : (
                <div className="text-[10px] text-slate-400 font-semibold mt-2.5">All-time record</div>
              )}
            </div>

            {/* Items Sold */}
            <div className="bg-white dark:bg-slate-800 border border-slate-150 dark:border-slate-800/80 rounded-xl p-3.5 sm:p-4 shadow-xs relative overflow-hidden">
              <div className="absolute top-0 left-0 w-1.5 h-full bg-amber-500" />
              <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Items Sold</div>
              <div className="text-lg sm:text-xl font-black mt-1.5 truncate text-slate-900 dark:text-slate-100">{data.kpis.totalSalesQty}</div>
              {preset !== 'all' ? (
                <div className="flex items-center gap-1.5 mt-2">
                  {renderGrowth(data.growths.salesQty)}
                  <span className="text-[10px] text-slate-400 font-medium whitespace-nowrap">vs prev period</span>
                </div>
              ) : (
                <div className="text-[10px] text-slate-400 font-semibold mt-2.5">All-time record</div>
              )}
            </div>

            {/* Average Order Value (AOV) */}
            <div className="bg-white dark:bg-slate-800 border border-slate-150 dark:border-slate-800/80 rounded-xl p-3.5 sm:p-4 shadow-xs relative overflow-hidden">
              <div className="absolute top-0 left-0 w-1.5 h-full bg-rose-500" />
              <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">AOV</div>
              <div className="text-lg sm:text-xl font-black mt-1.5 truncate text-slate-900 dark:text-slate-100">{fmt(data.kpis.aov)}</div>
              {preset !== 'all' ? (
                <div className="flex items-center gap-1.5 mt-2">
                  {renderGrowth(data.growths.aov)}
                  <span className="text-[10px] text-slate-400 font-medium whitespace-nowrap">vs prev period</span>
                </div>
              ) : (
                <div className="text-[10px] text-slate-400 font-semibold mt-2.5">All-time record</div>
              )}
            </div>
          </div>

          {/* Main Trading-Style Candlestick Chart */}
          <div className="bg-white dark:bg-slate-800 border border-slate-150 dark:border-slate-800 rounded-xl p-4 shadow-xs">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-700/60 pb-3 mb-4">
              <div>
                <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100">
                  Revenue / Profit Trading-Style Chart
                </h2>
                <p className="text-xs text-slate-400">
                  Transaction spread sizing (Open, High, Low, Close) per period, mirroring a TradingView candlestick interface.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="flex items-center text-xs text-slate-500 dark:text-slate-400">
                  <span className="w-2.5 h-2.5 bg-emerald-500 rounded-xs mr-1" /> Green = Upward Transaction
                </span>
                <span className="flex items-center text-xs text-slate-500 dark:text-slate-400">
                  <span className="w-2.5 h-2.5 bg-rose-500 rounded-xs mr-1" /> Red = Downward Transaction
                </span>
              </div>
            </div>

            {candlestickData.length === 0 ? (
              <div className="flex items-center justify-center h-80 bg-slate-50 dark:bg-slate-900/40 rounded-lg text-slate-400 text-sm border border-dashed border-slate-200 dark:border-slate-700">
                No transaction data available for the selected interval.
              </div>
            ) : (
              <div className="w-full mix-blend-normal">
                <Chart
                  options={candlestickOptions}
                  series={[{ name: 'Candle', data: candlestickData }]}
                  type="candlestick"
                  height={380}
                />
              </div>
            )}
          </div>

          {/* Trend Analysis Section */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Revenue and Profit Trend */}
            <div className="bg-white dark:bg-slate-800 border border-slate-150 dark:border-slate-800 rounded-xl p-4 shadow-xs">
              <h3 className="text-sm sm:text-base font-bold text-slate-800 dark:text-slate-200 mb-3 border-b border-slate-50 dark:border-slate-700/40 pb-2">
                Revenue & Profit Growth Trend
              </h3>
              {data.trends.length === 0 ? (
                <div className="flex items-center justify-center h-60 bg-slate-50 dark:bg-slate-900/30 rounded-lg text-slate-400 text-sm">No data</div>
              ) : (
                <Chart
                  options={revProfitOptions}
                  series={revProfitSeries}
                  type="area"
                  height={280}
                />
              )}
            </div>

            {/* Orders and Items Sold Volume */}
            <div className="bg-white dark:bg-slate-800 border border-slate-150 dark:border-slate-800 rounded-xl p-4 shadow-xs">
              <h3 className="text-sm sm:text-base font-bold text-slate-800 dark:text-slate-200 mb-3 border-b border-slate-50 dark:border-slate-700/40 pb-2">
                Orders & Sales Volume Distribution
              </h3>
              {data.trends.length === 0 ? (
                <div className="flex items-center justify-center h-60 bg-slate-50 dark:bg-slate-900/30 rounded-lg text-slate-400 text-sm">No data</div>
              ) : (
                <Chart
                  options={ordersSalesOptions}
                  series={ordersSalesSeries}
                  type="bar"
                  height={280}
                />
              )}
            </div>
          </div>

          {/* Breakdown Section */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Best Categories */}
            <div className="bg-white dark:bg-slate-800 border border-slate-150 dark:border-slate-800 rounded-xl p-4 shadow-xs flex flex-col justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 mb-4 border-b border-slate-50 dark:border-slate-700/40 pb-2">
                  Best Categories (Revenue Share)
                </h3>
                {data.bestCategories.length === 0 ? (
                  <div className="flex items-center justify-center h-48 bg-slate-50 dark:bg-slate-900/30 rounded-lg text-slate-400 text-sm">No categories</div>
                ) : (
                  <Chart
                    options={donutOptions(data.bestCategories.map((c) => c.name))}
                    series={data.bestCategories.map((c) => c.revenue)}
                    type="donut"
                    height={260}
                  />
                )}
              </div>
            </div>

            {/* Payment Method Distribution */}
            <div className="bg-white dark:bg-slate-800 border border-slate-150 dark:border-slate-800 rounded-xl p-4 shadow-xs flex flex-col justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 mb-4 border-b border-slate-50 dark:border-slate-700/40 pb-2">
                  Revenue by Payment Method
                </h3>
                {data.paymentMethodStats.cash === 0 && data.paymentMethodStats.credit === 0 ? (
                  <div className="flex items-center justify-center h-48 bg-slate-50 dark:bg-slate-900/30 rounded-lg text-slate-400 text-sm">No transactions</div>
                ) : (
                  <Chart
                    options={donutOptions(['Cash Sales', 'Credit Sales'])}
                    series={[data.paymentMethodStats.cash, data.paymentMethodStats.credit]}
                    type="donut"
                    height={260}
                  />
                )}
              </div>
            </div>

            {/* Branch / Terminal Performance */}
            <div className="bg-white dark:bg-slate-800 border border-slate-150 dark:border-slate-800 rounded-xl p-4 shadow-xs flex flex-col justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 mb-4 border-b border-slate-50 dark:border-slate-700/40 pb-2">
                  Sales by Branch / Terminal
                </h3>
                {data.branchAnalytics.length === 0 ? (
                  <div className="flex items-center justify-center h-48 bg-slate-50 dark:bg-slate-900/30 rounded-lg text-slate-400 text-sm">No branch data</div>
                ) : (
                  <Chart
                    options={donutOptions(data.branchAnalytics.map((b) => b.name))}
                    series={data.branchAnalytics.map((b) => b.revenue)}
                    type="donut"
                    height={260}
                  />
                )}
              </div>
            </div>
          </div>

          {/* Leaderboard Table and Refund Stats row */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Top Products Leaderboard */}
            <div className="bg-white dark:bg-slate-800 border border-slate-150 dark:border-slate-800 rounded-xl p-4 shadow-xs lg:col-span-2">
              <h3 className="text-sm sm:text-base font-bold text-slate-800 dark:text-slate-200 mb-3 border-b border-slate-50 dark:border-slate-700/40 pb-2">
                Top Selling Products Leaderboard
              </h3>
              {data.topProducts.length === 0 ? (
                <div className="flex items-center justify-center h-48 bg-slate-50 dark:bg-slate-900/30 rounded-lg text-slate-400 text-xs">No products sold</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-slate-100 dark:border-slate-700/60 text-slate-400 uppercase tracking-wider font-bold">
                        <th className="py-2.5">Product Name</th>
                        <th className="py-2.5">Category</th>
                        <th className="py-2.5 text-center">Qty Sold</th>
                        <th className="py-2.5 text-right">Revenue</th>
                        <th className="py-2.5 text-right">Profit</th>
                        <th className="py-2.5 text-right">Margin</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-700/40">
                      {data.topProducts.map((p) => {
                        const margin = p.revenue > 0 ? (p.profit / p.revenue) * 100 : 0
                        return (
                          <tr key={p.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                            <td className="py-3 font-semibold text-slate-900 dark:text-slate-200">{p.name}</td>
                            <td className="py-3 text-slate-500 dark:text-slate-400">{p.category}</td>
                            <td className="py-3 text-center font-bold text-slate-800 dark:text-slate-300">{p.quantity}</td>
                            <td className="py-3 text-right font-mono font-semibold">{fmt(p.revenue)}</td>
                            <td className="py-3 text-right font-mono font-semibold text-emerald-600 dark:text-emerald-400">{fmt(p.profit)}</td>
                            <td className="py-3 text-right">
                              <span className="px-1.5 py-0.5 rounded-sm font-semibold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-400 font-mono">
                                {margin.toFixed(1)}%
                              </span>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Refund & Returns Statistics */}
            <div className="bg-white dark:bg-slate-800 border border-slate-150 dark:border-slate-800 rounded-xl p-4 shadow-xs">
              <h3 className="text-sm sm:text-base font-bold text-slate-800 dark:text-slate-200 mb-3 border-b border-slate-50 dark:border-slate-700/40 pb-2">
                Refund & Returns Statistics
              </h3>
              <div className="space-y-4 py-1">
                <div className="bg-rose-50/60 dark:bg-rose-950/15 border border-rose-100 dark:border-rose-900/50 rounded-lg p-3 text-center">
                  <div className="text-[10px] uppercase font-bold text-rose-500 dark:text-rose-400 tracking-wider">Total Refunded Value</div>
                  <div className="text-xl sm:text-2xl font-black text-rose-700 dark:text-rose-400 mt-1">
                    {fmt(data.refundStats.totalRefundedAmount)}
                  </div>
                  <div className="text-[10px] text-slate-400 mt-1">
                    Summed from {data.refundStats.totalRefundedQty} approved returned items
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 text-center">
                  <div className="bg-slate-50 dark:bg-slate-900/50 p-2.5 rounded-lg border border-slate-100 dark:border-slate-800">
                    <div className="text-[10px] text-slate-400 uppercase font-bold">Approved</div>
                    <div className="text-base sm:text-lg font-black text-emerald-600 dark:text-emerald-400 mt-0.5">
                      {data.refundStats.approvedReturnsCount}
                    </div>
                  </div>
                  <div className="bg-slate-50 dark:bg-slate-900/50 p-2.5 rounded-lg border border-slate-100 dark:border-slate-800">
                    <div className="text-[10px] text-slate-400 uppercase font-bold">Pending</div>
                    <div className="text-base sm:text-lg font-black text-amber-500 dark:text-amber-400 mt-0.5 animate-pulse">
                      {data.refundStats.pendingReturnsCount}
                    </div>
                  </div>
                  <div className="bg-slate-50 dark:bg-slate-900/50 p-2.5 rounded-lg border border-slate-100 dark:border-slate-800">
                    <div className="text-[10px] text-slate-400 uppercase font-bold">Rejected</div>
                    <div className="text-base sm:text-lg font-black text-rose-500 dark:text-rose-455 mt-0.5">
                      {data.refundStats.rejectedReturnsCount}
                    </div>
                  </div>
                  <div className="bg-slate-50 dark:bg-slate-900/50 p-2.5 rounded-lg border border-slate-100 dark:border-slate-800">
                    <div className="text-[10px] text-slate-400 uppercase font-bold">Total Requests</div>
                    <div className="text-base sm:text-lg font-black text-slate-700 dark:text-slate-300 mt-0.5">
                      {data.refundStats.totalReturnsCount}
                    </div>
                  </div>
                </div>

                <div className="space-y-1 pt-2">
                  <div className="flex justify-between text-xs font-semibold text-slate-500 dark:text-slate-400">
                    <span>Returns vs Sales Rate</span>
                    <span className="font-mono">
                      {data.kpis.totalOrders > 0
                        ? ((data.refundStats.totalReturnsCount / data.kpis.totalOrders) * 100).toFixed(1)
                        : 0}
                      %
                    </span>
                  </div>
                  <div className="w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
                    <div
                      className="bg-rose-500 h-full rounded-full transition-all duration-300"
                      style={{
                        width: `${Math.min(
                          100,
                          data.kpis.totalOrders > 0
                            ? (data.refundStats.totalReturnsCount / data.kpis.totalOrders) * 100
                            : 0
                        )}%`,
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
