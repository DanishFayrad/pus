import { useMemo, useState, useEffect, useRef } from 'react'
import CameraScanner from '../components/CameraScanner'
import { useStore } from '../context/StoreContext'
import { useAuth } from '../context/AuthContext'
import { formatMoney } from '../lib/currency'
import { formatDateTime } from '../lib/datetime'
import { printReceipt } from '../lib/receipt'
import type { Product, Sale, SaleItem } from '../types'
interface CartLine {
  productId: string
  quantity: number
}

export default function PosPage() {
  const { products, recordSale, addProduct, sales } = useStore()
  const { user } = useAuth()
  const [cart, setCart] = useState<CartLine[]>([])
  const [message, setMessage] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  const [lastSale, setLastSale] = useState<Sale | null>(null)
  const [scannerOpen, setScannerOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [returnModal, setReturnModal] = useState<Product | null>(null)
  const [returnQty, setReturnQty] = useState(1)

  const emptyProductForm = { barcode: '', name: '', price: '', cost: '', stock: '' }
  const [productModalOpen, setProductModalOpen] = useState(false)
  const [productForm, setProductForm] = useState(emptyProductForm)
  const [savingProduct, setSavingProduct] = useState(false)
  const [productError, setProductError] = useState<string | null>(null)

  const [checkoutModalOpen, setCheckoutModalOpen] = useState(false)
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'credit'>('cash')
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [checkoutError, setCheckoutError] = useState<string | null>(null)
  const [submittingCheckout, setSubmittingCheckout] = useState(false)
  const [showCustomerSuggestions, setShowCustomerSuggestions] = useState(false)

  const { returnRequests, createReturnRequest, pollReturns } = useStore()

  // Get all unique customers from sales history
  const uniqueCustomers = useMemo(() => {
    const map = new Map<string, { name: string; phone: string }>()
    if (!sales) return []
    
    sales.forEach(s => {
      if (s.paymentMethod === 'credit' && s.customerName?.trim()) {
        const name = s.customerName.trim()
        const phone = s.customerPhone?.trim() || ''
        const key = `${name.toLowerCase()}||${phone}`
        if (!map.has(key)) {
          map.set(key, { name, phone })
        }
      }
    })
    return Array.from(map.values())
  }, [sales])

  const filteredCustomers = useMemo(() => {
    const q = customerName.trim().toLowerCase()
    if (!q) return uniqueCustomers.slice(0, 5)
    return uniqueCustomers.filter(c => 
      c.name.toLowerCase().includes(q) || 
      c.phone.includes(q)
    ).slice(0, 5)
  }, [uniqueCustomers, customerName])

  // Suggestion Navigation State
  const [activeIndex, setActiveIndex] = useState(-1)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const interval = setInterval(() => {
      pollReturns()
    }, 5000)
    return () => clearInterval(interval)
  }, [pollReturns])

  useEffect(() => {
    setActiveIndex(-1)
  }, [query])

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

  // Resolve a typed/scanned value to a single product.
  // Tries exact barcode, then exact name, then a unique partial match on name or barcode.
  const resolveProduct = (input: string): Product | undefined => {
    const q = input.trim().toLowerCase()
    if (!q) return undefined
    const exactBarcode = products.find((p) => p.barcode.toLowerCase() === q)
    if (exactBarcode) return exactBarcode
    const exactName = products.find((p) => p.name.toLowerCase() === q)
    if (exactName) return exactName
    const matches = products.filter(
      (p) => p.name.toLowerCase().includes(q) || p.barcode.toLowerCase().includes(q),
    )
    return matches.length === 1 ? matches[0] : undefined
  }

  // Returns false when the input text should be kept (ambiguous match), true otherwise.
  const addByBarcode = (input: string): boolean => {
    const raw = input.trim()
    const product = resolveProduct(raw)
    if (!product) {
      const q = raw.toLowerCase()
      const matches = products.filter(
        (p) => p.name.toLowerCase().includes(q) || p.barcode.toLowerCase().includes(q),
      )
      if (matches.length > 1) {
        flash('err', `${matches.length} matches — pick one from the suggestion dropdown`)
        return false
      }
      flash('err', `No product found for "${raw}"`)
      return true
    }
    if (product.stock <= 0) {
      flash('err', `${product.name} is out of stock`)
      return true
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
    setQuery('')
    return true
  }

  const openNewProduct = () => {
    const q = query.trim()
    // If what they typed looks like a barcode (digits), prefill barcode; otherwise prefill name.
    const looksLikeBarcode = q.length > 0 && /^\d+$/.test(q)
    setProductForm({
      ...emptyProductForm,
      barcode: looksLikeBarcode ? q : '',
      name: looksLikeBarcode ? '' : q,
    })
    setProductError(null)
    setProductModalOpen(true)
  }

  const saveNewProduct = async () => {
    const price = parseFloat(productForm.price)
    const cost = parseFloat(productForm.cost)
    const stock = parseInt(productForm.stock, 10)
    if (!productForm.barcode.trim() || !productForm.name.trim()) {
      setProductError('Barcode and name are required')
      return
    }
    if (isNaN(price) || isNaN(cost) || isNaN(stock)) {
      setProductError('Price, cost and stock must be numbers')
      return
    }
    setSavingProduct(true)
    setProductError(null)
    try {
      await addProduct({
        barcode: productForm.barcode.trim(),
        name: productForm.name.trim(),
        price,
        cost,
        stock,
      })
      setProductModalOpen(false)
      setProductForm(emptyProductForm)
      setQuery('')
      flash('ok', `Product added: ${productForm.name.trim()}`)
    } catch (e) {
      setProductError(e instanceof Error ? e.message : 'Failed to add product')
    } finally {
      setSavingProduct(false)
    }
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

  const openCheckoutModal = () => {
    if (cart.length === 0) {
      flash('err', 'Cart is empty')
      return
    }
    setPaymentMethod('cash')
    setCustomerName('')
    setCustomerPhone('')
    setCheckoutError(null)
    setCheckoutModalOpen(true)
  }

  const confirmCheckout = async () => {
    if (!user) return
    if (paymentMethod === 'credit' && !customerName.trim()) {
      setCheckoutError('Customer name is required for credit sales')
      return
    }
    setSubmittingCheckout(true)
    setCheckoutError(null)

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

    const sale = await recordSale(
      items,
      { id: user.id, name: user.name },
      {
        paymentMethod,
        customerName: paymentMethod === 'credit' ? customerName.trim() : undefined,
        customerPhone: paymentMethod === 'credit' ? customerPhone.trim() : undefined,
      }
    )

    setSubmittingCheckout(false)
    if (!sale) {
      setCheckoutError('Checkout failed')
      return
    }

    setCheckoutModalOpen(false)
    setLastSale(sale)
    setCart([])
    flash('ok', `Sale complete: ${formatMoney(sale.total)}`)
    printReceipt(sale)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (filteredProducts.length > 0) {
        setActiveIndex((prev) => (prev + 1) % filteredProducts.length)
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (filteredProducts.length > 0) {
        setActiveIndex((prev) => (prev - 1 + filteredProducts.length) % filteredProducts.length)
      }
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (activeIndex >= 0 && activeIndex < filteredProducts.length) {
        const product = filteredProducts[activeIndex]
        if (product.stock > 0) {
          addByBarcode(product.barcode)
          setQuery('')
          setActiveIndex(-1)
        } else {
          flash('err', `${product.name} is out of stock`)
        }
      } else {
        const raw = query.trim()
        if (raw) {
          const keep = addByBarcode(raw) === false
          if (!keep) {
            setQuery('')
            setActiveIndex(-1)
          }
        }
      }
    } else if (e.key === 'Escape') {
      setQuery('')
      setActiveIndex(-1)
    }
  }

  const shouldAutofocus = !productModalOpen && !returnModal && !scannerOpen && !checkoutModalOpen

  useEffect(() => {
    if (shouldAutofocus) {
      inputRef.current?.focus()
    }
  }, [shouldAutofocus])

  const handleBlur = () => {
    if (shouldAutofocus) {
      setTimeout(() => {
        if (shouldAutofocus) {
          inputRef.current?.focus()
        }
      }, 50)
    }
  }

  return (
    <div className="max-w-7xl mx-auto p-3 sm:p-4 grid lg:grid-cols-[1fr_400px] gap-4 sm:gap-6">
      <section className="bg-white dark:bg-slate-800 rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.02)] border border-slate-100 dark:border-slate-700/50 p-4 sm:p-6 flex flex-col gap-6">
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100 tracking-tight">Scan or enter barcode</h2>
            <div className="flex items-center gap-2">
              {user?.role === 'admin' && (
                <button
                  type="button"
                  onClick={openNewProduct}
                  className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-xl border border-blue-200 bg-blue-50/50 text-blue-700 hover:bg-blue-100/70 transition-all duration-200 cursor-pointer shadow-2xs hover:shadow-xs active:scale-[0.98]"
                  title="Create a new product"
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12h14" />
                  </svg>
                  New product
                </button>
              )}
              <button
                type="button"
                onClick={() => setScannerOpen(true)}
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 transition-all duration-200 cursor-pointer shadow-2xs hover:shadow-xs active:scale-[0.98]"
                title="Scan with device camera"
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 9V7a2 2 0 0 1 2-2h2M17 5h2a2 2 0 0 1 2 2v2M21 15v2a2 2 0 0 1-2 2h-2M7 19H5a2 2 0 0 1-2-2v-2"/>
                  <circle cx="12" cy="12" r="3"/>
                </svg>
                Camera
              </button>
            </div>
          </div>
          <div className="relative flex gap-2.5">
            <div className="relative flex-1">
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                onBlur={handleBlur}
                placeholder="Scan, or type a barcode / product name..."
                className="w-full px-4 py-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono text-base placeholder:font-sans placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 shadow-sm transition-all duration-200"
                inputMode="text"
                autoComplete="off"
              />
              {query.trim() && filteredProducts.length > 0 && (
                <div className="absolute left-0 right-0 mt-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700/60 rounded-2xl shadow-xl max-h-64 overflow-y-auto z-40 divide-y divide-slate-100 dark:divide-slate-700/50">
                  {filteredProducts.map((p, idx) => {
                    const isActive = idx === activeIndex
                    return (
                      <div
                        key={p.id}
                        onClick={() => {
                          if (p.stock > 0) {
                            addByBarcode(p.barcode)
                            setQuery('')
                          } else {
                            flash('err', `${p.name} is out of stock`)
                          }
                        }}
                        className={`px-4 py-3 flex items-center justify-between cursor-pointer transition ${
                          isActive
                            ? 'bg-blue-50/70 dark:bg-blue-950/45 text-blue-700 dark:text-blue-300'
                            : 'hover:bg-slate-50/50 dark:hover:bg-slate-700/40'
                        }`}
                      >
                        <div className="min-w-0 pr-3 text-left">
                          <div className="text-sm font-semibold truncate text-slate-800 dark:text-slate-100">{p.name}</div>
                          <div className="text-xs text-slate-400 dark:text-slate-500 font-mono mt-0.5">{p.barcode}</div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="text-sm font-bold text-blue-600 dark:text-blue-400">{formatMoney(p.price)}</div>
                          <div className="text-[10px] font-bold mt-1">
                            {p.stock <= 0 ? (
                              <span className="text-red-505 bg-red-50 dark:bg-red-950/20 px-1.5 py-0.5 rounded-md">Out of stock</span>
                            ) : p.stock <= 5 ? (
                              <span className="text-amber-600 bg-amber-50 dark:bg-amber-950/20 px-1.5 py-0.5 rounded-md">Low: {p.stock}</span>
                            ) : (
                              <span className="text-slate-550 bg-slate-50 dark:bg-slate-900/50 px-1.5 py-0.5 rounded-md">Stock: {p.stock}</span>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => {
                const raw = query.trim()
                if (raw) {
                  const keep = addByBarcode(raw) === false
                  if (!keep) {
                    setQuery('')
                    setActiveIndex(-1)
                  }
                }
              }}
              className="px-6 py-3.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-semibold shadow-sm hover:shadow transition-all duration-200 active:scale-[0.98] cursor-pointer shrink-0"
            >
              Add
            </button>
          </div>
          {message && (

            <div
              className={`mt-3 text-sm px-4 py-3 rounded-xl border flex items-center gap-2 animate-[slideDown_0.2s_ease-out] ${
                message.kind === 'ok'
                  ? 'bg-emerald-50/50 border-emerald-100 text-emerald-800 dark:bg-emerald-950/20 dark:border-emerald-900/30 dark:text-emerald-300'
                  : 'bg-red-50/50 border-red-100 text-red-700 dark:bg-red-950/20 dark:border-red-900/30 dark:text-red-300'
              }`}
            >
              {message.kind === 'ok' ? (
                <svg className="w-4 h-4 text-emerald-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                <svg className="w-4 h-4 text-red-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              )}
              <span className="font-semibold">{message.text}</span>
            </div>
          )}
        </div>

        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
              {query.trim()
                ? `Search results (${filteredProducts.length})`
                : 'Quick add — type above to search'}
            </h3>
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="text-xs font-semibold text-blue-600 hover:text-blue-700 hover:underline transition cursor-pointer"
              >
                Clear Search
              </button>
            )}
          </div>
          {filteredProducts.length === 0 ? (
            <div className="text-sm text-slate-500 py-10 text-center border border-dashed border-slate-200 dark:border-slate-700 rounded-2xl bg-slate-50/20">
              No products match &ldquo;{query}&rdquo;
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {filteredProducts.map((p) => (
                <div
                  key={p.id}
                  onClick={() => {
                    if (p.stock > 0) addByBarcode(p.barcode)
                  }}
                  role="button"
                  tabIndex={p.stock > 0 ? 0 : -1}
                  onKeyDown={(e) => {
                    if ((e.key === 'Enter' || e.key === ' ') && p.stock > 0) {
                      e.preventDefault()
                      addByBarcode(p.barcode)
                    }
                  }}
                  className={`flex flex-col justify-between p-3.5 rounded-2xl border border-slate-200/70 dark:border-slate-700/60 bg-white dark:bg-slate-800 transition-all duration-200 ${
                    p.stock > 0
                      ? 'cursor-pointer hover:border-blue-400 hover:shadow-md hover:scale-[1.01] dark:hover:bg-blue-900/5'
                      : 'opacity-60 cursor-not-allowed'
                  }`}
                >
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate" title={p.name}>{p.name}</div>
                    <div className="flex items-baseline justify-between mt-1.5">
                      <span className="text-sm font-bold text-blue-600 dark:text-blue-400">{formatMoney(p.price)}</span>
                      <span className="text-[10px] font-medium text-slate-400">
                        {p.stock <= 0 ? (
                          <span className="text-[10px] font-bold text-red-500 bg-red-50 dark:bg-red-950/20 px-1.5 py-0.5 rounded-md">Out of stock</span>
                        ) : p.stock <= 5 ? (
                          <span className="text-[10px] font-bold text-amber-600 bg-amber-50 dark:bg-amber-950/20 px-1.5 py-0.5 rounded-md">Low: {p.stock}</span>
                        ) : (
                          <span>Stock: <span className="font-semibold text-slate-600 dark:text-slate-350">{p.stock}</span></span>
                        )}
                      </span>
                    </div>
                  </div>
                  <div className="flex gap-2 mt-3.5">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        addByBarcode(p.barcode)
                      }}
                      disabled={p.stock <= 0}
                      className="flex-1 py-2 px-2.5 text-xs font-semibold rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-600 hover:text-white dark:bg-blue-900/20 dark:text-blue-300 dark:hover:bg-blue-600 dark:hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition duration-200 cursor-pointer text-center"
                    >
                      Sell
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        setReturnModal(p)
                        setReturnQty(1)
                      }}
                      className="flex-1 py-2 px-2.5 text-xs font-semibold rounded-lg bg-slate-50 text-slate-600 hover:bg-slate-650 hover:text-white dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-white transition duration-200 cursor-pointer text-center"
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

      <section className="bg-white dark:bg-slate-800 rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.02)] border border-slate-100 dark:border-slate-700/50 p-4 sm:p-5 flex flex-col h-fit lg:h-[calc(100vh-6.5rem)] lg:sticky lg:top-18">
        <div className="flex items-center justify-between mb-4 border-b border-slate-100 dark:border-slate-700/50 pb-3">
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5 text-slate-500" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
            </svg>
            <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100 tracking-tight">Cart</h2>
            {cart.length > 0 && (
              <span className="bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400 text-xs font-bold px-2 py-0.5 rounded-full">
                {cart.reduce((s, c) => s + c.quantity, 0)}
              </span>
            )}
          </div>
          {cart.length > 0 && (
            <button
              type="button"
              onClick={clearCart}
              className="text-xs font-semibold text-red-500 hover:text-red-600 hover:underline transition cursor-pointer"
            >
              Clear All
            </button>
          )}
        </div>

        <div className="flex-1 overflow-auto -mx-2 px-2 divide-y divide-slate-100 dark:divide-slate-700/50">
          {lines.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
              <div className="w-16 h-16 rounded-full bg-slate-50 dark:bg-slate-900/50 flex items-center justify-center mb-4 text-slate-400">
                <svg className="w-8 h-8" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 00-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 00-16.536-1.84M7.5 14.25L5.106 5.272M6 20.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm12.75 0a.75.75 0 11-1.5 0 .75.75 0 011.5 0z" />
                </svg>
              </div>
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">Your cart is empty</p>
              <p className="text-xs text-slate-400 mt-1 max-w-[200px]">Scan a barcode or search a product to begin selling</p>
            </div>
          )}
          {lines.map(({ line, product }) => {
            if (!product) return null
            return (
              <div key={line.productId} className="py-3 flex items-center justify-between gap-3 group transition-all">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate group-hover:text-blue-600 dark:group-hover:text-blue-400 transition">{product.name}</div>
                  <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-1">
                    <span className="font-medium text-slate-700 dark:text-slate-300">{formatMoney(product.price)}</span>
                    <span className="text-slate-300">×</span>
                    <span>{line.quantity}</span>
                    <span className="text-slate-300">=</span>
                    <span className="font-bold text-slate-900 dark:text-white">{formatMoney(product.price * line.quantity)}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <div className="flex items-center border border-slate-200 dark:border-slate-700 rounded-lg p-0.5 bg-slate-50 dark:bg-slate-900 shadow-2xs">
                    <button
                      type="button"
                      onClick={() => changeQty(product.id, -1)}
                      className="w-6 h-6 rounded-md flex items-center justify-center text-xs font-bold text-slate-600 hover:text-slate-900 hover:bg-white dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-slate-800 transition active:scale-90 cursor-pointer"
                      title="Decrease quantity"
                    >
                      −
                    </button>
                    <span className="w-6 text-center text-xs font-semibold text-slate-800 dark:text-slate-200">{line.quantity}</span>
                    <button
                      type="button"
                      onClick={() => changeQty(product.id, +1)}
                      className="w-6 h-6 rounded-md flex items-center justify-center text-xs font-bold text-slate-600 hover:text-slate-900 hover:bg-white dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-slate-800 transition active:scale-90 cursor-pointer"
                      title="Increase quantity"
                    >
                      +
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => remove(product.id)}
                    className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition cursor-pointer"
                    title="Remove item"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </div>
            )
          })}
        </div>

        <div className="border-t border-slate-100 dark:border-slate-700/50 pt-4 mt-3 space-y-4">
          <div className="flex items-baseline justify-between">
            <span className="text-sm font-semibold text-slate-500 dark:text-slate-400">Total Amount</span>
            <span className="text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight">{formatMoney(total)}</span>
          </div>
          <button
            type="button"
            onClick={openCheckoutModal}
            disabled={cart.length === 0}
            className="w-full py-3.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:from-slate-100 disabled:to-slate-100 disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed text-white font-bold transition-all duration-200 active:scale-[0.99] cursor-pointer shadow-md shadow-emerald-600/10 hover:shadow-lg disabled:shadow-none hover:shadow-emerald-600/20"
          >
            Checkout
          </button>
        </div>

        {lastSale && (
          <div className="mt-4 text-xs bg-slate-50/50 dark:bg-slate-900/30 border border-slate-100 dark:border-slate-800/80 rounded-xl p-3.5 flex flex-col gap-1.5">
            <div className="flex items-center justify-between font-bold text-slate-700 dark:text-slate-350">
              <span className="truncate">Receipt #…{lastSale.id.slice(-8)}</span>
              <span className="text-[10px] bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">Saved</span>
            </div>
            <div className="text-slate-400 mt-1 flex justify-between">
              <span>{formatDateTime(lastSale.date)}</span>
              <span>{lastSale.items.reduce((s, i) => s + i.quantity, 0)} items</span>
            </div>
            <div className="flex justify-between border-t border-slate-100/50 dark:border-slate-800/40 pt-1.5 mt-1 text-slate-505 shadow-2xs">
              <span>Total Paid:</span>
              <span className="font-bold text-slate-800 dark:text-slate-200">{formatMoney(lastSale.total)}</span>
            </div>
            <button
              type="button"
              onClick={() => printReceipt(lastSale)}
              className="mt-2.5 w-full flex items-center justify-center gap-1.5 py-2 px-3 text-xs font-bold rounded-xl border border-blue-200 bg-blue-50/50 text-blue-750 hover:bg-blue-100/70 dark:border-blue-900/50 dark:bg-blue-950/20 dark:text-blue-300 dark:hover:bg-blue-900 transition cursor-pointer shadow-2xs"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
              </svg>
              Print Receipt (Perchi)
            </button>
          </div>
        )}
        {returnRequests.filter(r => r.cashierId === user?.id).length > 0 && (
          <div className="mt-5 border-t border-slate-100 dark:border-slate-800/80 pt-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">My Returns</h3>
            <div className="space-y-2">
              {returnRequests.filter(r => r.cashierId === user?.id).slice(0, 5).map(r => (
                <div key={r.id} className="text-xs p-2.5 rounded-xl border border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-slate-900/30 hover:border-slate-200 transition duration-150">
                  <div className="truncate flex-1 pr-2 text-slate-600 dark:text-slate-350">
                    <span className="font-bold text-slate-800 dark:text-slate-100">{r.quantity}×</span> {r.productName}
                  </div>
                  <div className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                    r.status === 'pending'
                      ? 'bg-amber-50 text-amber-700 border border-amber-200/50'
                      : r.status === 'approved'
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/50'
                        : 'bg-red-50 text-red-700 border border-red-200/50'
                  }`}>
                    {r.status}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {returnModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-[fadeIn_0.15s_ease-out]">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl p-6 w-full max-w-sm border border-slate-100 dark:border-slate-700/50 transform animate-[scaleUp_0.15s_ease-out]">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white tracking-tight mb-1">Return Product</h3>
            <p className="text-sm text-slate-500 mb-5 leading-relaxed">Request admin approval to return <span className="font-semibold text-slate-800 dark:text-slate-200">{returnModal.name}</span>.</p>
            <div className="mb-5">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">Quantity to Return</label>
              <input 
                type="number" 
                min="1" 
                value={returnQty}
                onChange={(e) => setReturnQty(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 text-base transition-all duration-200 font-semibold"
              />
            </div>
            <div className="flex gap-3">
              <button 
                type="button"
                onClick={() => setReturnModal(null)}
                className="flex-1 py-2.5 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-700 dark:bg-slate-700/50 dark:text-slate-300 dark:hover:bg-slate-700 text-sm font-semibold transition cursor-pointer"
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
                className="flex-1 py-2.5 rounded-xl bg-orange-600 hover:bg-orange-500 text-white text-sm font-semibold transition cursor-pointer shadow-sm hover:shadow active:scale-98"
              >
                Request Return
              </button>
            </div>
          </div>
        </div>
      )}

      {productModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-[fadeIn_0.15s_ease-out]">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl p-6 w-full max-w-md border border-slate-100 dark:border-slate-700/50 transform animate-[scaleUp_0.15s_ease-out]">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white tracking-tight mb-1">New Product</h3>
            <p className="text-sm text-slate-500 mb-5 leading-relaxed">Add a new product to inventory.</p>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">Barcode</label>
                <input
                  autoFocus
                  value={productForm.barcode}
                  onChange={(e) => setProductForm({ ...productForm, barcode: e.target.value })}
                  placeholder="Scan or type barcode"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition shadow-2xs placeholder:font-sans placeholder:text-slate-400"
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">Name</label>
                <input
                  value={productForm.name}
                  onChange={(e) => setProductForm({ ...productForm, name: e.target.value })}
                  placeholder="Product name"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition shadow-2xs placeholder:text-slate-405"
                />
              </div>
              <div className="grid grid-cols-3 gap-3.5">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">Price</label>
                  <input
                    type="number"
                    step="0.01"
                    value={productForm.price}
                    onChange={(e) => setProductForm({ ...productForm, price: e.target.value })}
                    placeholder="0"
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition shadow-2xs font-semibold"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">Cost</label>
                  <input
                    type="number"
                    step="0.01"
                    value={productForm.cost}
                    onChange={(e) => setProductForm({ ...productForm, cost: e.target.value })}
                    placeholder="0"
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition shadow-2xs font-semibold"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">Stock</label>
                  <input
                    type="number"
                    value={productForm.stock}
                    onChange={(e) => setProductForm({ ...productForm, stock: e.target.value })}
                    placeholder="0"
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition shadow-2xs font-semibold"
                  />
                </div>
              </div>
            </div>
            {productError && (
              <div className="mt-4 text-xs font-medium text-red-650 bg-red-50 dark:bg-red-950/20 border border-red-200/50 rounded-xl px-4 py-3">
                {productError}
              </div>
            )}
            <div className="flex gap-3 mt-5">
              <button
                type="button"
                onClick={() => setProductModalOpen(false)}
                className="flex-1 py-2.5 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-700 dark:bg-slate-700/50 dark:text-slate-300 dark:hover:bg-slate-700 text-sm font-semibold transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveNewProduct}
                disabled={savingProduct}
                className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:from-emerald-300 disabled:to-emerald-300 disabled:cursor-not-allowed text-white text-sm font-semibold transition cursor-pointer shadow-sm hover:shadow active:scale-98"
              >
                {savingProduct ? 'Saving…' : 'Add Product'}
              </button>
            </div>
          </div>
        </div>
      )}

      {checkoutModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-[fadeIn_0.15s_ease-out]">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl p-6 w-full max-w-md border border-slate-100 dark:border-slate-700/50 transform animate-[scaleUp_0.15s_ease-out]">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white tracking-tight mb-1">Checkout</h3>
            <p className="text-sm text-slate-500 mb-4 leading-relaxed">Select payment mode and enter customer details if applicable.</p>
            
            <div className="bg-slate-50 dark:bg-slate-900/50 border border-slate-150 dark:border-slate-800 rounded-xl p-4 mb-5 flex justify-between items-center shadow-2xs">
              <span className="text-sm font-semibold text-slate-500">Total Bill Amount:</span>
              <span className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">{formatMoney(total)}</span>
            </div>

            <div className="mb-5">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Payment Method</label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setPaymentMethod('cash')}
                  className={`py-3 px-4 rounded-xl font-bold text-sm border transition duration-205 cursor-pointer text-center ${
                    paymentMethod === 'cash'
                      ? 'bg-emerald-50 border-emerald-300 text-emerald-700 dark:bg-emerald-950/20 dark:border-emerald-900/30 dark:text-emerald-300 shadow-xs'
                      : 'bg-white border-slate-200 text-slate-650 hover:bg-slate-50 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-350 dark:hover:bg-slate-800'
                  }`}
                >
                  💵 Cash (Naqad)
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentMethod('credit')}
                  className={`py-3 px-4 rounded-xl font-bold text-sm border transition duration-205 cursor-pointer text-center ${
                    paymentMethod === 'credit'
                      ? 'bg-blue-50 border-blue-300 text-blue-700 dark:bg-blue-950/20 dark:border-blue-900/30 dark:text-blue-300 shadow-xs'
                      : 'bg-white border-slate-200 text-slate-650 hover:bg-slate-50 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-350 dark:hover:bg-slate-800'
                  }`}
                >
                  📝 Credit
                </button>
              </div>
            </div>

            {paymentMethod === 'credit' && (
              <div className="space-y-4 mb-5 animate-[fadeIn_0.15s_ease-out]">
                <div className="relative">
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                    Customer Name (Grahak Ka Naam) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={customerName}
                    onChange={(e) => {
                      setCustomerName(e.target.value)
                      setShowCustomerSuggestions(true)
                    }}
                    onFocus={() => setShowCustomerSuggestions(true)}
                    onBlur={() => setTimeout(() => setShowCustomerSuggestions(false), 200)}
                    placeholder="e.g. Ahmed Ali"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition shadow-2xs font-semibold"
                  />
                  {showCustomerSuggestions && filteredCustomers.length > 0 && (
                    <div className="absolute left-0 right-0 z-50 mt-1 max-h-48 overflow-y-auto bg-white dark:bg-slate-800 border border-slate-150 dark:border-slate-700 rounded-xl shadow-lg divide-y divide-slate-100 dark:divide-slate-700">
                      {filteredCustomers.map((cust, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onMouseDown={() => {
                            setCustomerName(cust.name)
                            setCustomerPhone(cust.phone)
                            setShowCustomerSuggestions(false)
                          }}
                          className="w-full text-left px-4 py-2 hover:bg-slate-50 dark:hover:bg-slate-750 transition cursor-pointer flex flex-col"
                        >
                          <span className="text-sm font-bold text-slate-850 dark:text-slate-200">{cust.name}</span>
                          {cust.phone && (
                            <span className="text-xs text-slate-405 dark:text-slate-400 font-medium">{cust.phone}</span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                    Customer Phone (Mobile Number)
                  </label>
                  <input
                    type="text"
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    placeholder="e.g. 0300-1234567"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition shadow-2xs font-semibold"
                  />
                </div>
              </div>
            )}

            {checkoutError && (
              <div className="text-xs font-medium text-red-650 bg-red-50 dark:bg-red-950/20 border border-red-200/50 rounded-xl px-4 py-3 mb-4">
                ⚠️ {checkoutError}
              </div>
            )}

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setCheckoutModalOpen(false)}
                className="flex-1 py-2.5 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-700 dark:bg-slate-700/50 dark:text-slate-300 dark:hover:bg-slate-700 text-sm font-semibold transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmCheckout}
                disabled={submittingCheckout}
                className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:from-slate-350 disabled:to-slate-350 disabled:cursor-not-allowed text-white text-sm font-semibold transition cursor-pointer shadow-sm hover:shadow active:scale-98"
              >
                {submittingCheckout ? 'Saving…' : 'Confirm Sale'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
