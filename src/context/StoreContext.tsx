'use client'
import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { Product, Sale, SaleItem } from '../types'

interface StoreContextValue {
  products: Product[]
  sales: Sale[]
  loading: boolean
  error: string | null
  addProduct: (p: Omit<Product, 'id'>) => Promise<void>
  updateProduct: (id: string, patch: Partial<Omit<Product, 'id'>>) => Promise<void>
  deleteProduct: (id: string) => Promise<void>
  findByBarcode: (barcode: string) => Product | undefined
  recordSale: (
    items: SaleItem[],
    cashier: { id: string; name: string },
  ) => Promise<Sale | null>
  resetMockData: () => Promise<void>
  refresh: () => Promise<void>
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
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      setError(null)
      const [p, s] = await Promise.all([
        api<{ products: Product[] }>('/api/products'),
        api<{ sales: Sale[] }>('/api/sales'),
      ])
      setProducts(p.products)
      setSales(s.sales)
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

  const recordSale: StoreContextValue['recordSale'] = async (items, cashier) => {
    try {
      const data = await api<{ sale: Sale }>('/api/sales', {
        method: 'POST',
        body: JSON.stringify({
          cashier,
          items: items.map((i) => ({ productId: i.productId, quantity: i.quantity })),
        }),
      })
      await refresh()
      return data.sale
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Checkout failed')
      return null
    }
  }

  const resetMockData: StoreContextValue['resetMockData'] = async () => {
    await api('/api/seed', { method: 'POST' })
    await refresh()
  }

  return (
    <StoreContext.Provider
      value={{
        products,
        sales,
        loading,
        error,
        addProduct,
        updateProduct,
        deleteProduct,
        findByBarcode,
        recordSale,
        resetMockData,
        refresh,
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
