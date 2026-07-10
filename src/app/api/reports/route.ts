import { NextResponse } from 'next/server'
import dbConnect from '../../../lib/mongodb'
import { getSession } from '../../../lib/auth'
import Sale from '../../../models/Sale'
import Product from '../../../models/Product'
import ReturnRequest from '../../../models/ReturnRequest'
import { getRangeForPreset } from '../../../lib/dateRange'
import { REPORT_TYPES, type ReportType } from '../../../lib/reports'

export const runtime = 'nodejs'

interface ISaleItemLean {
  productId: string
  name: string
  barcode: string
  price: number
  cost: number
  quantity: number
}

type Row = Record<string, string | number>

const money = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100
const receiptNo = (id: string) => `#${String(id).slice(-6).toUpperCase()}`

/**
 * GET /api/reports?type=<type>&preset=<preset>&startDate=&endDate=
 *
 * Returns the rows the client renders AND exports. Both the on-screen preview and the
 * CSV/XLSX/PDF files are built from this one payload, so an export can never disagree
 * with the table the admin was looking at.
 */
export async function GET(req: Request) {
  const session = await getSession()
  if (!session || session.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { searchParams } = new URL(req.url)
    const type = (searchParams.get('type') || 'sales') as ReportType
    const spec = REPORT_TYPES[type]
    if (!spec) {
      return NextResponse.json({ error: `Unknown report type: ${type}` }, { status: 400 })
    }

    const preset = searchParams.get('preset') || 'all'
    const { startDate, endDate } = getRangeForPreset(
      preset,
      searchParams.get('startDate'),
      searchParams.get('endDate'),
    )

    await dbConnect()

    // Snapshot reports describe stock as it is right now; a date range is meaningless for them.
    const dateFiltered = !('snapshot' in spec && spec.snapshot === true)
    const saleQuery = dateFiltered ? { date: { $gte: startDate, $lte: endDate } } : {}

    let rows: Row[] = []
    let summary: Record<string, number | string> = {}

    if (type === 'products' || type === 'inventory') {
      const products = await Product.find().sort({ name: 1 }).lean()
      rows = products.map((p) => {
        const stock = p.stock ?? 0
        const margin = (p.price ?? 0) - (p.cost ?? 0)
        const base: Row = {
          barcode: p.barcode,
          name: p.name,
          category: p.category || 'General',
          stock,
        }
        if (type === 'products') {
          return {
            ...base,
            price: money(p.price ?? 0),
            cost: money(p.cost ?? 0),
            margin: money(margin),
            marginPct: p.price ? money((margin / p.price) * 100) : 0,
          }
        }
        return {
          ...base,
          cost: money(p.cost ?? 0),
          stockValue: money(stock * (p.cost ?? 0)),
          retailValue: money(stock * (p.price ?? 0)),
          status: stock === 0 ? 'Out of stock' : stock <= 5 ? 'Low stock' : 'In stock',
        }
      })
      summary = {
        Products: rows.length,
        'Units in stock': rows.reduce((s, r) => s + Number(r.stock), 0),
        ...(type === 'inventory'
          ? {
              'Stock value (cost)': money(rows.reduce((s, r) => s + Number(r.stockValue), 0)),
              'Retail value': money(rows.reduce((s, r) => s + Number(r.retailValue), 0)),
              'Out of stock': rows.filter((r) => r.status === 'Out of stock').length,
              'Low stock': rows.filter((r) => r.status === 'Low stock').length,
            }
          : {}),
      }
    } else if (type === 'returns') {
      const returns = await ReturnRequest.find(
        dateFiltered ? { createdAt: { $gte: startDate, $lte: endDate } } : {},
      )
        .sort({ createdAt: -1 })
        .lean()
      rows = returns.map((r) => ({
        date: new Date(r.createdAt).toISOString(),
        product: r.productName,
        quantity: r.quantity,
        cashier: r.cashierName,
        status: r.status,
      }))
      summary = {
        'Return requests': rows.length,
        Approved: rows.filter((r) => r.status === 'approved').length,
        Pending: rows.filter((r) => r.status === 'pending').length,
        Rejected: rows.filter((r) => r.status === 'rejected').length,
        'Units returned': rows
          .filter((r) => r.status === 'approved')
          .reduce((s, r) => s + Number(r.quantity), 0),
      }
    } else {
      // Everything else derives from Sale.
      const sales = await Sale.find(saleQuery).sort({ date: -1 }).lean()

      if (type === 'sales' || type === 'orders') {
        rows = sales.map((s) => ({
          date: new Date(s.date).toISOString(),
          receipt: receiptNo(String(s._id)),
          cashier: s.cashierName,
          items: (s.items as ISaleItemLean[]).reduce((a, i) => a + i.quantity, 0),
          total: money(s.total),
          cost: money(s.cost),
          profit: money(s.profit),
          paymentMethod: s.paymentMethod || 'cash',
          customer: s.customerName || '—',
          creditStatus: s.paymentMethod === 'credit' ? s.creditStatus || 'unpaid' : '—',
        }))
        summary = {
          Orders: rows.length,
          'Units sold': rows.reduce((a, r) => a + Number(r.items), 0),
          Revenue: money(rows.reduce((a, r) => a + Number(r.total), 0)),
          Cost: money(rows.reduce((a, r) => a + Number(r.cost), 0)),
          Profit: money(rows.reduce((a, r) => a + Number(r.profit), 0)),
          'Average order value': rows.length
            ? money(rows.reduce((a, r) => a + Number(r.total), 0) / rows.length)
            : 0,
        }
      } else if (type === 'transactions') {
        const products = await Product.find().lean()
        const catOf = new Map(products.map((p) => [String(p._id), p.category || 'General']))
        for (const s of sales) {
          for (const i of s.items as ISaleItemLean[]) {
            rows.push({
              date: new Date(s.date).toISOString(),
              receipt: receiptNo(String(s._id)),
              cashier: s.cashierName,
              product: i.name,
              barcode: i.barcode,
              category: catOf.get(i.productId) || 'General',
              quantity: i.quantity,
              unitPrice: money(i.price),
              unitCost: money(i.cost),
              lineTotal: money(i.price * i.quantity),
              lineProfit: money((i.price - i.cost) * i.quantity),
              paymentMethod: s.paymentMethod || 'cash',
            })
          }
        }
        summary = {
          'Line items': rows.length,
          'Units sold': rows.reduce((a, r) => a + Number(r.quantity), 0),
          Revenue: money(rows.reduce((a, r) => a + Number(r.lineTotal), 0)),
          Profit: money(rows.reduce((a, r) => a + Number(r.lineProfit), 0)),
        }
      } else if (type === 'credits') {
        const credit = sales.filter((s) => s.paymentMethod === 'credit')
        rows = credit.map((s) => ({
          date: new Date(s.date).toISOString(),
          receipt: receiptNo(String(s._id)),
          customer: s.customerName || '—',
          phone: s.customerPhone || '—',
          total: money(s.total),
          status: s.creditStatus || 'unpaid',
          cashier: s.cashierName,
        }))
        const unpaid = rows.filter((r) => r.status === 'unpaid')
        summary = {
          'Credit bills': rows.length,
          'Total credit': money(rows.reduce((a, r) => a + Number(r.total), 0)),
          Outstanding: money(unpaid.reduce((a, r) => a + Number(r.total), 0)),
          'Unpaid bills': unpaid.length,
          'Settled bills': rows.length - unpaid.length,
        }
      } else if (type === 'customers') {
        // There is no Customer collection — a customer is the identity attached to a sale.
        // Group on phone where present, else on the normalised name.
        const groups = new Map<
          string,
          { name: string; phone: string; orders: number; spent: number; unpaid: number; last: number }
        >()
        for (const s of sales) {
          const name = (s.customerName || '').trim()
          const phone = (s.customerPhone || '').trim()
          if (!name && !phone) continue
          const key = phone || name.toLowerCase()
          const g = groups.get(key) || {
            name: name || '—',
            phone: phone || '—',
            orders: 0,
            spent: 0,
            unpaid: 0,
            last: 0,
          }
          g.orders += 1
          g.spent += s.total
          if (s.paymentMethod === 'credit' && (s.creditStatus || 'unpaid') === 'unpaid') {
            g.unpaid += s.total
          }
          g.last = Math.max(g.last, new Date(s.date).getTime())
          groups.set(key, g)
        }
        rows = [...groups.values()]
          .sort((a, b) => b.spent - a.spent)
          .map((g) => ({
            customer: g.name,
            phone: g.phone,
            orders: g.orders,
            totalSpent: money(g.spent),
            outstanding: money(g.unpaid),
            lastPurchase: new Date(g.last).toISOString(),
          }))
        summary = {
          Customers: rows.length,
          Revenue: money(rows.reduce((a, r) => a + Number(r.totalSpent), 0)),
          Outstanding: money(rows.reduce((a, r) => a + Number(r.outstanding), 0)),
        }
      } else if (type === 'profit-loss') {
        const products = await Product.find().lean()
        const catOf = new Map(products.map((p) => [String(p._id), p.category || 'General']))
        const byCat = new Map<string, { units: number; revenue: number; cost: number }>()
        for (const s of sales) {
          for (const i of s.items as ISaleItemLean[]) {
            const c = catOf.get(i.productId) || 'General'
            const g = byCat.get(c) || { units: 0, revenue: 0, cost: 0 }
            g.units += i.quantity
            g.revenue += i.price * i.quantity
            g.cost += i.cost * i.quantity
            byCat.set(c, g)
          }
        }

        // Approved returns in the window are a contra-revenue line.
        const approved = await ReturnRequest.find({
          status: 'approved',
          ...(dateFiltered ? { createdAt: { $gte: startDate, $lte: endDate } } : {}),
        }).lean()
        const priceOf = new Map(products.map((p) => [String(p._id), p.price ?? 0]))
        const costOf = new Map(products.map((p) => [String(p._id), p.cost ?? 0]))
        const refundRevenue = approved.reduce(
          (a, r) => a + (priceOf.get(String(r.productId)) || 0) * r.quantity,
          0,
        )
        const refundCost = approved.reduce(
          (a, r) => a + (costOf.get(String(r.productId)) || 0) * r.quantity,
          0,
        )

        rows = [...byCat.entries()]
          .sort((a, b) => b[1].revenue - a[1].revenue)
          .map(([category, g]) => ({
            category,
            units: g.units,
            revenue: money(g.revenue),
            cost: money(g.cost),
            grossProfit: money(g.revenue - g.cost),
            marginPct: g.revenue ? money(((g.revenue - g.cost) / g.revenue) * 100) : 0,
          }))

        const grossRevenue = sales.reduce((a, s) => a + s.total, 0)
        const cogs = sales.reduce((a, s) => a + s.cost, 0)
        const netRevenue = grossRevenue - refundRevenue
        const netCogs = cogs - refundCost
        summary = {
          'Gross revenue': money(grossRevenue),
          'Refunds (approved returns)': money(refundRevenue),
          'Net revenue': money(netRevenue),
          'Cost of goods sold': money(netCogs),
          'Net profit': money(netRevenue - netCogs),
          'Net margin %': netRevenue ? money(((netRevenue - netCogs) / netRevenue) * 100) : 0,
          Orders: sales.length,
        }
      }
    }

    return NextResponse.json({
      type,
      title: spec.title,
      columns: spec.columns,
      rows,
      summary,
      dateFiltered,
      preset,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      generatedAt: new Date().toISOString(),
    })
  } catch (e) {
    console.error('GET /api/reports error', e)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
