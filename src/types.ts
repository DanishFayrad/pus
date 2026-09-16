export type Role = 'admin' | 'cashier' | 'waiter'

export interface User {
  id: string
  username: string
  password?: string
  name: string
  role: Role
}

export interface Product {
  id: string
  barcode: string
  name: string
  price: number
  cost: number
  stock: number
  category: string
}

export interface SaleItem {
  productId: string
  name: string
  barcode: string
  price: number
  cost: number
  quantity: number
}

export interface Sale {
  id: string
  date: string
  cashierId: string
  cashierName: string
  items: SaleItem[]
  total: number
  cost: number
  profit: number
  paymentMethod?: 'cash' | 'credit'
  customerName?: string
  customerPhone?: string
  creditStatus?: 'unpaid' | 'paid'
}

export interface ReturnRequest {
  id: string
  productId: string
  productName: string
  quantity: number
  cashierId: string
  cashierName: string
  status: 'pending' | 'approved' | 'rejected'
  createdAt: string
  updatedAt: string
}

export type TableSection = 'A' | 'B' | 'C'
export type TableStatus = 'available' | 'occupied' | 'billing' | 'cleaning'

export interface RestaurantTable {
  id: string
  tableNumber: string
  section: TableSection
  capacity: number
  status: TableStatus
  activeOrderId?: string | null
  activeOrderTotal?: number
  activeItemsCount?: number
  openedAt?: string | null
  updatedAt?: string
}

export interface RestaurantOrderItem {
  productId: string
  name: string
  category: string
  price: number
  quantity: number
  notes?: string
  round: number
  addedAt: string
}

export interface SplitBillItem {
  name: string
  price: number
  quantity: number
}

export interface SplitBill {
  splitNumber: number
  label: string
  items: SplitBillItem[]
  subtotal: number
  discount: number
  total: number
  status: 'unpaid' | 'paid'
  paymentMethod?: string
  paidAt?: string
}

export interface RestaurantOrder {
  id: string
  orderNumber: string
  tableId: string
  tableName: string
  section: TableSection
  waiterId?: string
  waiterName?: string
  cashierId?: string
  cashierName?: string
  status: 'open' | 'billing' | 'paid' | 'cancelled'
  items: RestaurantOrderItem[]
  notes?: string
  subtotal: number
  discount: number
  discountType: 'fixed' | 'percent'
  tax: number
  total: number
  paymentMethod?: string
  splitBills?: SplitBill[]
  paidAt?: string
  createdAt: string
  updatedAt: string
}

export interface MenuItem {
  id: string
  name: string
  category: string
  price: number
  emoji?: string
  barcode?: string
  stock?: number
  enabled: boolean
}

