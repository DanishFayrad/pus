// Column specs shared by the API, the on-screen table, and the CSV/XLSX/PDF writers.
// One definition per report means the exported file always carries the same columns,
// in the same order, as the preview the admin approved.

export type ColumnType = 'text' | 'number' | 'money' | 'percent' | 'datetime' | 'date'

export interface Column {
  key: string
  label: string
  type: ColumnType
}

export interface ReportSpec {
  title: string
  description: string
  columns: Column[]
  /** Snapshot reports describe the present, so the date range does not apply to them. */
  snapshot?: boolean
}

const t = (key: string, label: string): Column => ({ key, label, type: 'text' })
const n = (key: string, label: string): Column => ({ key, label, type: 'number' })
const m = (key: string, label: string): Column => ({ key, label, type: 'money' })
const pct = (key: string, label: string): Column => ({ key, label, type: 'percent' })
const dt = (key: string, label: string): Column => ({ key, label, type: 'datetime' })

export const REPORT_TYPES = {
  sales: {
    title: 'Sales Report',
    description: 'One row per completed sale, with revenue, cost and profit.',
    columns: [
      dt('date', 'Date'),
      t('receipt', 'Receipt'),
      t('cashier', 'Cashier'),
      n('items', 'Units'),
      m('total', 'Total'),
      m('cost', 'Cost'),
      m('profit', 'Profit'),
      t('paymentMethod', 'Payment'),
      t('customer', 'Customer'),
      t('creditStatus', 'Credit'),
    ],
  },
  orders: {
    title: 'Orders Report',
    description: 'Order-level view of every sale in the range.',
    columns: [
      dt('date', 'Date'),
      t('receipt', 'Order'),
      t('cashier', 'Cashier'),
      n('items', 'Units'),
      m('total', 'Total'),
      m('cost', 'Cost'),
      m('profit', 'Profit'),
      t('paymentMethod', 'Payment'),
      t('customer', 'Customer'),
      t('creditStatus', 'Credit'),
    ],
  },
  transactions: {
    title: 'POS Transactions',
    description: 'Line-item detail: one row per product sold on each receipt.',
    columns: [
      dt('date', 'Date'),
      t('receipt', 'Receipt'),
      t('cashier', 'Cashier'),
      t('product', 'Product'),
      t('barcode', 'Barcode'),
      t('category', 'Category'),
      n('quantity', 'Qty'),
      m('unitPrice', 'Unit price'),
      m('unitCost', 'Unit cost'),
      m('lineTotal', 'Line total'),
      m('lineProfit', 'Line profit'),
      t('paymentMethod', 'Payment'),
    ],
  },
  products: {
    title: 'Products Catalogue',
    description: 'Current catalogue with pricing and margin. Snapshot — not date filtered.',
    snapshot: true,
    columns: [
      t('barcode', 'Barcode'),
      t('name', 'Name'),
      t('category', 'Category'),
      m('price', 'Price'),
      m('cost', 'Cost'),
      m('margin', 'Margin'),
      pct('marginPct', 'Margin %'),
      n('stock', 'Stock'),
    ],
  },
  inventory: {
    title: 'Inventory & Stock',
    description: 'Stock on hand with valuation. Snapshot — not date filtered.',
    snapshot: true,
    columns: [
      t('barcode', 'Barcode'),
      t('name', 'Name'),
      t('category', 'Category'),
      n('stock', 'Stock'),
      m('cost', 'Unit cost'),
      m('stockValue', 'Stock value'),
      m('retailValue', 'Retail value'),
      t('status', 'Status'),
    ],
  },
  returns: {
    title: 'Returns',
    description: 'Return requests raised in the selected range.',
    columns: [
      dt('date', 'Requested'),
      t('product', 'Product'),
      n('quantity', 'Qty'),
      t('cashier', 'Cashier'),
      t('status', 'Status'),
    ],
  },
  credits: {
    title: 'Credit Book',
    description: 'Credit sales and their settlement status.',
    columns: [
      dt('date', 'Date'),
      t('receipt', 'Receipt'),
      t('customer', 'Customer'),
      t('phone', 'Phone'),
      m('total', 'Amount'),
      t('status', 'Status'),
      t('cashier', 'Cashier'),
    ],
  },
  customers: {
    title: 'Customers',
    description: 'Derived from sales — grouped by phone, falling back to name.',
    columns: [
      t('customer', 'Customer'),
      t('phone', 'Phone'),
      n('orders', 'Orders'),
      m('totalSpent', 'Total spent'),
      m('outstanding', 'Outstanding'),
      dt('lastPurchase', 'Last purchase'),
    ],
  },
  'profit-loss': {
    title: 'Profit & Loss',
    description: 'Revenue, cost and margin broken down by category, net of approved returns.',
    columns: [
      t('category', 'Category'),
      n('units', 'Units'),
      m('revenue', 'Revenue'),
      m('cost', 'Cost'),
      m('grossProfit', 'Gross profit'),
      pct('marginPct', 'Margin %'),
    ],
  },
} as const satisfies Record<string, ReportSpec>

export type ReportType = keyof typeof REPORT_TYPES

export const REPORT_ORDER: ReportType[] = [
  'sales',
  'orders',
  'transactions',
  'profit-loss',
  'products',
  'inventory',
  'credits',
  'customers',
  'returns',
]
