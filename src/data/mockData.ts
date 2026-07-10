import type { User } from '../types'

export const mockUsers: User[] = [
  { id: 'u1', username: 'admin', password: 'admin123', name: 'Store Admin', role: 'admin' },
  { id: 'u2', username: 'cashier1', password: 'cashier123', name: 'Cashier 1', role: 'cashier' },
  { id: 'u3', username: 'cashier2', password: 'cashier456', name: 'Cashier 2', role: 'cashier' },
  { id: 'u4', username: 'cashier3', password: 'cashier789', name: 'Cashier 3', role: 'cashier' },
]
