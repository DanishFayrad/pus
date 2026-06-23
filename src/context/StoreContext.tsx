'use client'
import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { Product, Sale, SaleItem, ReturnRequest } from '../types'

interface StoreContextValue {
  products: Product[]
  sales: Sale[]
  returnRequests: ReturnRequest[]
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
  resetMockData: () => Promise<void>
  refresh: () => Promise<void>
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
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      setError(null)
      const [p, s, r] = await Promise.all([
        api<{ products: Product[] }>('/api/products'),
        api<{ sales: Sale[] }>('/api/sales'),
        api<{ returnRequests: ReturnRequest[] }>('/api/returns'),
      ])
      setProducts(p.products)
      setSales(s.sales)
      setReturnRequests(r.returnRequests)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load data')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const addProduct: StoreContextValue['addProduct'] = async (p) => {
    await api('/api/products', { method: 'POST', body: JSON.stringify(p) })
    await refresh()
  }

  const updateProduct: StoreContextValue['updateProduct'] = async (id, patch) => {
    await api(`/api/products/${id}`, { method: 'PUT', body: JSON.stringify(patch) })
    await refresh()
  }

  const deleteProduct: StoreContextValue['deleteProduct'] = async (id) => {
    await api(`/api/products/${id}`, { method: 'DELETE' })
    await refresh()
  }

  const findByBarcode: StoreContextValue['findByBarcode'] = (barcode) => {
    const trimmed = barcode.trim()
    return products.find((p) => p.barcode === trimmed)
  }

  const recordSale: StoreContextValue['recordSale'] = async (items, cashier, extra) => {
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
      await refresh()
      return data.sale
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Checkout failed')
      return null
    }
  }

  const updateSale: StoreContextValue['updateSale'] = async (id, patch) => {
    await api(`/api/sales/${id}`, { method: 'PUT', body: JSON.stringify(patch) })
    await refresh()
  }

  const deleteSale: StoreContextValue['deleteSale'] = async (id) => {
    await api(`/api/sales/${id}`, { method: 'DELETE' })
    await refresh()
  }

  const createReturnRequest: StoreContextValue['createReturnRequest'] = async (productId, productName, quantity) => {
    await api('/api/returns', {
      method: 'POST',
      body: JSON.stringify({ productId, productName, quantity }),
    })
    await pollReturns()
  }

  const updateReturnRequest: StoreContextValue['updateReturnRequest'] = async (id, status) => {
    await api(`/api/returns/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ status }),
    })
    await refresh()
  }

  const deleteReturnRequest: StoreContextValue['deleteReturnRequest'] = async (id) => {
    await api(`/api/returns/${id}`, { method: 'DELETE' })
    await pollReturns()
  }

  const pollReturns = useCallback(async () => {
    try {
      const r = await api<{ returnRequests: ReturnRequest[] }>('/api/returns')
      setReturnRequests(r.returnRequests)
    } catch (e) {
      // ignore polling errors
    }
  }, [])

  const resetMockData: StoreContextValue['resetMockData'] = async () => {
    await api('/api/seed', { method: 'POST' })
    await refresh()
  }

  return (
    <StoreContext.Provider
      value={{
        products,
        sales,
        returnRequests,
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
        resetMockData,
        refresh,
        pollReturns,
      }}
    >
      {children}
    </StoreContext.Provider>
  )
}

export function useStore() {
  const ctx = useContext(StoreContext)
  if (!ctx) throw new Error('useStore must be used inside StoreProvider')
  return ctx
}
