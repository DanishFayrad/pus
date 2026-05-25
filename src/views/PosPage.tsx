import { useMemo, useState, useEffect } from 'react'
import BarcodeInput from '../components/BarcodeInput'
import CameraScanner from '../components/CameraScanner'
import { useStore } from '../context/StoreContext'
import { useAuth } from '../context/AuthContext'
import { formatMoney } from '../lib/currency'
import { formatDateTime } from '../lib/datetime'
import type { Product, Sale, SaleItem } from '../types'

interface CartLine {
  productId: string
  quantity: number
}

export default function PosPage() {
  const { products, findByBarcode, recordSale } = useStore()
  const { user } = useAuth()
  const [cart, setCart] = useState<CartLine[]>([])
  const [message, setMessage] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  const [lastSale, setLastSale] = useState<Sale | null>(null)
  const [scannerOpen, setScannerOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [returnModal, setReturnModal] = useState<Product | null>(null)
  const [returnQty, setReturnQty] = useState(1)

  const { returnRequests, createReturnRequest, pollReturns } = useStore()

  useEffect(() => {
    const interval = setInterval(() => {
      pollReturns()
    }, 5000)
    return () => clearInterval(interval)
  }, [pollReturns])

  const productById = useMemo(() => {
    const map = new Map<string, Product>()
    products.forEach((p) => map.set(p.id, p))
    return map
  }, [products])

  const filteredProducts = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return products.slice(0, 8)
    return products
      .filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.barcode.toLowerCase().includes(q),
      )
      .slice(0, 24)
  }, [products, query])

  const lines = cart.map((line) => {
    const p = productById.get(line.productId)
    return { line, product: p }
  })

  const total = lines.reduce(
    (s, l) => s + (l.product ? l.product.price * l.line.quantity : 0),
    0,
  )

  const flash = (kind: 'ok' | 'err', text: string) => {
    setMessage({ kind, text })
    setTimeout(() => setMessage(null), 2500)
  }

  const addByBarcode = (barcode: string) => {
    const product = findByBarcode(barcode)
    if (!product) {
      flash('err', `No product for barcode: ${barcode}`)
      return
    }
    if (product.stock <= 0) {
      flash('err', `${product.name} is out of stock`)
      return
    }
    setCart((prev) => {
      const existing = prev.find((c) => c.productId === product.id)
      if (existing) {
        if (existing.quantity >= product.stock) {
          flash('err', `Only ${product.stock} in stock`)
          return prev
        }
        return prev.map((c) =>
          c.productId === product.id ? { ...c, quantity: c.quantity + 1 } : c,
        )
      }
      return [...prev, { productId: product.id, quantity: 1 }]
    })
    flash('ok', `Added: ${product.name}`)
  }

  const changeQty = (productId: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((c) => {
          if (c.productId !== productId) return c
          const product = productById.get(productId)
          const max = product?.stock ?? c.quantity
          const next = Math.min(max, Math.max(0, c.quantity + delta))
          return { ...c, quantity: next }
        })
        .filter((c) => c.quantity > 0),
    )
  }

  const remove = (productId: string) => {
    setCart((prev) => prev.filter((c) => c.productId !== productId))
  }

  const clearCart = () => setCart([])

  const checkout = async () => {
    if (!user) return
    if (cart.length === 0) {
      flash('err', 'Cart is empty')
      return
    }
    const items: SaleItem[] = cart
      .map((c) => {
        const p = productById.get(c.productId)
        if (!p) return null
        return {
          productId: p.id,
          name: p.name,
          barcode: p.barcode,
          price: p.price,
          cost: p.cost,
          quantity: c.quantity,
        }
      })
      .filter((x): x is SaleItem => x !== null)

    const sale = await recordSale(items, { id: user.id, name: user.name })
    if (!sale) {
      flash('err', 'Checkout failed')
      return
    }
    setLastSale(sale)
    setCart([])
    flash('ok', `Sale complete: ${formatMoney(sale.total)}`)
  }

  return (
    <div className="max-w-7xl mx-auto p-3 sm:p-4 grid lg:grid-cols-[1fr_400px] gap-3 sm:gap-4">
      <section className="bg-white dark:bg-slate-800 rounded-lg shadow-sm p-3 sm:p-4 flex flex-col gap-4">
        <div>
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-lg font-semibold">Scan or enter barcode</h2>
            <button
              type="button"
              onClick={() => setScannerOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md bg-slate-800 hover:bg-slate-700 text-white font-medium"
              title="Scan with device camera"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 9V7a2 2 0 0 1 2-2h2M17 5h2a2 2 0 0 1 2 2v2M21 15v2a2 2 0 0 1-2 2h-2M7 19H5a2 2 0 0 1-2-2v-2"/>
                <circle cx="12" cy="12" r="3"/>
              </svg>
              Camera
            </button>
          </div>
          <BarcodeInput onSubmit={addByBarcode} />
          {message && (
            <div
              className={`mt-2 text-sm px-3 py-2 rounded-md ${
                message.kind === 'ok'
                  ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300'
                  : 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300'
              }`}
            >
              {message.text}
            </div>
          )}
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-slate-500">
              {query.trim() ? `Search results (${filteredProducts.length})` : 'Quick add'}
            </h3>
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="text-xs text-slate-500 hover:text-slate-800 hover:underline"
              >
                Clear
              </button>
            )}
          </div>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by product name or barcode…"
            className="w-full mb-3 px-3 py-2 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            autoComplete="off"
          />
          {filteredProducts.length === 0 ? (
            <div className="text-sm text-slate-500 py-6 text-center border border-dashed border-slate-300 dark:border-slate-700 rounded-md">
              No products match &ldquo;{query}&rdquo;
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
              {filteredProducts.map((p) => (
                <div
                  key={p.id}
                  className="flex flex-col justify-between p-3 rounded-md border border-slate-200 dark:border-slate-700"
                >
                  <div>
                    <div className="text-sm font-medium truncate">{p.name}</div>
                    <div className="text-xs text-slate-500 flex justify-between mt-1">
                      <span>{formatMoney(p.price)}</span>
                      <span>stock: {p.stock}</span>
                    </div>
                  </div>
                  <div className="flex gap-2 mt-3">
                    <button
                      type="button"
                      onClick={() => addByBarcode(p.barcode)}
                      disabled={p.stock <= 0}
                      className="flex-1 py-1.5 px-2 text-xs font-medium rounded bg-blue-50 text-blue-700 hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-300 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Sell
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setReturnModal(p)
                        setReturnQty(1)
                      }}
                      className="flex-1 py-1.5 px-2 text-xs font-medium rounded bg-orange-50 text-orange-700 hover:bg-orange-100 dark:bg-orange-900/30 dark:text-orange-300"
                    >
                      Return
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <CameraScanner
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onDetected={(code) => {
          setScannerOpen(false)
          addByBarcode(code)
        }}
      />

      <section className="bg-white dark:bg-slate-800 rounded-lg shadow-sm p-3 sm:p-4 flex flex-col h-fit lg:h-[calc(100vh-7rem)] lg:sticky lg:top-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">Cart</h2>
          {cart.length > 0 && (
            <button
              type="button"
              onClick={clearCart}
              className="text-xs text-red-600 hover:underline"
            >
              Clear
            </button>
          )}
        </div>

        <div className="flex-1 overflow-auto -mx-2 px-2 divide-y divide-slate-200 dark:divide-slate-700">
          {lines.length === 0 && (
            <div className="text-sm text-slate-500 py-8 text-center">
              Cart is empty. Scan an item to begin.
            </div>
          )}
          {lines.map(({ line, product }) => {
            if (!product) return null
            return (
              <div key={line.productId} className="py-2 flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{product.name}</div>
                  <div className="text-xs text-slate-500">
                    {formatMoney(product.price)} ×{' '}
                    <span className="font-medium">{line.quantity}</span> ={' '}
                    {formatMoney(product.price * line.quantity)}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => changeQty(product.id, -1)}
                    className="w-7 h-7 rounded bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600"
                  >
                    −
                  </button>
                  <button
                    type="button"
                    onClick={() => changeQty(product.id, +1)}
                    className="w-7 h-7 rounded bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600"
                  >
                    +
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(product.id)}
                    className="w-7 h-7 rounded text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"
                    title="Remove"
                  >
                    ×
                  </button>
                </div>
              </div>
            )
          })}
        </div>

        <div className="border-t border-slate-200 dark:border-slate-700 pt-3 mt-2 space-y-3">
          <div className="flex items-center justify-between text-lg font-semibold">
            <span>Total</span>
            <span>{formatMoney(total)}</span>
          </div>
          <button
            type="button"
            onClick={checkout}
            disabled={cart.length === 0}
            className="w-full py-3 rounded-md bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-semibold"
          >
            Checkout
          </button>
        </div>

        {lastSale && (
          <div className="mt-3 text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-md p-3">
            <div className="font-semibold mb-1 truncate">
              Last receipt #…{lastSale.id.slice(-8)}
            </div>
            <div className="text-slate-500">
              {formatDateTime(lastSale.date)} —{' '}
              {lastSale.items.reduce((s, i) => s + i.quantity, 0)} items
            </div>
            <div className="text-slate-500">Total: {formatMoney(lastSale.total)}</div>
          </div>
        )}
        {returnRequests.filter(r => r.cashierId === user?.id).length > 0 && (
          <div className="mt-4 border-t border-slate-200 dark:border-slate-700 pt-3">
            <h3 className="text-sm font-semibold mb-2">My Returns</h3>
            <div className="space-y-2">
              {returnRequests.filter(r => r.cashierId === user?.id).slice(0, 5).map(r => (
                <div key={r.id} className="text-xs p-2 rounded border border-slate-200 dark:border-slate-700 flex justify-between items-center bg-slate-50 dark:bg-slate-900">
                  <div className="truncate flex-1 pr-2">
                    <span className="font-medium">{r.quantity}x</span> {r.productName}
                  </div>
                  <div className={`px-2 py-0.5 rounded-full capitalize ${r.status === 'pending' ? 'bg-amber-100 text-amber-800' : r.status === 'approved' ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}`}>
                    {r.status}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {returnModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-slate-800 rounded-lg shadow-xl p-5 w-full max-w-sm">
            <h3 className="text-lg font-semibold mb-2">Return Product</h3>
            <p className="text-sm text-slate-500 mb-4">Request admin approval to return {returnModal.name}.</p>
            <div className="mb-4">
              <label className="block text-sm font-medium mb-1">Quantity</label>
              <input 
                type="number" 
                min="1" 
                value={returnQty}
                onChange={(e) => setReturnQty(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-full px-3 py-2 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>
            <div className="flex gap-3">
              <button 
                type="button"
                onClick={() => setReturnModal(null)}
                className="flex-1 py-2 rounded bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-300"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  try {
                    await createReturnRequest(returnModal.id, returnModal.name, returnQty)
                    flash('ok', 'Return request sent to admin')
                  } catch (e) {
                    flash('err', e instanceof Error ? e.message : 'Failed to send return request')
                  } finally {
                    setReturnModal(null)
                  }
                }}
                className="flex-1 py-2 rounded bg-orange-600 text-white hover:bg-orange-500"
              >
                Request Return
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
