import { NextResponse } from 'next/server'
import dbConnect from '../../../../lib/mongodb'
import { getSession } from '../../../../lib/auth'
import RestaurantOrder from '../../../../models/RestaurantOrder'
import RestaurantTable from '../../../../models/RestaurantTable'
import { pktDayKey, shiftPktDay } from '../../../../lib/datetime'

export const runtime = 'nodejs'

export async function GET(req: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.role !== 'admin' && session.role !== 'cashier') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const { searchParams } = new URL(req.url)
    const range = searchParams.get('range') || 'today' // today, yesterday, last7, last30, custom, all
    const customStart = searchParams.get('startDate')
    const customEnd = searchParams.get('endDate')
    const sectionFilter = searchParams.get('section') || 'ALL' // ALL, A, B, C
    const tableFilter = searchParams.get('table') || 'ALL' // ALL or specific table name e.g. "Table A1"
    const waiterFilter = searchParams.get('waiter') || 'ALL' // ALL or specific waiter name
    const paymentFilter = searchParams.get('paymentMethod') || 'ALL' // ALL, cash, card, credit
    const search = searchParams.get('q')?.trim().toLowerCase() || ''

    await dbConnect()

    // Base filter: paid orders only
    const queryFilter: Record<string, any> = {
      status: 'paid',
    }

    // Date range calculations in Pakistan Standard Time (PKT UTC+5)
    const todayPkt = pktDayKey(new Date())
    if (range === 'today') {
      queryFilter.createdAt = {
        $gte: new Date(`${todayPkt}T00:00:00.000+05:00`),
        $lte: new Date(`${todayPkt}T23:59:59.999+05:00`),
      }
    } else if (range === 'yesterday') {
      const yesterdayPkt = shiftPktDay(todayPkt, -1)
      queryFilter.createdAt = {
        $gte: new Date(`${yesterdayPkt}T00:00:00.000+05:00`),
        $lte: new Date(`${yesterdayPkt}T23:59:59.999+05:00`),
      }
    } else if (range === 'last7') {
      const sevenDaysAgoPkt = shiftPktDay(todayPkt, -6)
      queryFilter.createdAt = {
        $gte: new Date(`${sevenDaysAgoPkt}T00:00:00.000+05:00`),
        $lte: new Date(`${todayPkt}T23:59:59.999+05:00`),
      }
    } else if (range === 'last30') {
      const thirtyDaysAgoPkt = shiftPktDay(todayPkt, -29)
      queryFilter.createdAt = {
        $gte: new Date(`${thirtyDaysAgoPkt}T00:00:00.000+05:00`),
        $lte: new Date(`${todayPkt}T23:59:59.999+05:00`),
      }
    } else if (range === 'custom' && customStart) {
      const s = customStart <= (customEnd || customStart) ? customStart : (customEnd || customStart)
      const e = customStart <= (customEnd || customStart) ? (customEnd || customStart) : customStart
      queryFilter.createdAt = {
        $gte: new Date(`${s}T00:00:00.000+05:00`),
        $lte: new Date(`${e}T23:59:59.999+05:00`),
      }
    }

    // Section filter
    if (sectionFilter !== 'ALL') {
      queryFilter.section = sectionFilter.toUpperCase()
    }

    // Table filter
    if (tableFilter !== 'ALL') {
      queryFilter.tableName = tableFilter
    }

    // Waiter filter
    if (waiterFilter !== 'ALL') {
      queryFilter.waiterName = {
        $regex: new RegExp(`^${waiterFilter.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
      }
    }

    // Payment method filter (support 'online' and legacy 'card')
    if (paymentFilter !== 'ALL') {
      if (paymentFilter.toLowerCase() === 'online' || paymentFilter.toLowerCase() === 'card') {
        queryFilter.paymentMethod = { $in: ['online', 'card'] }
      } else {
        queryFilter.paymentMethod = paymentFilter.toLowerCase()
      }
    }

    // Fetch all matching orders sorted newest first
    const orders = await RestaurantOrder.find(queryFilter).sort({ createdAt: -1 }).lean()

    // Fetch all tables so we know about all tables even if they have 0 sales in the period
    const allTables = await RestaurantTable.find({}).sort({ section: 1, tableNumber: 1 }).lean()

    // Overall summary metrics
    let totalRevenue = 0
    let totalSubtotal = 0
    let totalDiscount = 0
    let totalTax = 0
    let totalItemsSold = 0

    const paymentBreakdown = {
      cash: { count: 0, total: 0 },
      card: { count: 0, total: 0 },
      credit: { count: 0, total: 0 },
    }

    // Section breakdown map
    const sectionMap = new Map<string, { total: number; count: number; itemsCount: number }>()
    sectionMap.set('A', { total: 0, count: 0, itemsCount: 0 })
    sectionMap.set('B', { total: 0, count: 0, itemsCount: 0 })
    sectionMap.set('C', { total: 0, count: 0, itemsCount: 0 })

    // Table breakdown map
    const tableMap = new Map<
      string,
      {
        tableName: string
        section: string
        totalSales: number
        orderCount: number
        itemsCount: number
        itemFrequency: Map<string, number>
        waiters: Set<string>
      }
    >()

    // Initialize all existing tables in tableMap
    allTables.forEach((t: any) => {
      const name = String(t.tableNumber || t.tableName || '').trim()
      if (!name) return
      const s = String(t.section || 'A').toUpperCase()
      if (!sectionMap.has(s)) {
        sectionMap.set(s, { total: 0, count: 0, itemsCount: 0 })
      }
      tableMap.set(name, {
        tableName: name,
        section: s,
        totalSales: 0,
        orderCount: 0,
        itemsCount: 0,
        itemFrequency: new Map<string, number>(),
        waiters: new Set<string>(),
      })
    })

    // Waiter performance map
    const waitersMap = new Map<
      string,
      {
        waiterName: string
        totalSales: number
        orderCount: number
        itemsCount: number
        tables: Set<string>
      }
    >()

    // Dish sales ranking
    const dishSalesMap = new Map<string, { name: string; category: string; quantity: number; revenue: number }>()

    // Process orders
    orders.forEach((o: any) => {
      const orderTotal = Number(o.total) || 0
      const orderSub = Number(o.subtotal) || 0
      const orderDisc = Number(o.discount) || 0
      const orderTax = Number(o.tax) || 0

      totalRevenue += orderTotal
      totalSubtotal += orderSub
      totalDiscount += orderDisc
      totalTax += orderTax

      // Waiter mapping
      const wName = String(o.waiterName || o.cashierName || 'Staff').trim() || 'Staff'
      if (!waitersMap.has(wName)) {
        waitersMap.set(wName, {
          waiterName: wName,
          totalSales: 0,
          orderCount: 0,
          itemsCount: 0,
          tables: new Set<string>(),
        })
      }
      const wData = waitersMap.get(wName)!
      wData.totalSales += orderTotal
      wData.orderCount += 1

      // Payment method breakdown (support online and legacy card)
      const rawPm = (o.paymentMethod || 'cash').toLowerCase()
      const pm = (rawPm === 'online' || rawPm === 'card') ? 'card' : (rawPm as 'cash' | 'credit')
      if (paymentBreakdown[pm]) {
        paymentBreakdown[pm].count += 1
        paymentBreakdown[pm].total += orderTotal
      } else {
        paymentBreakdown.cash.count += 1
        paymentBreakdown.cash.total += orderTotal
      }

      // Section calculation
      const sec = String(o.section || 'A').toUpperCase()
      if (!sectionMap.has(sec)) {
        sectionMap.set(sec, { total: 0, count: 0, itemsCount: 0 })
      }
      const secData = sectionMap.get(sec)!
      secData.total += orderTotal
      secData.count += 1

      // Table calculation
      const tName = String(o.tableName || '').trim() || 'Unknown'
      if (!tableMap.has(tName)) {
        tableMap.set(tName, {
          tableName: tName,
          section: sec,
          totalSales: 0,
          orderCount: 0,
          itemsCount: 0,
          itemFrequency: new Map<string, number>(),
          waiters: new Set<string>(),
        })
      }
      const tData = tableMap.get(tName)!
      tData.totalSales += orderTotal
      tData.orderCount += 1
      tData.waiters.add(wName)
      wData.tables.add(tName)

      // Items processing
      if (Array.isArray(o.items)) {
        o.items.forEach((it: any) => {
          const qty = Number(it.quantity) || 1
          const price = Number(it.price) || 0
          totalItemsSold += qty
          secData.itemsCount += qty
          tData.itemsCount += qty
          wData.itemsCount += qty

          // Table item frequency
          const curFreq = tData.itemFrequency.get(it.name) || 0
          tData.itemFrequency.set(it.name, curFreq + qty)

          // Overall dish ranking
          if (!dishSalesMap.has(it.name)) {
            dishSalesMap.set(it.name, {
              name: it.name,
              category: it.category || 'General',
              quantity: 0,
              revenue: 0,
            })
          }
          const dishData = dishSalesMap.get(it.name)!
          dishData.quantity += qty
          dishData.revenue += price * qty
        })
      }
    })

    // Format section breakdown array
    const sections = Array.from(sectionMap.entries())
      .map(([section, data]) => ({
        section,
        totalSales: data.total,
        orderCount: data.count,
        itemsCount: data.itemsCount,
        avgOrderValue: data.count > 0 ? Math.round(data.total / data.count) : 0,
        percentage: totalRevenue > 0 ? Math.round((data.total / totalRevenue) * 100) : 0,
      }))
      .sort((a, b) => a.section.localeCompare(b.section))

    // Format table breakdown array
    const tables = Array.from(tableMap.values())
      .filter((t) => Boolean(t.tableName && t.tableName !== 'undefined'))
      .map((t) => {
        // Find top selling dish for this table
        let topDish = '-'
        let maxQty = 0
        t.itemFrequency.forEach((qty, name) => {
          if (qty > maxQty) {
            maxQty = qty
            topDish = `${name} (${qty}x)`
          }
        })

        const finalName = String(t.tableName || 'Table').trim()
        const waiterNameStr = Array.from(t.waiters).join(', ') || 'Unassigned'

        return {
          tableName: finalName,
          section: t.section || 'A',
          waiterName: waiterNameStr,
          waitersList: Array.from(t.waiters),
          totalSales: t.totalSales,
          orderCount: t.orderCount,
          itemsCount: t.itemsCount,
          avgOrderValue: t.orderCount > 0 ? Math.round(t.totalSales / t.orderCount) : 0,
          topDish,
          percentage: totalRevenue > 0 ? Math.round((t.totalSales / totalRevenue) * 100) : 0,
        }
      })
      .sort((a, b) => {
        // Sort first by section, then by sales descending
        if (a.section !== b.section) return a.section.localeCompare(b.section)
        return b.totalSales - a.totalSales
      })

    // Format waiter performance array
    const waiters = Array.from(waitersMap.values())
      .map((w) => ({
        waiterName: w.waiterName,
        totalSales: w.totalSales,
        orderCount: w.orderCount,
        itemsCount: w.itemsCount,
        avgOrderValue: w.orderCount > 0 ? Math.round(w.totalSales / w.orderCount) : 0,
        tablesServed: Array.from(w.tables),
        percentage: totalRevenue > 0 ? Math.round((w.totalSales / totalRevenue) * 100) : 0,
      }))
      .sort((a, b) => b.totalSales - a.totalSales)

    // All distinct waiter names for filter dropdown (always populated)
    const distinctWaiters = await RestaurantOrder.distinct('waiterName', {
      waiterName: { $exists: true, $ne: '' },
    })
    const allWaiters = Array.from(
      new Set(
        [...distinctWaiters, ...Array.from(waitersMap.keys())]
          .map((w) => String(w || '').trim())
          .filter((w) => Boolean(w && w !== 'Unassigned')),
      ),
    ).sort((a, b) => a.localeCompare(b))

    // Top dishes array
    const topDishes = Array.from(dishSalesMap.values())
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 10)

    // Filter orders if search query is provided
    let filteredOrders = orders
    if (search) {
      filteredOrders = orders.filter((o: any) => {
        const matchNum = String(o.orderNumber || '').toLowerCase().includes(search)
        const matchTable = String(o.tableName || '').toLowerCase().includes(search)
        const matchWaiter = String(o.waiterName || '').toLowerCase().includes(search)
        const matchDish = (o.items || []).some((i: any) => String(i.name || '').toLowerCase().includes(search))
        return matchNum || matchTable || matchWaiter || matchDish
      })
    }

    const formattedOrders = filteredOrders.map((o: any) => ({
      ...o,
      id: String(o._id),
      _id: undefined,
      tableId: String(o.tableId),
    }))

    return NextResponse.json({
      summary: {
        totalRevenue,
        totalSubtotal,
        totalDiscount,
        totalTax,
        totalOrders: orders.length,
        totalItemsSold,
        avgOrderValue: orders.length > 0 ? Math.round(totalRevenue / orders.length) : 0,
        paymentBreakdown,
      },
      sections,
      tables,
      waiters,
      allWaiters,
      topDishes,
      orders: formattedOrders,
    })
  } catch (e) {
    console.error('GET /api/restaurant/sales error', e)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
