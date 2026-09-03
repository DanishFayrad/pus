'use client'
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { Product, Sale, SaleItem, ReturnRequest } from '../types'

export interface DashboardStats {
  totalRevenue: number
  totalCost: number
  profit: number
  salesCount: number
  itemsSold: number
  todayRevenue: number
}

interface StoreContextValue {
  products: Product[]
  sales: Sale[]
  returnRequests: ReturnRequest[]
  stats: DashboardStats | null
  loading: boolean
  error: string | null
  addProduct: (p: Omit<Product, 'id'>) => Promise<void>
  updateProduct: (id: string, patch: Partial<Omit<Product, 'id'>>) => Promise<void>
  deleteProduct: (id: string) => Promise<void>
  findByBarcode: (barcode: string) => Product | undefined
  recordSale: (
    items: SaleItem[],
    cashier: { id: string; name: string },
    extra?: {
      paymentMethod?: 'cash' | 'credit'
      customerName?: string
      customerPhone?: string
    },
  ) => Promise<Sale | null>
  updateSale: (id: string, patch: Partial<Omit<Sale, 'id'>>) => Promise<void>
  deleteSale: (id: string) => Promise<void>
  createReturnRequest: (productId: string, productName: string, quantity: number) => Promise<void>
  updateReturnRequest: (id: string, status: 'approved' | 'rejected') => Promise<void>
  deleteReturnRequest: (id: string) => Promise<void>
  refresh: () => Promise<void>
  refreshSales: (limit?: number) => Promise<void>
  pollReturns: () => Promise<void>
}

const StoreContext = createContext<StoreContextValue | null>(null)

