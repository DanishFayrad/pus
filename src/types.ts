export type Role = 'admin' | 'cashier'

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
}
