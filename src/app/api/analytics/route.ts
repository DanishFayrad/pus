import { NextResponse } from 'next/server'
import dbConnect from '../../../lib/mongodb'
import { getSession } from '../../../lib/auth'
import Sale from '../../../models/Sale'
import Product from '../../../models/Product'
import ReturnRequest from '../../../models/ReturnRequest'
import { getRangeForPreset, getDateGroupKey } from '../../../lib/dateRange'

export const runtime = 'nodejs'

export async function GET(req: Request) {
  const session = await getSession()
  if (!session || session.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { searchParams } = new URL(req.url)
    const preset = searchParams.get('preset') || 'all'
    const startDateParam = searchParams.get('startDate')
    const endDateParam = searchParams.get('endDate')
    const groupBy = searchParams.get('groupBy') || 'day'

    const { startDate, endDate } = getRangeForPreset(preset, startDateParam, endDateParam)

    await dbConnect()

    // 1. Fetch sales for current period (optimized projection & limit)
    const currentSales = await Sale.find({ date: { $gte: startDate, $lte: endDate } })
      .select('date total cost profit items.quantity items.productId items.price items.cost items.name items.barcode paymentMethod cashierName')
      .sort({ date: 1 })
      .limit(2000)
      .lean()

    // Fetch previous period of equal duration if not 'all' time
    let previousSales: any[] = []
    let previousReturns: any[] = []
    let prevStartDate = new Date(startDate)
    let prevEndDate = new Date(startDate)
    const isAllTime = preset === 'all'
    
    if (!isAllTime) {
      const durationMs = endDate.getTime() - startDate.getTime()
      prevStartDate = new Date(startDate.getTime() - durationMs)
      prevEndDate = new Date(startDate.getTime())
      previousSales = await Sale.find({ date: { $gte: prevStartDate, $lt: startDate } })
        .select('date total cost profit items.quantity items.productId items.price items.cost items.name items.barcode paymentMethod cashierName')
        .sort({ date: 1 })
        .limit(2000)
        .lean()
    }

    // 2. Fetch returns for current period
    const currentReturns = await ReturnRequest.find({ createdAt: { $gte: startDate, $lte: endDate } }).lean()
    if (!isAllTime) {
      previousReturns = await ReturnRequest.find({ createdAt: { $gte: prevStartDate, $lt: startDate } }).lean()
    }

    // 3. Fetch products to resolve categories and costs
    const products = await Product.find({}).lean()
    const productMap = new Map(products.map((p) => [String(p._id), p]))

    // --- Compute KPIs function ---
    const computeKPIs = (salesList: any[], returnsList: any[]) => {
      let totalRevenue = salesList.reduce((sum, s) => sum + (s.total || 0), 0)
      let totalCost = salesList.reduce((sum, s) => sum + (s.cost || 0), 0)
      let totalProfit = salesList.reduce((sum, s) => sum + (s.profit || 0), 0)
      const totalOrders = salesList.length
      let totalSalesQty = salesList.reduce(
        (sum, s) => sum + s.items.reduce((acc: number, item: any) => acc + (item.quantity || 0), 0),
        0
      )

      returnsList.forEach(r => {
        if (r.status === 'approved') {
          const p = productMap.get(String(r.productId))
          if (p) {
            totalRevenue -= p.price * r.quantity
            totalCost -= p.cost * r.quantity
            totalProfit -= (p.price - p.cost) * r.quantity
            totalSalesQty -= r.quantity
          }
        }
      })

      const aov = totalOrders > 0 ? totalRevenue / totalOrders : 0
      const profitMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0

      return {
        totalRevenue,
        totalCost,
        totalProfit,
        totalOrders,
        totalSalesQty,
        aov,
        profitMargin,
      }
    }

    const currentKPIs = computeKPIs(currentSales, currentReturns)
    const previousKPIs = isAllTime ? currentKPIs : computeKPIs(previousSales, previousReturns)

    // Helper for percentage growth
    const getGrowth = (current: number, previous: number) => {
      if (isAllTime) return 0
      if (previous === 0) return current > 0 ? 100 : 0
      return ((current - previous) / previous) * 100
    }

    const growths = {
      revenue: getGrowth(currentKPIs.totalRevenue, previousKPIs.totalRevenue),
      profit: getGrowth(currentKPIs.totalProfit, previousKPIs.totalProfit),
      orders: getGrowth(currentKPIs.totalOrders, previousKPIs.totalOrders),
      salesQty: getGrowth(currentKPIs.totalSalesQty, previousKPIs.totalSalesQty),
      aov: getGrowth(currentKPIs.aov, previousKPIs.aov),
    }

    // 4. Generate grouped trend data (for charts and trading candlestick chart)
    const groupedDataMap = new Map<string, any[]>()
    currentSales.forEach((sale) => {
      const key = getDateGroupKey(sale.date, groupBy)
      if (!groupedDataMap.has(key)) {
        groupedDataMap.set(key, [])
      }
      groupedDataMap.get(key)!.push(sale)
    })

    const trends: any[] = []
    groupedDataMap.forEach((salesInGroup, key) => {
      const sortedSales = [...salesInGroup].sort((a, b) => a.date.getTime() - b.date.getTime())
      const groupRevenue = sortedSales.reduce((sum, s) => sum + (s.total || 0), 0)
      const groupProfit = sortedSales.reduce((sum, s) => sum + (s.profit || 0), 0)
      const groupCost = sortedSales.reduce((sum, s) => sum + (s.cost || 0), 0)
      const groupOrders = sortedSales.length
      const groupSalesQty = sortedSales.reduce(
        (sum, s) => sum + s.items.reduce((acc: number, item: any) => acc + item.quantity, 0),
        0
      )

      // Candlestick prices are based on transaction sizes (total revenue per transaction).
      // Seeding min/max with 0 would peg every low at 0, since totals are never negative.
      // Reduce rather than spread: a group can hold arbitrarily many sales.
      const transactionTotals = sortedSales.map((s) => s.total || 0)
      const open = transactionTotals[0] ?? 0
      const close = transactionTotals[transactionTotals.length - 1] ?? 0
      const high = transactionTotals.reduce((m, v) => (v > m ? v : m), open)
      const low = transactionTotals.reduce((m, v) => (v < m ? v : m), open)

      trends.push({
        time: key,
        revenue: groupRevenue,
        profit: groupProfit,
        cost: groupCost,
        orders: groupOrders,
        salesQty: groupSalesQty,
        candle: {
          x: key,
          y: [open, high, low, close],
        },
      })
    })

    // 5. Additional Breakdowns: Products, Categories, Payment Methods, Branches
    const productStatsMap = new Map<string, any>()
    const categoryStatsMap = new Map<string, any>()
    const paymentMethodStats = { cash: 0, credit: 0, cashCount: 0, creditCount: 0 }
    const branchStatsMap = new Map<string, any>()

    currentSales.forEach((sale) => {
      // Payment Method
      const method = sale.paymentMethod || 'cash'
      if (method === 'cash') {
        paymentMethodStats.cash += sale.total
        paymentMethodStats.cashCount++
      } else {
        paymentMethodStats.credit += sale.total
        paymentMethodStats.creditCount++
      }

      // Branch/Store simulation (based on Cashier/Terminal names)
      const branchName = sale.cashierName.includes('Admin') ? 'Main Branch' : `Terminal ${sale.cashierName}`
      if (!branchStatsMap.has(branchName)) {
        branchStatsMap.set(branchName, { name: branchName, revenue: 0, profit: 0, orders: 0 })
      }
      const bStat = branchStatsMap.get(branchName)
      bStat.revenue += sale.total
      bStat.profit += sale.profit
      bStat.orders++

      // Items/Products and Categories
      sale.items.forEach((item: any) => {
        const prodId = item.productId
        const prodDb = productMap.get(prodId)
        const categoryName = prodDb?.category || 'General'

        // Product statistics
        if (!productStatsMap.has(prodId)) {
          productStatsMap.set(prodId, {
            id: prodId,
            name: item.name,
            barcode: item.barcode,
            category: categoryName,
            quantity: 0,
            revenue: 0,
            cost: 0,
            profit: 0,
          })
        }
        const pStat = productStatsMap.get(prodId)
        pStat.quantity += item.quantity
        pStat.revenue += item.price * item.quantity
        pStat.cost += item.cost * item.quantity
        pStat.profit += (item.price - item.cost) * item.quantity

        // Category statistics
        if (!categoryStatsMap.has(categoryName)) {
          categoryStatsMap.set(categoryName, { name: categoryName, revenue: 0, profit: 0, quantity: 0 })
        }
        const cStat = categoryStatsMap.get(categoryName)
        cStat.revenue += item.price * item.quantity
        cStat.profit += (item.price - item.cost) * item.quantity
        cStat.quantity += item.quantity
      })
    })

    // Sort breakdowns
    const topProducts = Array.from(productStatsMap.values())
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 8)

    const bestCategories = Array.from(categoryStatsMap.values())
      .sort((a, b) => b.revenue - a.revenue)

    const branchAnalytics = Array.from(branchStatsMap.values())
      .sort((a, b) => b.revenue - a.revenue)

    // 6. Refund statistics
    const totalReturnsCount = currentReturns.length
    const pendingReturnsCount = currentReturns.filter((r) => r.status === 'pending').length
    const approvedReturnsCount = currentReturns.filter((r) => r.status === 'approved').length
    const rejectedReturnsCount = currentReturns.filter((r) => r.status === 'rejected').length
    
    let totalRefundedAmount = 0
    let totalRefundedQty = 0
    currentReturns.forEach((r) => {
      if (r.status === 'approved') {
        const prod = productMap.get(r.productId)
        const price = prod?.price || 0
        totalRefundedAmount += r.quantity * price
        totalRefundedQty += r.quantity
      }
    })

    const refundStats = {
      totalReturnsCount,
      pendingReturnsCount,
      approvedReturnsCount,
      rejectedReturnsCount,
      totalRefundedAmount,
      totalRefundedQty,
    }

    return NextResponse.json({
      kpis: currentKPIs,
      previousKPIs,
      growths,
      trends,
      topProducts,
      bestCategories,
      paymentMethodStats: {
        cash: paymentMethodStats.cash,
        credit: paymentMethodStats.credit,
        cashCount: paymentMethodStats.cashCount,
        creditCount: paymentMethodStats.creditCount,
      },
      branchAnalytics,
      refundStats,
      groupBy,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
    })
  } catch (e) {
    console.error('GET /api/analytics error', e)
    return NextResponse.json({ error: 'Server error', details: String(e) }, { status: 500 })
  }
}