async function api<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const res = await fetch(input, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error((data && (data.error as string)) || `Request failed: ${res.status}`)
  }
  return data as T
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [products, setProducts] = useState<Product[]>([])
  const [sales, setSales] = useState<Sale[]>([])
  const [returnRequests, setReturnRequests] = useState<ReturnRequest[]>([])
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Granular refetches. A mutation only reloads the collections it can actually change,
  // instead of pulling products, sales and returns back down every time.
  const refreshProducts = useCallback(async () => {
    const p = await api<{ products: Product[] }>('/api/products')
    setProducts(p.products)
  }, [])

  const refreshSales = useCallback(async (limit = 300) => {
    const s = await api<{ sales: Sale[]; stats?: DashboardStats }>(`/api/sales?limit=${limit}`)
    setSales(s.sales)
    if (s.stats) setStats(s.stats)
  }, [])

  const pollReturns = useCallback(async () => {
    try {
      const r = await api<{ returnRequests: ReturnRequest[] }>('/api/returns')
      setReturnRequests(r.returnRequests)
    } catch {
      // Polling runs on a timer; a transient failure is retried on the next tick.
    }
  }, [])

  const refresh = useCallback(async () => {
    try {
      const [pRes, sRes, rRes] = await Promise.allSettled([
        api<{ products: Product[] }>('/api/products'),
        api<{ sales: Sale[]; stats?: DashboardStats }>('/api/sales'),
        api<{ returnRequests: ReturnRequest[] }>('/api/returns'),
      ])

      if (pRes.status === 'fulfilled') setProducts(pRes.value.products)
      if (sRes.status === 'fulfilled') {
        setSales(sRes.value.sales)
        if (sRes.value.stats) setStats(sRes.value.stats)
      }
      if (rRes.status === 'fulfilled') setReturnRequests(rRes.value.returnRequests)

      if (pRes.status === 'rejected' && sRes.status === 'rejected') {
        setError('Failed to load data')
      } else {
        setError(null)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load data')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const addProduct = useCallback<StoreContextValue['addProduct']>(
    async (p) => {
      await api('/api/products', { method: 'POST', body: JSON.stringify(p) })
      await refreshProducts()
    },
    [refreshProducts],
  )

  const updateProduct = useCallback<StoreContextValue['updateProduct']>(
    async (id, patch) => {
      await api(`/api/products/${id}`, { method: 'PUT', body: JSON.stringify(patch) })
      await refreshProducts()
    },
    [refreshProducts],
  )

  const deleteProduct = useCallback<StoreContextValue['deleteProduct']>(
    async (id) => {
      await api(`/api/products/${id}`, { method: 'DELETE' })
      await refreshProducts()
    },
    [refreshProducts],
  )

  const findByBarcode = useCallback<StoreContextValue['findByBarcode']>(
    (barcode) => {
      const trimmed = barcode.trim()
      return products.find((p) => p.barcode === trimmed)
    },
    [products],
  )

  const recordSale = useCallback<StoreContextValue['recordSale']>(
    async (items, cashier, extra) => {
      try {
        const data = await api<{ sale: Sale }>('/api/sales', {
          method: 'POST',
          body: JSON.stringify({
            cashier,
            items: items.map((i) => ({ productId: i.productId, quantity: i.quantity })),
            paymentMethod: extra?.paymentMethod || 'cash',
            customerName: extra?.customerName || '',
            customerPhone: extra?.customerPhone || '',
          }),
        })
        setError(null)
        // Checkout writes a sale and decrements stock, so both collections are stale.
        await Promise.all([refreshSales(), refreshProducts()])
        return data.sale
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Checkout failed')
        return null
      }
    },
    [refreshSales, refreshProducts],
  )

  const updateSale = useCallback<StoreContextValue['updateSale']>(
    async (id, patch) => {
      await api(`/api/sales/${id}`, { method: 'PUT', body: JSON.stringify(patch) })
      await refreshSales()
    },
    [refreshSales],
  )

  const deleteSale = useCallback<StoreContextValue['deleteSale']>(
    async (id) => {
      await api(`/api/sales/${id}`, { method: 'DELETE' })
      await refreshSales()
    },
    [refreshSales],
  )

  const createReturnRequest = useCallback<StoreContextValue['createReturnRequest']>(
    async (productId, productName, quantity) => {
      await api('/api/returns', {
        method: 'POST',
        body: JSON.stringify({ productId, productName, quantity }),
      })
      await pollReturns()
    },
    [pollReturns],
  )

  const updateReturnRequest = useCallback<StoreContextValue['updateReturnRequest']>(
    async (id, status) => {
      await api(`/api/returns/${id}`, { method: 'PUT', body: JSON.stringify({ status }) })
      // Approving a return puts stock back, so products are stale too.
      await Promise.all([pollReturns(), refreshProducts()])
    },
    [pollReturns, refreshProducts],
  )

  const deleteReturnRequest = useCallback<StoreContextValue['deleteReturnRequest']>(
    async (id) => {
      await api(`/api/returns/${id}`, { method: 'DELETE' })
      await pollReturns()
    },
    [pollReturns],
  )

  // Without this memo the provider hands consumers a brand-new object on every render,
  // re-rendering every screen that reads the store even when nothing it uses changed.
  const value = useMemo<StoreContextValue>(
    () => ({
      products,
      sales,
      returnRequests,
      stats,
      loading,
      error,
      addProduct,
      updateProduct,
      deleteProduct,
      findByBarcode,
      recordSale,
      updateSale,
      deleteSale,
      createReturnRequest,
      updateReturnRequest,
      deleteReturnRequest,
      refresh,
      refreshSales,
      pollReturns,
    }),
    [
      products,
      sales,
      returnRequests,
      stats,
      loading,
      error,
      addProduct,
      updateProduct,
      deleteProduct,
      findByBarcode,
      recordSale,
      updateSale,
      deleteSale,
      createReturnRequest,
      updateReturnRequest,
      deleteReturnRequest,
      refresh,
      refreshSales,
      pollReturns,
    ],
  )

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

export function useStore() {
  const ctx = useContext(StoreContext)
  if (!ctx) throw new Error('useStore must be used inside StoreProvider')
  return ctx
}
