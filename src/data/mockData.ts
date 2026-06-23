import type { Product, User } from '../types'

export const mockUsers: User[] = [
  { id: 'u1', username: 'admin', password: 'admin123', name: 'Store Admin', role: 'admin' },
  { id: 'u2', username: 'cashier1', password: 'cashier123', name: 'Cashier 1', role: 'cashier' },
  { id: 'u3', username: 'cashier2', password: 'cashier456', name: 'Cashier 2', role: 'cashier' },
  { id: 'u4', username: 'cashier3', password: 'cashier789', name: 'Cashier 3', role: 'cashier' },
]

export const mockProducts: Product[] = [
  { id: 'p1', barcode: '8901234567890', name: 'Coca-Cola 500ml', price: 1.5, cost: 0.9, stock: 48 },
  { id: 'p2', barcode: '8901234567891', name: 'Lays Classic 50g', price: 1.2, cost: 0.7, stock: 30 },
  { id: 'p3', barcode: '8901234567892', name: 'Snickers Bar', price: 1.0, cost: 0.55, stock: 60 },
  { id: 'p4', barcode: '8901234567893', name: 'Bread Loaf', price: 2.5, cost: 1.4, stock: 12 },
  { id: 'p5', barcode: '8901234567894', name: 'Milk 1L', price: 1.8, cost: 1.1, stock: 20 },
  { id: 'p6', barcode: '8901234567895', name: 'Eggs (dozen)', price: 3.5, cost: 2.2, stock: 15 },
  { id: 'p7', barcode: '8901234567896', name: 'Pepsi 500ml', price: 1.5, cost: 0.9, stock: 40 },
  { id: 'p8', barcode: '8901234567897', name: 'Doritos 60g', price: 1.4, cost: 0.8, stock: 25 },
  { id: 'p9', barcode: '8901234567898', name: 'KitKat 4-finger', price: 1.1, cost: 0.6, stock: 50 },
  { id: 'p10', barcode: '8901234567899', name: 'Bottled Water 1L', price: 0.8, cost: 0.3, stock: 100 },
]
