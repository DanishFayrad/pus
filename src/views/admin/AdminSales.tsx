import { Fragment, useMemo, useState, useEffect } from 'react'
import { useStore } from '../../context/StoreContext'
import { useConfirm } from '../../components/ConfirmProvider'
import Spinner from '../../components/Spinner'
import { formatMoney as fmt } from '../../lib/currency'
import { formatDateTime, pktDayKey, formatDate, pktTimeKey } from '../../lib/datetime'
import { printReceipt, printVendorClosingSlip } from '../../lib/receipt'

export default function AdminSales() {
  const { sales, deleteSale, returnRequests, products, refreshSales } = useStore()
  const [loadingMore, setLoadingMore] = useState(false)
  const confirm = useConfirm()
  const [expanded, setExpanded] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  // Filters
  const [dateFilter, setDateFilter] = useState<'all' | 'today' | 'yesterday' | 'last7' | 'last10' | 'last30' | 'custom'>('all')
  const [customStart, setCustomStart] = useState(() => pktDayKey(new Date()))
  const [customEnd, setCustomEnd] = useState(() => pktDayKey(new Date()))
  const [timeFilter, setTimeFilter] = useState<'all' | 'morning' | 'evening' | 'night' | 'custom'>('all')
  const [customTimeStart, setCustomTimeStart] = useState('09:00')
  const [customTimeEnd, setCustomTimeEnd] = useState('17:00')
  const [categoryFilter, setCategoryFilter] = useState<string>('all')
  const [activeTab, setActiveTab] = useState<'receipts' | 'products' | 'daily' | 'vendor-closing'>('receipts')

  // Search & Pagination
  const [searchQuery, setSearchQuery] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(15)

  // Unique categories / vendors
  const availableVendors = useMemo(() => {
    const cats = new Set<string>()
    products.forEach((p) => {
      if (p.category?.trim()) cats.add(p.category.trim())
    })
    return Array.from(cats).sort()
  }, [products])

  // Map of productId to product for fast category lookup
  const productMap = useMemo(() => {
    const map = new Map<string, (typeof products)[0]>()
    products.forEach((p) => map.set(p.id, p))
    return map
  }, [products])

  // Reset pagination when date/time filter, search query, or tab changes
  useEffect(() => {
    setCurrentPage(1)
  }, [dateFilter, timeFilter, customTimeStart, customTimeEnd, categoryFilter, searchQuery, activeTab])

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

  // Helper to get YYYY-MM-DD for Pakistan time N days ago
  const getPktDateString = (offsetDays = 0): string => {
    const d = new Date()
    d.setDate(d.getDate() - offsetDays)
    return pktDayKey(d)
  }

  // Filter sales based on the active date and time filters
  const filteredSales = useMemo(() => {
    return sales.filter((s) => {
      // 1. Date Filter
      const saleDay = pktDayKey(s.date)
      let dateMatch = false
      switch (dateFilter) {
        case 'today':
          dateMatch = saleDay === getPktDateString(0)
          break
        case 'yesterday':
          dateMatch = saleDay === getPktDateString(1)
          break
        case 'last7':
          dateMatch = saleDay >= getPktDateString(6) && saleDay <= getPktDateString(0)
          break
        case 'last10':
          dateMatch = saleDay >= getPktDateString(9) && saleDay <= getPktDateString(0)
          break
        case 'last30':
          dateMatch = saleDay >= getPktDateString(29) && saleDay <= getPktDateString(0)
          break
        case 'custom':
          if (customStart && customEnd) {
            dateMatch = saleDay >= customStart && saleDay <= customEnd
          } else if (customStart) {
            dateMatch = saleDay >= customStart
          } else if (customEnd) {
            dateMatch = saleDay <= customEnd
          } else {
            dateMatch = true
          }
          break
        default:
          dateMatch = true
          break
      }

      if (!dateMatch) return false

      // 2. Time Filter
      if (timeFilter !== 'all') {
        const saleTime = pktTimeKey(s.date)
        let startTime = '00:00'
        let endTime = '23:59'

        switch (timeFilter) {
          case 'morning':
            startTime = '08:00'
            endTime = '15:59'
            break
          case 'evening':
            startTime = '16:00'
            endTime = '23:59'
            break
          case 'night':
            startTime = '00:00'
            endTime = '07:59'
            break
          case 'custom':
            startTime = customTimeStart || '00:00'
            endTime = customTimeEnd || '23:59'
            break
        }

        if (startTime <= endTime) {
          if (saleTime < startTime || saleTime > endTime) return false
        } else {
          if (saleTime < startTime && saleTime > endTime) return false
        }
      }

      // 3. Category / Vendor Filter
      if (categoryFilter !== 'all') {
        const hasMatchingCategory = s.items.some((i) => {
          const prod = productMap.get(i.productId)
          return prod?.category?.toLowerCase() === categoryFilter.toLowerCase()
        })
        if (!hasMatchingCategory) return false
      }

      return true
    })
  }, [sales, dateFilter, customStart, customEnd, timeFilter, customTimeStart, customTimeEnd, categoryFilter, productMap])

  // Filter sales based on search query
  const searchedSales = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return filteredSales
    return filteredSales.filter((s) => {
      return (
        s.id.toLowerCase().includes(q) ||
        s.cashierName.toLowerCase().includes(q) ||
        (s.customerName && s.customerName.toLowerCase().includes(q)) ||
        (s.customerPhone && s.customerPhone.toLowerCase().includes(q)) ||
        s.items.some((item) => item.name.toLowerCase().includes(q) || item.barcode.toLowerCase().includes(q))
      )
    })
  }, [filteredSales, searchQuery])

  // Calculate stats for searched/filtered sales
  const totals = useMemo(() => {
    const rawTotals = searchedSales.reduce(
      (acc, s) => {
        acc.revenue += (s.total || 0)
        acc.cost += (s.cost || 0)
        acc.profit += (s.profit || 0)
        acc.sales += 1
        return acc
      },
      { revenue: 0, cost: 0, profit: 0, sales: 0 },
    )

    // Deduct approved returns
    const approvedReturns = returnRequests.filter((r) => r.status === 'approved')
    approvedReturns.forEach((r) => {
      const p = products.find((prod) => String(prod.id) === String(r.productId))
      if (p) {
        rawTotals.revenue -= p.price * r.quantity
        rawTotals.cost -= p.cost * r.quantity
        rawTotals.profit -= (p.price - p.cost) * r.quantity
      }
    })

    return rawTotals
  }, [searchedSales, returnRequests, products])

  // Get products sold summary for the searched sales
  const productSales = useMemo(() => {
    const map = new Map<string, { productId: string; name: string; barcode: string; category: string; quantity: number; revenue: number; profit: number; price: number }>()
    searchedSales.forEach((s) => {
      s.items.forEach((item) => {
        const prod = productMap.get(item.productId)
        const category = prod?.category || 'General'

        if (categoryFilter !== 'all' && category.toLowerCase() !== categoryFilter.toLowerCase()) {
          return
        }

        const existing = map.get(item.productId)
        const revenue = item.price * item.quantity
        const profit = (item.price - item.cost) * item.quantity
        if (existing) {
          existing.quantity += item.quantity
          existing.revenue += revenue
          existing.profit += profit
        } else {
          map.set(item.productId, {
            productId: item.productId,
            name: item.name,
            barcode: item.barcode,
            category,
            quantity: item.quantity,
            revenue,
            profit,
            price: item.price,
          })
        }
      })
    })
    return Array.from(map.values()).sort((a, b) => b.quantity - a.quantity)
  }, [searchedSales, categoryFilter, productMap])

  // Group sales by vendor/category for closing
  const vendorClosings = useMemo(() => {
    const vendorMap = new Map<
      string,
      {
        vendorName: string
        totalQty: number
        totalRevenue: number
        totalCash: number
        totalCredit: number
        totalProfit: number
        items: Map<string, { name: string; quantity: number; revenue: number }>
      }
    >()

    searchedSales.forEach((s) => {
      s.items.forEach((item) => {
        const prod = productMap.get(item.productId)
        const vendorName = prod?.category?.trim() || 'General'

        if (categoryFilter !== 'all' && vendorName.toLowerCase() !== categoryFilter.toLowerCase()) {
          return
        }

        const lineRev = item.price * item.quantity
        const lineProfit = (item.price - item.cost) * item.quantity

        let v = vendorMap.get(vendorName)
        if (!v) {
          v = {
            vendorName,
            totalQty: 0,
            totalRevenue: 0,
            totalCash: 0,
            totalCredit: 0,
            totalProfit: 0,
            items: new Map(),
          }
          vendorMap.set(vendorName, v)
        }

        v.totalQty += item.quantity
        v.totalRevenue += lineRev
        v.totalProfit += lineProfit
        if (s.paymentMethod === 'credit') {
          v.totalCredit += lineRev
        } else {
          v.totalCash += lineRev
        }

        const curItem = v.items.get(item.productId) || { name: item.name, quantity: 0, revenue: 0 }
        curItem.quantity += item.quantity
        curItem.revenue += lineRev
        v.items.set(item.productId, curItem)
      })
    })

    return Array.from(vendorMap.values()).map((v) => ({
      ...v,
      itemList: Array.from(v.items.values()).sort((a, b) => b.revenue - a.revenue),
    })).sort((a, b) => b.totalRevenue - a.totalRevenue)
  }, [searchedSales, categoryFilter, productMap])

  // Group sales by day based on searched sales
  const dailySales = useMemo(() => {
    const map = new Map<string, { date: string; revenue: number; profit: number; itemsSold: number; txCount: number }>()
    searchedSales.forEach((s) => {
      const day = pktDayKey(s.date)
      const existing = map.get(day)
      const qty = s.items.reduce((sum, item) => sum + item.quantity, 0)
      if (existing) {
        existing.revenue += s.total
        existing.profit += s.profit
        existing.itemsSold += qty
        existing.txCount += 1
      } else {
        map.set(day, {
          date: day,
          revenue: s.total,
          profit: s.profit,
          itemsSold: qty,
          txCount: 1,
        })
      }
    })
    return Array.from(map.values()).sort((a, b) => b.date.localeCompare(a.date))
  }, [searchedSales])

  // Date Range label for slip printing
  const activeDateRangeLabel = useMemo(() => {
    switch (dateFilter) {
      case 'today': return `Today (${formatDate(new Date())})`
      case 'yesterday': {
        const y = new Date(); y.setDate(y.getDate() - 1)
        return `Yesterday (${formatDate(y)})`
      }
      case 'last7': return 'Last 7 Days'
      case 'last30': return 'Last 30 Days'
      case 'custom': return `${customStart} to ${customEnd}`
      default: return 'All Time'
    }
  }, [dateFilter, customStart, customEnd])

  // Pagination bounds calculations
  const activeListLength = useMemo(() => {
    if (activeTab === 'receipts') return searchedSales.length
    if (activeTab === 'products') return productSales.length
    if (activeTab === 'vendor-closing') return vendorClosings.length
    return dailySales.length
  }, [activeTab, searchedSales.length, productSales.length, vendorClosings.length, dailySales.length])

  const totalPages = Math.max(1, Math.ceil(activeListLength / pageSize))

  const paginatedSales = useMemo(() => {
    return searchedSales.slice((currentPage - 1) * pageSize, currentPage * pageSize)
  }, [searchedSales, currentPage, pageSize])

  const paginatedProducts = useMemo(() => {
    return productSales.slice((currentPage - 1) * pageSize, currentPage * pageSize)
  }, [productSales, currentPage, pageSize])

  const paginatedDaily = useMemo(() => {
    return dailySales.slice((currentPage - 1) * pageSize, currentPage * pageSize)
  }, [dailySales, currentPage, pageSize])

  const pageNumbers = useMemo(() => {
    const pages: (number | string)[] = []
    const maxVisible = 5
    if (totalPages <= maxVisible) {
      for (let i = 1; i <= totalPages; i++) pages.push(i)
    } else {
      pages.push(1)
      let start = Math.max(2, currentPage - 1)
      let end = Math.min(totalPages - 1, currentPage + 1)

      if (currentPage <= 2) {
        end = 4
      } else if (currentPage >= totalPages - 1) {
        start = totalPages - 3
      }

      if (start > 2) pages.push('...')
      for (let i = start; i <= end; i++) pages.push(i)
      if (end < totalPages - 1) pages.push('...')
      pages.push(totalPages)
    }
    return pages
  }, [totalPages, currentPage])

  return (
    <div className="max-w-7xl mx-auto p-3 sm:p-4 space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-800 dark:text-white">Sales, Records & Closing</h1>
          <p className="text-xs text-slate-500 mt-0.5">Filter sales by date, time, and specific vendor/counter (e.g. Barbecue, Ice Cream, Tea).</p>
        </div>
      </div>

      {/* Filters Panel */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/80 dark:border-slate-700/60 p-4 shadow-2xs space-y-4">
        {/* Vendor / Category & Date Filters */}
        <div className="grid md:grid-cols-[1fr_auto] gap-4 items-start">
          <div>
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2.5">Date Range Filter</h2>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  { id: 'all', label: 'All Time' },
                  { id: 'today', label: 'Today' },
                  { id: 'yesterday', label: 'Yesterday' },
                  { id: 'last7', label: 'Last 7 Days' },
                  { id: 'last10', label: 'Last 10 Days' },
                  { id: 'last30', label: 'Last 30 Days' },
                  { id: 'custom', label: 'Custom Range' },
                ] as const
              ).map((filter) => (
                <button
                  key={filter.id}
                  type="button"
                  onClick={() => {
                    setDateFilter(filter.id)
                    if (filter.id === 'custom' && (!customStart || !customEnd)) {
                      const todayStr = pktDayKey(new Date())
                      setCustomStart(todayStr)
                      setCustomEnd(todayStr)
                    }
                  }}
                  className={`px-3.5 py-1.5 text-xs font-semibold rounded-xl transition duration-150 cursor-pointer ${
                    dateFilter === filter.id
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'bg-slate-50 text-slate-655 hover:bg-slate-100 dark:bg-slate-900/50 dark:text-slate-300 dark:hover:bg-slate-900'
                  }`}
                >
                  {filter.label}
                </button>
              ))}
            </div>
            {sales.length <= 300 && (dateFilter === 'all' || dateFilter === 'last30' || dateFilter === 'last10') && (
              <div className="mt-2">
                <button
                  type="button"
                  disabled={loadingMore}
                  onClick={async () => {
                    setLoadingMore(true)
                    try {
                      await refreshSales(1000)
                    } finally {
                      setLoadingMore(false)
                    }
                  }}
                  className="text-xs text-blue-600 dark:text-blue-400 hover:underline font-semibold flex items-center gap-1.5 cursor-pointer"
                >
                  {loadingMore ? 'Loading older sales...' : '📥 Showing recent 300 sales. Click to load up to 1,000 sales'}
                </button>
              </div>
            )}
          </div>

          {/* Vendor / Category Selector */}
          <div className="min-w-[200px]">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">Filter By Vendor / Category</h2>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="w-full px-3 py-2 text-xs font-bold rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 cursor-pointer shadow-2xs"
            >
              <option value="all">All Vendors</option>
              {availableVendors.map((cat) => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>
        </div>

        {dateFilter === 'custom' && (
          <div className="flex flex-wrap gap-3 items-end pt-2 border-t border-dashed border-slate-100 dark:border-slate-700/50 animate-[fadeIn_0.15s_ease-out]">
            <div className="space-y-1">
              <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-455 dark:text-slate-400">Start Date</label>
              <input
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                className="px-3 py-2 text-xs font-medium rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              />
            </div>
            <div className="space-y-1">
              <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-455 dark:text-slate-400">End Date</label>
              <input
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="px-3 py-2 text-xs font-medium rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              />
            </div>
            {(customStart || customEnd) && (
              <button
                type="button"
                onClick={() => {
                  const todayStr = pktDayKey(new Date())
                  setCustomStart(todayStr)
                  setCustomEnd(todayStr)
                }}
                className="px-3 py-2 text-xs font-semibold text-red-500 hover:text-red-655 hover:underline transition cursor-pointer"
              >
                Reset Custom Dates
              </button>
            )}
          </div>
        )}

        {/* Time Filters Divider */}
        <div className="border-t border-slate-100 dark:border-slate-700/50 my-3"></div>

        {/* Time Filters */}
        <div>
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2.5">Time Filter</h2>
          <div className="flex flex-wrap gap-2">
            {(
              [
                { id: 'all', label: 'All Day' },
                { id: 'morning', label: 'Morning (08:00 AM - 04:00 PM)' },
                { id: 'evening', label: 'Evening (04:00 PM - 12:00 AM)' },
                { id: 'night', label: 'Night (12:00 AM - 08:00 AM)' },
                { id: 'custom', label: 'Custom Time' },
              ] as const
            ).map((filter) => (
              <button
                key={filter.id}
                type="button"
                onClick={() => setTimeFilter(filter.id)}
                className={`px-3.5 py-1.5 text-xs font-semibold rounded-xl transition duration-150 cursor-pointer ${
                  timeFilter === filter.id
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'bg-slate-50 text-slate-655 hover:bg-slate-100 dark:bg-slate-900/50 dark:text-slate-300 dark:hover:bg-slate-900'
                }`}
              >
                {filter.label}
              </button>
            ))}
          </div>
        </div>

        {timeFilter === 'custom' && (
          <div className="flex flex-wrap gap-3 items-end pt-2 border-t border-dashed border-slate-100 dark:border-slate-700/50 animate-[fadeIn_0.15s_ease-out]">
            <div className="space-y-1">
              <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-455 dark:text-slate-400">Start Time</label>
              <input
                type="time"
                value={customTimeStart}
                onChange={(e) => setCustomTimeStart(e.target.value)}
                className="px-3 py-2 text-xs font-medium rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              />
            </div>
            <div className="space-y-1">
              <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-455 dark:text-slate-400">End Time</label>
              <input
                type="time"
                value={customTimeEnd}
                onChange={(e) => setCustomTimeEnd(e.target.value)}
                className="px-3 py-2 text-xs font-medium rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              />
            </div>
            {(customTimeStart !== '09:00' || customTimeEnd !== '17:00') && (
              <button
                type="button"
                onClick={() => {
                  setCustomTimeStart('09:00')
                  setCustomTimeEnd('17:00')
                }}
                className="px-3 py-2 text-xs font-semibold text-red-500 hover:text-red-655 hover:underline transition cursor-pointer"
              >
                Reset Custom Time
              </button>
            )}
          </div>
        )}
      </div>

      {/* Dynamic Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/80 dark:border-slate-700/60 p-4 shadow-2xs">
          <div className="text-xs font-bold text-slate-400 dark:text-slate-400 uppercase tracking-wider">Revenue</div>
          <div className="text-lg sm:text-2xl font-black mt-1 truncate text-slate-800 dark:text-white">{fmt(totals.revenue)}</div>
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/80 dark:border-slate-700/60 p-4 shadow-2xs">
          <div className="text-xs font-bold text-slate-400 dark:text-slate-400 uppercase tracking-wider">Cost</div>
          <div className="text-lg sm:text-2xl font-black mt-1 truncate text-slate-800 dark:text-white">{fmt(totals.cost)}</div>
        </div>
        <div
          className={`bg-white dark:bg-slate-800 rounded-2xl border p-4 shadow-2xs ${
            totals.profit >= 0
              ? 'border-emerald-150 dark:border-emerald-950/30'
              : 'border-red-150 dark:border-red-950/30'
          }`}
        >
          <div className="text-xs font-bold text-slate-400 dark:text-slate-400 uppercase tracking-wider">
            {totals.profit >= 0 ? 'Profit' : 'Loss'}
          </div>
          <div
            className={`text-lg sm:text-2xl font-black mt-1 truncate ${
              totals.profit >= 0 ? 'text-emerald-600 dark:text-emerald-450' : 'text-red-650 dark:text-red-400'
            }`}
          >
            {fmt(totals.profit)}
          </div>
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/80 dark:border-slate-700/60 p-4 shadow-2xs">
          <div className="text-xs font-bold text-slate-400 dark:text-slate-400 uppercase tracking-wider">Sales Count</div>
          <div className="text-lg sm:text-2xl font-black mt-1 truncate text-slate-800 dark:text-white">{totals.sales}</div>
        </div>
      </div>

      {deleteError && (
        <div className="text-sm text-red-600 bg-red-50 dark:bg-red-955/40 border border-red-200 dark:border-red-900 rounded-xl px-4 py-3">
          {deleteError}
        </div>
      )}

      {/* Tabs and Search Bar */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 border-b border-slate-200 dark:border-slate-700/80 pb-2">
        <div className="flex flex-wrap gap-1">
          {(
            [
              { id: 'receipts', label: 'Receipts History' },
              { id: 'vendor-closing', label: 'Vendor Closing' },
              { id: 'products', label: 'Products Sold' },
              { id: 'daily', label: 'Daily Summary' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`px-3.5 py-2 text-xs sm:text-sm font-bold border-b-2 transition duration-150 cursor-pointer -mb-[10px] ${
                activeTab === tab.id
                  ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-slate-400 hover:text-slate-605 dark:hover:text-slate-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="relative w-full md:w-80">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by ID, cashier, customer, product..."
            className="w-full pl-9 pr-4 py-2 text-xs font-semibold rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 shadow-2xs placeholder:text-slate-400 text-slate-800 dark:text-slate-100"
          />
          <svg
            className="w-4 h-4 text-slate-400 absolute left-3 top-2.5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth="2.5"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
      </div>

      {/* Main Records Container */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/80 dark:border-slate-700/60 shadow-2xs overflow-hidden">
        {activeListLength === 0 ? (
          <div className="p-10 text-center text-slate-500 text-sm">No records found for the selected filters.</div>
        ) : (
          <>
            {/* Vendor / Counter Closing Tab */}
            {activeTab === 'vendor-closing' && (
              <div className="p-4 sm:p-6 space-y-6">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-700 pb-4">
                  <div>
                    <h3 className="text-base font-bold text-slate-800 dark:text-white">Vendor / Counter Closing Reports</h3>
                    <p className="text-xs text-slate-400 mt-0.5">Period: <strong className="text-slate-700 dark:text-slate-300">{activeDateRangeLabel}</strong></p>
                  </div>
                </div>

                <div className="grid md:grid-cols-2 gap-4">
                  {vendorClosings.map((v) => (
                    <div
                      key={v.vendorName}
                      className="border border-slate-200 dark:border-slate-700 rounded-2xl p-4 bg-slate-50/40 dark:bg-slate-900/30 flex flex-col justify-between space-y-4"
                    >
                      <div>
                        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-750 pb-2.5">
                          <div className="flex items-center gap-2">
                            <span className="w-3 h-3 rounded-full bg-amber-500"></span>
                            <span className="text-base font-black uppercase text-slate-800 dark:text-white">{v.vendorName}</span>
                          </div>
                          <span className="text-xs font-bold text-slate-500">{v.totalQty} Units</span>
                        </div>

                        <div className="grid grid-cols-3 gap-2 my-3 text-center">
                          <div className="bg-white dark:bg-slate-800 p-2.5 rounded-xl border border-slate-100 dark:border-slate-700">
                            <div className="text-[10px] font-bold text-slate-400 uppercase">Cash</div>
                            <div className="text-xs sm:text-sm font-bold text-emerald-600 dark:text-emerald-400">{fmt(v.totalCash)}</div>
                          </div>
                          <div className="bg-white dark:bg-slate-800 p-2.5 rounded-xl border border-slate-100 dark:border-slate-700">
                            <div className="text-[10px] font-bold text-slate-400 uppercase">Credit</div>
                            <div className="text-xs sm:text-sm font-bold text-blue-600 dark:text-blue-400">{fmt(v.totalCredit)}</div>
                          </div>
                          <div className="bg-white dark:bg-slate-800 p-2.5 rounded-xl border border-slate-100 dark:border-slate-700">
                            <div className="text-[10px] font-bold text-slate-400 uppercase">Net Sale</div>
                            <div className="text-xs sm:text-sm font-black text-amber-600 dark:text-amber-400">{fmt(v.totalRevenue)}</div>
                          </div>
                        </div>

                        <div className="max-h-36 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 border border-slate-150 dark:border-slate-750 rounded-xl bg-white dark:bg-slate-800 px-3 py-1">
                          {v.itemList.slice(0, 6).map((it, idx) => (
                            <div key={idx} className="py-1.5 flex items-center justify-between text-xs">
                              <span className="text-slate-700 dark:text-slate-300 truncate max-w-[180px]">{it.name}</span>
                              <span className="font-mono text-slate-500">{it.quantity} × <strong className="text-slate-800 dark:text-slate-200">{fmt(it.revenue)}</strong></span>
                            </div>
                          ))}
                          {v.itemList.length > 6 && (
                            <div className="py-1 text-center text-[10px] text-slate-400 font-semibold">
                              + {v.itemList.length - 6} more items
                            </div>
                          )}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          printVendorClosingSlip({
                            vendorName: v.vendorName.toUpperCase(),
                            dateRangeLabel: activeDateRangeLabel,
                            generatedBy: 'Store Admin',
                            items: v.itemList,
                            totalQty: v.totalQty,
                            totalRevenue: v.totalRevenue,
                            totalCash: v.totalCash,
                            totalCredit: v.totalCredit,
                          })
                        }}
                        className="w-full py-2.5 px-3 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer shadow-2xs hover:shadow-xs"
                      >
                        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                        </svg>
                        Print {v.vendorName} Closing Slip
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeTab === 'receipts' && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="text-xs text-slate-450 dark:text-slate-400 bg-slate-50 dark:bg-slate-900 font-bold uppercase tracking-wider">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Receipt</th>
                      <th className="px-4 py-3 font-semibold hidden md:table-cell">Date</th>
                      <th className="px-4 py-3 font-semibold hidden sm:table-cell">Cashier</th>
                      <th className="px-4 py-3 font-semibold text-right hidden sm:table-cell">Items</th>
                      <th className="px-4 py-3 font-semibold text-right">Total</th>
                      <th className="px-4 py-3 font-semibold text-right hidden sm:table-cell">Profit</th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60">
                    {paginatedSales.map((s) => {
                      const isOpen = expanded === s.id
                      const shortId = '…' + s.id.slice(-6)
                      const isDeleting = deletingId === s.id
                      return (
                        <Fragment key={s.id}>
                          <tr className={`transition hover:bg-slate-50/40 dark:hover:bg-slate-900/10 ${isDeleting ? 'opacity-50' : ''}`}>
                            <td className="px-4 py-3 font-mono text-xs text-slate-700 dark:text-slate-300">
                              <span className="sm:hidden">{shortId}</span>
                              <span className="hidden sm:inline">#{s.id.slice(-8).toUpperCase()}</span>
                              <div className="text-[10px] text-slate-400 md:hidden mt-0.5">
                                {formatDateTime(s.date)}
                              </div>
                            </td>
                            <td className="px-4 py-3 hidden md:table-cell whitespace-nowrap text-slate-600 dark:text-slate-350">
                              {formatDateTime(s.date)}
                            </td>
                            <td className="px-4 py-3 hidden sm:table-cell text-slate-600 dark:text-slate-350">{s.cashierName}</td>
                            <td className="px-4 py-3 text-right hidden sm:table-cell text-slate-600 dark:text-slate-350">
                              {s.items.reduce((a, i) => a + i.quantity, 0)}
                            </td>
                            <td className="px-4 py-3 text-right whitespace-nowrap font-bold text-slate-800 dark:text-white">{fmt(s.total)}</td>
                            <td
                              className={`px-4 py-3 text-right whitespace-nowrap hidden sm:table-cell font-semibold ${
                                s.profit >= 0 ? 'text-emerald-600 dark:text-emerald-450' : 'text-red-655 dark:text-red-400'
                              }`}
                            >
                              {fmt(s.profit)}
                            </td>
                            <td className="px-4 py-3 text-right whitespace-nowrap">
                              <button
                                type="button"
                                onClick={() => setExpanded(isOpen ? null : s.id)}
                                className="text-blue-600 hover:text-blue-750 dark:text-blue-450 dark:hover:text-blue-400 font-semibold text-xs hover:underline mr-4 cursor-pointer"
                              >
                                {isOpen ? 'Hide' : 'View'}
                              </button>
                              <button
                                type="button"
                                disabled={isDeleting}
                                onClick={() => removeSale(s.id, `${fmt(s.total)} · ${formatDateTime(s.date)}`)}
                                className="text-red-600 hover:text-red-750 dark:text-red-450 dark:hover:text-red-455 font-semibold text-xs hover:underline disabled:opacity-50 inline-flex items-center gap-1 cursor-pointer"
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
                            <tr key={s.id + '-d'} className="bg-slate-50/50 dark:bg-slate-900/30 animate-[fadeIn_0.15s_ease-out]">
                              <td colSpan={7} className="px-4 py-3.5">
                                <div className="flex justify-between items-center mb-3">
                                  <span className="text-xs font-bold text-slate-505 dark:text-slate-400 uppercase tracking-wider">Receipt Items Breakdown</span>
                                  <button
                                    type="button"
                                    onClick={() => void printReceipt(s)}
                                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg border border-blue-200 bg-blue-50/50 text-blue-700 hover:bg-blue-100/70 dark:border-blue-900 dark:bg-blue-955/20 dark:text-blue-300 dark:hover:bg-blue-900 transition cursor-pointer shadow-2xs"
                                  >
                                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                                    </svg>
                                    Print Receipt (Perchi with Barcode)
                                  </button>
                                </div>
                                <div className="overflow-x-auto">
                                  <table className="w-full text-xs text-left">
                                    <thead className="text-slate-450 dark:text-slate-400 font-bold uppercase tracking-wider">
                                      <tr className="border-b border-slate-100 dark:border-slate-700/50">
                                        <th className="py-2 font-medium">Product</th>
                                        <th className="py-2 font-medium hidden sm:table-cell">Barcode</th>
                                        <th className="py-2 font-medium text-right">Qty</th>
                                        <th className="py-2 font-medium text-right">Price</th>
                                        <th className="py-2 font-medium text-right">Line</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100/50 dark:divide-slate-800/40">
                                      {s.items.map((i) => (
                                        <tr key={i.productId}>
                                          <td className="py-2 text-slate-700 dark:text-slate-350">{i.name}</td>
                                          <td className="py-2 font-mono text-slate-500 dark:text-slate-400 hidden sm:table-cell">{i.barcode}</td>
                                          <td className="py-2 text-right text-slate-700 dark:text-slate-350">{i.quantity}</td>
                                          <td className="py-2 text-right text-slate-655 dark:text-slate-350 whitespace-nowrap">{fmt(i.price)}</td>
                                          <td className="py-2 text-right text-slate-900 dark:text-white font-semibold whitespace-nowrap">
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

            {activeTab === 'products' && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="text-xs text-slate-450 dark:text-slate-400 bg-slate-50 dark:bg-slate-900 font-bold uppercase tracking-wider">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Product Name</th>
                      <th className="px-4 py-3 font-semibold hidden sm:table-cell">Barcode</th>
                      <th className="px-4 py-3 font-semibold hidden sm:table-cell">Vendor / Category</th>
                      <th className="px-4 py-3 font-semibold text-right">Quantity Sold</th>
                      <th className="px-4 py-3 font-semibold text-right">Price (Current)</th>
                      <th className="px-4 py-3 font-semibold text-right">Total Revenue</th>
                      <th className="px-4 py-3 font-semibold text-right">Total Profit</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60">
                    {paginatedProducts.map((p) => (
                      <tr key={p.productId} className="transition hover:bg-slate-50/40 dark:hover:bg-slate-900/10">
                        <td className="px-4 py-3 font-semibold text-slate-800 dark:text-slate-200">{p.name}</td>
                        <td className="px-4 py-3 font-mono text-xs text-slate-500 dark:text-slate-400 hidden sm:table-cell">{p.barcode}</td>
                        <td className="px-4 py-3 text-xs font-semibold text-blue-600 dark:text-blue-400 hidden sm:table-cell">{p.category}</td>
                        <td className="px-4 py-3 text-right font-semibold text-slate-700 dark:text-slate-300">{p.quantity}</td>
                        <td className="px-4 py-3 text-right text-slate-600 dark:text-slate-350">{fmt(p.price)}</td>
                        <td className="px-4 py-3 text-right font-bold text-slate-800 dark:text-white">{fmt(p.revenue)}</td>
                        <td
                          className={`px-4 py-3 text-right font-bold ${
                            p.profit >= 0 ? 'text-emerald-600 dark:text-emerald-450' : 'text-red-655 dark:text-red-400'
                          }`}
                        >
                          {fmt(p.profit)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {activeTab === 'daily' && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="text-xs text-slate-450 dark:text-slate-400 bg-slate-50 dark:bg-slate-900 font-bold uppercase tracking-wider">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Date</th>
                      <th className="px-4 py-3 font-semibold text-right">Transactions</th>
                      <th className="px-4 py-3 font-semibold text-right">Items Sold</th>
                      <th className="px-4 py-3 font-semibold text-right">Revenue</th>
                      <th className="px-4 py-3 font-semibold text-right">Profit</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60">
                    {paginatedDaily.map((d) => (
                      <tr key={d.date} className="transition hover:bg-slate-50/40 dark:hover:bg-slate-900/10">
                        <td className="px-4 py-3 font-semibold text-slate-800 dark:text-slate-200">
                          {formatDate(d.date)}
                        </td>
                        <td className="px-4 py-3 text-right text-slate-600 dark:text-slate-350">{d.txCount}</td>
                        <td className="px-4 py-3 text-right text-slate-600 dark:text-slate-350">{d.itemsSold}</td>
                        <td className="px-4 py-3 text-right font-bold text-slate-800 dark:text-white">{fmt(d.revenue)}</td>
                        <td
                          className={`px-4 py-3 text-right font-bold ${
                            d.profit >= 0 ? 'text-emerald-600 dark:text-emerald-450' : 'text-red-655 dark:text-red-400'
                          }`}
                        >
                          {fmt(d.profit)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="px-4 py-3.5 bg-slate-50 dark:bg-slate-900/50 border-t border-slate-100 dark:border-slate-700/60 flex flex-col sm:flex-row items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400 font-semibold order-2 sm:order-1">
                  <span>Show</span>
                  <select
                    value={pageSize}
                    onChange={(e) => {
                      setPageSize(Number(e.target.value))
                      setCurrentPage(1)
                    }}
                    className="px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 font-bold"
                  >
                    <option value={10}>10</option>
                    <option value={15}>15</option>
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                  </select>
                  <span>entries</span>
                  <span className="mx-1 text-slate-300 dark:text-slate-700">|</span>
                  <span>
                    Showing {Math.min(activeListLength, (currentPage - 1) * pageSize + 1)} to{' '}
                    {Math.min(activeListLength, currentPage * pageSize)} of {activeListLength} entries
                  </span>
                </div>
                
                <div className="flex flex-wrap items-center gap-1.5 order-1 sm:order-2">
                  <button
                    type="button"
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    className="px-2.5 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed dark:border-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700 transition cursor-pointer"
                  >
                    Prev
                  </button>

                  {pageNumbers.map((num, idx) => {
                    if (num === '...') {
                      return (
                        <span
                          key={`dots-${idx}`}
                          className="px-2 py-1.5 text-xs font-semibold text-slate-400 dark:text-slate-500"
                        >
                          ...
                        </span>
                      )
                    }
                    const isActive = num === currentPage
                    return (
                      <button
                        key={`page-${num}`}
                        type="button"
                        onClick={() => setCurrentPage(Number(num))}
                        className={`px-3 py-1.5 text-xs font-bold rounded-lg border transition cursor-pointer ${
                          isActive
                            ? 'bg-blue-600 border-blue-600 text-white shadow-xs'
                            : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-655 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                        }`}
                      >
                        {num}
                      </button>
                    )
                  })}

                  <button
                    type="button"
                    disabled={currentPage === totalPages}
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    className="px-2.5 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed dark:border-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700 transition cursor-pointer"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
