import { useMemo, useState } from 'react'
import BarcodeInput from '../components/BarcodeInput'
import CameraScanner from '../components/CameraScanner'
import { useStore } from '../context/StoreContext'
import { useAuth } from '../context/AuthContext'
import { formatMoney } from '../lib/currency'
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
    <div className="max-w-7xl mx-auto p-4 grid lg:grid-cols-[1fr_400px] gap-4">
      <section className="bg-white dark:bg-slate-800 rounded-lg shadow-sm p-4 flex flex-col gap-4">
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
                <button
                  key={p.id}
                  type="button"
                  onClick={() => addByBarcode(p.barcode)}
                  disabled={p.stock <= 0}
                  className="text-left p-3 rounded-md border border-slate-200 dark:border-slate-700 hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-950/30 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <div className="text-sm font-medium truncate">{p.name}</div>
                  <div className="text-xs text-slate-500 flex justify-between">
                    <span>{formatMoney(p.price)}</span>
                    <span>stock: {p.stock}</span>
                  </div>
                </button>
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

      <section className="bg-white dark:bg-slate-800 rounded-lg shadow-sm p-4 flex flex-col h-fit lg:h-[calc(100vh-7rem)] lg:sticky lg:top-4">
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
            <div className="font-semibold mb-1">Last receipt #{lastSale.id}</div>
            <div className="text-slate-500">
              {new Date(lastSale.date).toLocaleString()} —{' '}
              {lastSale.items.reduce((s, i) => s + i.quantity, 0)} items
            </div>
            <div className="text-slate-500">Total: {formatMoney(lastSale.total)}</div>
          </div>
        )}
      </section>
    </div>
  )
}
