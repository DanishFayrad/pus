import { useMemo, useState, useEffect, useRef } from 'react'
import CameraScanner from '../components/CameraScanner'
import { useStore } from '../context/StoreContext'
import { useAuth } from '../context/AuthContext'
import { formatMoney } from '../lib/currency'
import { formatDateTime, formatDate, pktDayKey } from '../lib/datetime'
import { printReceipt, printReturnReceipt, printVendorClosingSlip } from '../lib/receipt'
import type { Product, Sale, SaleItem } from '../types'

interface CartLine {
  productId: string
  quantity: number
}

export default function PosPage() {
  const { products, recordSale, addProduct, sales, refresh } = useStore()
  const { user } = useAuth()
  const [cart, setCart] = useState<CartLine[]>([])
  const [message, setMessage] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  const [lastSale, setLastSale] = useState<Sale | null>(null)
  const [scannerOpen, setScannerOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [returnModal, setReturnModal] = useState<Product | null>(null)
  const [returnQty, setReturnQty] = useState(1)

  // Bill Return via Barcode / QR / Lookup State
  const [billReturnOpen, setBillReturnOpen] = useState(false)
  const [billSearchQuery, setBillSearchQuery] = useState('')
  const [selectedSaleForReturn, setSelectedSaleForReturn] = useState<Sale | null>(null)
  const [returnItemQuantities, setReturnItemQuantities] = useState<Record<string, number>>({})
  const [processingReturn, setProcessingReturn] = useState(false)
  const [billReturnError, setBillReturnError] = useState<string | null>(null)

  // Vendor / Counter Closing Modal State
  const [vendorClosingOpen, setVendorClosingOpen] = useState(false)
  const [selectedVendor, setSelectedVendor] = useState<string>('All')
  const [closingDatePreset, setClosingDatePreset] = useState<'today' | 'yesterday' | 'all'>('today')

  const emptyProductForm = { barcode: '', name: '', price: '', cost: '', stock: '', category: '' }
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

  // Extract unique categories (Vendors / Counters)
  const availableVendors = useMemo(() => {
    const cats = new Set<string>()
    products.forEach((p) => {
      if (p.category?.trim()) cats.add(p.category.trim())
    })
    return Array.from(cats).sort()
  }, [products])

  // Get all unique customers from sales history
  const uniqueCustomers = useMemo(() => {
    const map = new Map<string, { name: string; phone: string }>()
    if (!sales) return []
    
    sales.forEach((s) => {
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
    return uniqueCustomers.filter((c) => 
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
    if (!q) return products.slice(0, 12)
    return products
      .filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.barcode.toLowerCase().includes(q) ||
          (p.category && p.category.toLowerCase().includes(q)),
      )
      .slice(0, 30)
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
    setTimeout(() => setMessage(null), 3000)
  }

  // Find sale by invoice barcode/ID
  const findSaleByInput = (input: string): Sale | undefined => {
    const raw = input.trim().replace(/^INV-|^SALE-|^INV:|^#/, '').trim().toLowerCase()
    if (!raw) return undefined

    return sales.find((s) => {
      const idLower = s.id.toLowerCase()
      const suffixLower = s.id.slice(-8).toLowerCase()
      return idLower === raw || suffixLower === raw || idLower.endsWith(raw)
    })
  }

  // Handle invoice barcode scanned or typed
  const handleScannedOrTypedInput = (raw: string): boolean => {
    const trimmed = raw.trim()
    if (!trimmed) return true

    // Check if input looks like an invoice barcode / QR code
    const isInvoiceFormat = 
      trimmed.toUpperCase().startsWith('INV-') || 
      trimmed.toUpperCase().startsWith('SALE-') || 
      trimmed.toUpperCase().startsWith('INV:') ||
      trimmed.toUpperCase().startsWith('RET-')

    const matchedSale = findSaleByInput(trimmed)

    if (isInvoiceFormat || (matchedSale && trimmed.length >= 8 && !products.some((p) => p.barcode === trimmed))) {
      if (matchedSale) {
        openSaleForReturn(matchedSale)
        setQuery('')
        flash('ok', `Invoice #${matchedSale.id.slice(-8).toUpperCase()} loaded for return`)
        return true
      } else {
        flash('err', `Invoice "${trimmed}" not found in system`)
        return true
      }
    }

    // Otherwise treat as normal product barcode
    return addByBarcode(trimmed)
  }

  // Resolve a typed/scanned value to a single product.
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
        category: productForm.category.trim() || 'General',
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
    void printReceipt(sale)
  }

  // Open Bill Return Modal for a specific sale
  const openSaleForReturn = (sale: Sale) => {
    setSelectedSaleForReturn(sale)
    const initialQty: Record<string, number> = {}
    sale.items.forEach((item) => {
      initialQty[item.productId] = 0
    })
    setReturnItemQuantities(initialQty)
    setBillReturnError(null)
    setBillReturnOpen(true)
  }

  // Calculate total refund amount in the Bill Return modal
  const currentTotalRefund = useMemo(() => {
    if (!selectedSaleForReturn) return 0
    return selectedSaleForReturn.items.reduce((sum, item) => {
      const q = returnItemQuantities[item.productId] || 0
      return sum + q * item.price
    }, 0)
  }, [selectedSaleForReturn, returnItemQuantities])

  // Select all items for full refund
  const selectAllForReturn = () => {
    if (!selectedSaleForReturn) return
    const allQty: Record<string, number> = {}
    selectedSaleForReturn.items.forEach((item) => {
      allQty[item.productId] = item.quantity
    })
    setReturnItemQuantities(allQty)
  }

  // Process Bill Return via API
  const handleProcessBillReturn = async () => {
    if (!selectedSaleForReturn || !user) return
    const itemsToReturn = selectedSaleForReturn.items
      .filter((i) => (returnItemQuantities[i.productId] || 0) > 0)
      .map((i) => ({
        productId: i.productId,
        quantity: returnItemQuantities[i.productId],
      }))

    if (itemsToReturn.length === 0) {
      setBillReturnError('Please select at least 1 item quantity to return.')
      return
    }

    setProcessingReturn(true)
    setBillReturnError(null)

    try {
      const res = await fetch('/api/returns/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          saleId: selectedSaleForReturn.id,
          items: itemsToReturn,
        }),
      })

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Failed to process return')
      }

      // Print dedicated return slip
      void printReturnReceipt({
        receiptNo: `#${selectedSaleForReturn.id.slice(-8).toUpperCase()}`,
        date: new Date(),
        cashierName: user.name,
        customerName: selectedSaleForReturn.customerName,
        paymentMethod: selectedSaleForReturn.paymentMethod,
        items: data.items,
        totalRefund: data.totalRefund,
      })

      flash('ok', `Return processed! Refund amount: ${formatMoney(data.totalRefund)}`)
      setBillReturnOpen(false)
      setSelectedSaleForReturn(null)
      await refresh()
    } catch (e) {
      setBillReturnError(e instanceof Error ? e.message : 'Return failed')
    } finally {
      setProcessingReturn(false)
    }
  }

  // Vendor Closing Data Computation
  const vendorClosingData = useMemo(() => {
    const todayStr = pktDayKey(new Date())
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    const yesterdayStr = pktDayKey(yesterday)

    const dateFilteredSales = sales.filter((s) => {
      const day = pktDayKey(s.date)
      if (closingDatePreset === 'today') return day === todayStr
      if (closingDatePreset === 'yesterday') return day === yesterdayStr
      return true
    })

    const itemMap = new Map<string, { name: string; quantity: number; revenue: number }>()
    let totalQty = 0
    let totalRevenue = 0
    let totalCash = 0
    let totalCredit = 0

    dateFilteredSales.forEach((s) => {
      s.items.forEach((i) => {
        const prod = productById.get(i.productId)
        const category = prod?.category || 'General'
        
        if (selectedVendor === 'All' || category.toLowerCase() === selectedVendor.toLowerCase()) {
          const lineRevenue = i.price * i.quantity
          totalQty += i.quantity
          totalRevenue += lineRevenue

          if (s.paymentMethod === 'credit') {
            totalCredit += lineRevenue
          } else {
            totalCash += lineRevenue
          }

          const existing = itemMap.get(i.productId) || { name: i.name, quantity: 0, revenue: 0 }
          existing.quantity += i.quantity
          existing.revenue += lineRevenue
          itemMap.set(i.productId, existing)
        }
      })
    })

    return {
      items: Array.from(itemMap.values()).sort((a, b) => b.revenue - a.revenue),
      totalQty,
      totalRevenue,
      totalCash,
      totalCredit,
      dateLabel: closingDatePreset === 'today' ? `Today (${formatDate(new Date())})` : closingDatePreset === 'yesterday' ? `Yesterday (${formatDate(yesterday)})` : 'All Time',
    }
  }, [sales, products, productById, selectedVendor, closingDatePreset])

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
          const keep = handleScannedOrTypedInput(raw) === false
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

  const shouldAutofocus = !productModalOpen && !returnModal && !scannerOpen && !checkoutModalOpen && !billReturnOpen && !vendorClosingOpen

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
      <section className="bg-white dark:bg-slate-800 rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.02)] border border-slate-200/80 dark:border-slate-700/60 p-4 sm:p-6 flex flex-col gap-6">
        <div>
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white tracking-tight">Scan Barcode / Search Product</h2>
            
            {/* Sleek Modern Action Toolbar */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setSelectedSaleForReturn(null)
                  setBillSearchQuery('')
                  setBillReturnOpen(true)
                }}
                className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-xl border border-slate-200 dark:border-slate-700 bg-white hover:bg-rose-50 hover:border-rose-300 hover:text-rose-600 text-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-rose-950/30 dark:hover:border-rose-900 dark:hover:text-rose-400 transition-all duration-150 cursor-pointer shadow-2xs active:scale-[0.98]"
                title="Scan receipt barcode to return items or refund bill"
              >
                <svg className="w-3.5 h-3.5 text-rose-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16 15v-1a4 4 0 00-4-4H4m0 0l3-3m-3 3l3 3m13-4v5a2 2 0 01-2 2H6" />
                </svg>
                <span>Bill Return</span>
              </button>

              <button
                type="button"
                onClick={() => setVendorClosingOpen(true)}
                className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-xl border border-slate-200 dark:border-slate-700 bg-white hover:bg-amber-50 hover:border-amber-300 hover:text-amber-700 text-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-amber-950/30 dark:hover:border-amber-900 dark:hover:text-amber-400 transition-all duration-150 cursor-pointer shadow-2xs active:scale-[0.98]"
                title="View & Print Vendor / Counter Daily Closing"
              >
                <svg className="w-3.5 h-3.5 text-amber-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <span>Vendor Closing</span>
              </button>

              {user?.role === 'admin' && (
                <button
                  type="button"
                  onClick={openNewProduct}
                  className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-xl border border-blue-200 dark:border-blue-900/50 bg-blue-50/60 hover:bg-blue-100 text-blue-700 dark:bg-blue-950/30 dark:text-blue-300 transition-all duration-150 cursor-pointer shadow-2xs active:scale-[0.98]"
                  title="Create a new product"
                >
                  <svg className="w-3.5 h-3.5 text-blue-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12h14" />
                  </svg>
                  <span>New Product</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => setScannerOpen(true)}
                className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-xl border border-slate-200 dark:border-slate-700 bg-white hover:bg-slate-50 text-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 transition-all duration-150 cursor-pointer shadow-2xs active:scale-[0.98]"
                title="Scan with device camera"
              >
                <svg className="w-3.5 h-3.5 text-slate-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 9V7a2 2 0 0 1 2-2h2M17 5h2a2 2 0 0 1 2 2v2M21 15v2a2 2 0 0 1-2 2h-2M7 19H5a2 2 0 0 1-2-2v-2"/>
                  <circle cx="12" cy="12" r="3"/>
                </svg>
                <span>Camera</span>
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
                placeholder="Scan item barcode OR receipt barcode (INV-...) / search product..."
                className="w-full px-4 py-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono text-base placeholder:font-sans placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 shadow-sm transition-all duration-200"
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
                          <div className="text-xs text-slate-400 dark:text-slate-500 font-mono mt-0.5">
                            {p.barcode} • <span className="text-blue-600 dark:text-blue-400 font-semibold">{p.category || 'General'}</span>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="text-sm font-bold text-blue-600 dark:text-blue-400">{formatMoney(p.price)}</div>
                          <div className="text-[10px] font-bold mt-1">
                            {p.stock <= 0 ? (
                              <span className="text-rose-600 bg-rose-50 dark:bg-rose-950/20 px-1.5 py-0.5 rounded-md">Out of stock</span>
                            ) : p.stock <= 5 ? (
                              <span className="text-amber-600 bg-amber-50 dark:bg-amber-950/20 px-1.5 py-0.5 rounded-md">Low: {p.stock}</span>
                            ) : (
                              <span className="text-slate-500 bg-slate-50 dark:bg-slate-900/50 px-1.5 py-0.5 rounded-md">Stock: {p.stock}</span>
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
                  const keep = handleScannedOrTypedInput(raw) === false
                  if (!keep) {
                    setQuery('')
                    setActiveIndex(-1)
                  }
                }
              }}
              className="px-6 py-3.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-semibold shadow-sm hover:shadow transition-all duration-200 active:scale-[0.98] cursor-pointer shrink-0"
            >
              Add / Scan
            </button>
          </div>
          {message && (
            <div
              className={`mt-3 text-sm px-4 py-3 rounded-xl border flex items-center gap-2 animate-[slideDown_0.2s_ease-out] ${
                message.kind === 'ok'
                  ? 'bg-emerald-50/50 border-emerald-100 text-emerald-800 dark:bg-emerald-950/20 dark:border-emerald-900/30 dark:text-emerald-300'
                  : 'bg-rose-50/50 border-rose-100 text-rose-700 dark:bg-rose-950/20 dark:border-rose-900/30 dark:text-rose-300'
              }`}
            >
              {message.kind === 'ok' ? (
                <svg className="w-4 h-4 text-emerald-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                <svg className="w-4 h-4 text-rose-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
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
            /* Refined Responsive Auto-Fill Grid for Products */
            <div className="grid grid-cols-[repeat(auto-fill,minmax(210px,1fr))] gap-3.5">
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
                  className={`group relative flex flex-col justify-between p-4 rounded-2xl border border-slate-200/90 dark:border-slate-700/70 bg-white dark:bg-slate-900 transition-all duration-200 ${
                    p.stock > 0
                      ? 'cursor-pointer hover:border-blue-500 hover:shadow-md hover:-translate-y-0.5'
                      : 'opacity-60 cursor-not-allowed bg-slate-50/50 dark:bg-slate-900/40'
                  }`}
                >
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="font-bold text-sm text-slate-900 dark:text-slate-100 truncate flex-1" title={p.name}>
                        {p.name}
                      </div>
                      <span className="shrink-0 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                        {p.category || 'General'}
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-1 pt-1">
                      <div className="text-base font-black text-slate-900 dark:text-white whitespace-nowrap">
                        {formatMoney(p.price)}
                      </div>

                      <div className="shrink-0">
                        {p.stock <= 0 ? (
                          <span className="px-2 py-0.5 text-[10px] font-bold rounded-md bg-rose-50 text-rose-600 border border-rose-200 dark:bg-rose-950/40 dark:border-rose-900/50">
                            Out of stock
                          </span>
                        ) : p.stock <= 5 ? (
                          <span className="px-2 py-0.5 text-[10px] font-bold rounded-md bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/40 dark:border-amber-900/50">
                            Low: {p.stock}
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 text-[10px] font-semibold rounded-md bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                            Stock: {p.stock}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-2 mt-4 pt-2 border-t border-slate-100 dark:border-slate-800/80">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        addByBarcode(p.barcode)
                      }}
                      disabled={p.stock <= 0}
                      className="flex-1 py-2 px-3 text-xs font-bold rounded-xl bg-blue-600 hover:bg-blue-500 text-white disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed transition duration-150 cursor-pointer text-center shadow-2xs flex items-center justify-center gap-1"
                    >
                      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12h14" />
                      </svg>
                      Sell
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        setReturnModal(p)
                        setReturnQty(1)
                      }}
                      className="py-2 px-3 text-xs font-semibold rounded-xl border border-slate-200 dark:border-slate-700 bg-white hover:bg-slate-50 text-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 transition duration-150 cursor-pointer text-center"
                      title="Return product"
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
          handleScannedOrTypedInput(code)
        }}
      />

      <section className="bg-white dark:bg-slate-800 rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.02)] border border-slate-200/80 dark:border-slate-700/60 p-4 sm:p-5 flex flex-col h-fit lg:h-[calc(100vh-6.5rem)] lg:sticky lg:top-18">
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
              className="text-xs font-semibold text-rose-500 hover:text-rose-600 hover:underline transition cursor-pointer"
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
              <p className="text-xs text-slate-400 mt-1 max-w-[200px]">Scan an item barcode or search a product to sell</p>
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
                    className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition cursor-pointer"
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
              <span className="truncate">Receipt #{lastSale.id.slice(-8).toUpperCase()}</span>
              <span className="text-[10px] bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">Saved</span>
            </div>
            <div className="text-slate-400 mt-1 flex justify-between">
              <span>{formatDateTime(lastSale.date)}</span>
              <span>{lastSale.items.reduce((s, i) => s + i.quantity, 0)} items</span>
            </div>
            <div className="flex justify-between border-t border-slate-100/50 dark:border-slate-800/40 pt-1.5 mt-1 text-slate-500 shadow-2xs">
              <span>Total Paid:</span>
              <span className="font-bold text-slate-800 dark:text-slate-200">{formatMoney(lastSale.total)}</span>
            </div>
            <button
              type="button"
              onClick={() => void printReceipt(lastSale)}
              className="mt-2.5 w-full flex items-center justify-center gap-1.5 py-2 px-3 text-xs font-bold rounded-xl border border-blue-200 bg-blue-50/50 text-blue-750 hover:bg-blue-100/70 dark:border-blue-900/50 dark:bg-blue-950/20 dark:text-blue-300 dark:hover:bg-blue-900 transition cursor-pointer shadow-2xs"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
              </svg>
              Print Receipt
            </button>
          </div>
        )}
      </section>

      {/* Bill Return & Refund Modal */}
      {billReturnOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-[fadeIn_0.15s_ease-out]">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl p-6 w-full max-w-2xl border border-slate-100 dark:border-slate-700/50 max-h-[90vh] flex flex-col transform animate-[scaleUp_0.15s_ease-out]">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-700/60 pb-3.5 mb-4">
              <div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-500"></span>
                  Bill Return & Item Refund
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">Scan receipt barcode or select invoice to process returns & restore stock.</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setBillReturnOpen(false)
                  setSelectedSaleForReturn(null)
                }}
                className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-500 hover:text-slate-800 flex items-center justify-center text-sm font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            {!selectedSaleForReturn ? (
              <div className="space-y-4 flex-1 overflow-y-auto">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                    Scan Receipt Barcode / Type Invoice #
                  </label>
                  <div className="flex gap-2">
                    <input
                      autoFocus
                      value={billSearchQuery}
                      onChange={(e) => setBillSearchQuery(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          const sale = findSaleByInput(billSearchQuery)
                          if (sale) {
                            openSaleForReturn(sale)
                          } else {
                            setBillReturnError(`Invoice "${billSearchQuery}" not found.`)
                          }
                        }
                      }}
                      placeholder="e.g. INV-12345678 or last 8 digits..."
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 transition shadow-2xs placeholder:font-sans placeholder:text-slate-400"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const sale = findSaleByInput(billSearchQuery)
                        if (sale) {
                          openSaleForReturn(sale)
                        } else {
                          setBillReturnError(`Invoice "${billSearchQuery}" not found.`)
                        }
                      }}
                      className="px-4 py-2.5 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold transition cursor-pointer"
                    >
                      Find
                    </button>
                  </div>
                </div>

                {billReturnError && (
                  <div className="text-xs font-medium text-rose-600 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/50 rounded-xl px-3.5 py-2.5">
                    ⚠️ {billReturnError}
                  </div>
                )}

                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Recent Sales & Invoices</h4>
                  <div className="divide-y divide-slate-100 dark:divide-slate-700/60 border border-slate-200 dark:border-slate-700 rounded-xl max-h-64 overflow-y-auto">
                    {sales.slice(0, 10).map((s) => (
                      <div
                        key={s.id}
                        onClick={() => openSaleForReturn(s)}
                        className="p-3 hover:bg-slate-50 dark:hover:bg-slate-700/50 flex items-center justify-between cursor-pointer transition"
                      >
                        <div>
                          <div className="text-sm font-bold text-slate-800 dark:text-slate-200">
                            #{s.id.slice(-8).toUpperCase()} • <span className="font-normal text-slate-500 text-xs">{formatDateTime(s.date)}</span>
                          </div>
                          <div className="text-xs text-slate-400">
                            Cashier: {s.cashierName} {s.customerName ? `• Customer: ${s.customerName}` : ''} • ({s.items.length} items)
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-bold text-slate-900 dark:text-white">{formatMoney(s.total)}</div>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                            {s.paymentMethod === 'credit' ? 'Credit' : 'Cash'}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto space-y-4">
                {/* Sale Details Banner */}
                <div className="bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700/80 rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-xs text-slate-400 font-bold uppercase">Original Invoice</div>
                    <div className="text-base font-extrabold text-slate-800 dark:text-slate-100">#{selectedSaleForReturn.id.slice(-8).toUpperCase()}</div>
                    <div className="text-xs text-slate-500">{formatDateTime(selectedSaleForReturn.date)} • Cashier: {selectedSaleForReturn.cashierName}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-slate-400 font-bold uppercase">Original Total</div>
                    <div className="text-lg font-bold text-slate-900 dark:text-white">{formatMoney(selectedSaleForReturn.total)}</div>
                    <span className="text-[10px] font-semibold text-slate-500 uppercase">{selectedSaleForReturn.paymentMethod}</span>
                  </div>
                </div>

                {/* Items to Return Table */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">Purchased Items on Bill</h4>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={selectAllForReturn}
                        className="text-xs font-bold text-rose-600 hover:text-rose-700 hover:underline cursor-pointer"
                      >
                        Return Full Bill
                      </button>
                      <span className="text-slate-300">|</span>
                      <button
                        type="button"
                        onClick={() => {
                          const reset: Record<string, number> = {}
                          selectedSaleForReturn.items.forEach((i) => { reset[i.productId] = 0 })
                          setReturnItemQuantities(reset)
                        }}
                        className="text-xs font-semibold text-slate-500 hover:text-slate-700 hover:underline cursor-pointer"
                      >
                        Reset
                      </button>
                    </div>
                  </div>

                  <div className="border border-slate-200 dark:border-slate-700 rounded-xl divide-y divide-slate-100 dark:divide-slate-700/60 overflow-hidden">
                    {selectedSaleForReturn.items.map((item) => {
                      const curReturn = returnItemQuantities[item.productId] || 0
                      return (
                        <div key={item.productId} className="p-3 flex items-center justify-between gap-3 hover:bg-slate-50/50 dark:hover:bg-slate-750">
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">{item.name}</div>
                            <div className="text-xs text-slate-400">
                              Unit Price: {formatMoney(item.price)} • Sold: <strong className="text-slate-700 dark:text-slate-300">{item.quantity}</strong>
                            </div>
                          </div>

                          <div className="flex items-center gap-3">
                            {/* Quantity Selector */}
                            <div className="flex items-center border border-slate-200 dark:border-slate-700 rounded-lg p-0.5 bg-white dark:bg-slate-900 shadow-2xs">
                              <button
                                type="button"
                                onClick={() => {
                                  setReturnItemQuantities((prev) => ({
                                    ...prev,
                                    [item.productId]: Math.max(0, (prev[item.productId] || 0) - 1),
                                  }))
                                }}
                                className="w-7 h-7 rounded-md flex items-center justify-center text-xs font-bold text-slate-600 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800 transition cursor-pointer"
                              >
                                −
                              </button>
                              <span className="w-8 text-center text-xs font-bold text-rose-600 dark:text-rose-400">
                                {curReturn}
                              </span>
                              <button
                                type="button"
                                onClick={() => {
                                  setReturnItemQuantities((prev) => ({
                                    ...prev,
                                    [item.productId]: Math.min(item.quantity, (prev[item.productId] || 0) + 1),
                                  }))
                                }}
                                className="w-7 h-7 rounded-md flex items-center justify-center text-xs font-bold text-slate-600 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800 transition cursor-pointer"
                              >
                                +
                              </button>
                            </div>

                            <div className="text-right w-24">
                              <div className="text-xs text-slate-400">Refund:</div>
                              <div className="text-sm font-bold text-rose-600 dark:text-rose-400">
                                {formatMoney(curReturn * item.price)}
                              </div>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>

                {billReturnError && (
                  <div className="text-xs font-medium text-rose-600 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/50 rounded-xl px-3.5 py-2.5">
                    ⚠️ {billReturnError}
                  </div>
                )}

                {/* Refund Total Calculation Footer */}
                <div className="bg-rose-50/70 dark:bg-rose-950/20 border border-rose-200/70 dark:border-rose-900/40 rounded-xl p-4 flex items-center justify-between">
                  <div>
                    <div className="text-xs font-bold uppercase text-rose-700 dark:text-rose-400">Total Refund to Customer</div>
                    <div className="text-xs text-slate-500">Items will be instantly restocked into inventory</div>
                  </div>
                  <div className="text-2xl font-black text-rose-600 dark:text-rose-300 tracking-tight">
                    {formatMoney(currentTotalRefund)}
                  </div>
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setSelectedSaleForReturn(null)}
                    className="py-2.5 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300 text-xs font-bold transition cursor-pointer"
                  >
                    ← Back to Invoices
                  </button>
                  <button
                    type="button"
                    onClick={handleProcessBillReturn}
                    disabled={processingReturn || currentTotalRefund <= 0}
                    className="flex-1 py-3 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:bg-slate-300 disabled:cursor-not-allowed text-white text-sm font-bold transition cursor-pointer shadow-sm hover:shadow active:scale-98 flex items-center justify-center gap-2"
                  >
                    {processingReturn ? (
                      'Processing Return…'
                    ) : (
                      <>
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        Process Return & Print Slip ({formatMoney(currentTotalRefund)})
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Vendor / Counter Daily Closing Modal */}
      {vendorClosingOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-[fadeIn_0.15s_ease-out]">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl p-6 w-full max-w-xl border border-slate-100 dark:border-slate-700/50 max-h-[90vh] flex flex-col transform animate-[scaleUp_0.15s_ease-out]">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-700/60 pb-3 mb-4">
              <div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span>
                  Vendor / Counter Daily Closing
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">Filter sales by counter (e.g. Barbecue, Ice Cream, Tea) and print closing slip.</p>
              </div>
              <button
                type="button"
                onClick={() => setVendorClosingOpen(false)}
                className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-500 hover:text-slate-800 flex items-center justify-center text-sm font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Vendor & Period Selectors */}
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">Select Vendor / Counter</label>
                <select
                  value={selectedVendor}
                  onChange={(e) => setSelectedVendor(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 cursor-pointer"
                >
                  <option value="All">All Vendors</option>
                  {availableVendors.map((v) => (
                    <option key={v} value={v}>{v}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">Closing Period</label>
                <select
                  value={closingDatePreset}
                  onChange={(e) => setClosingDatePreset(e.target.value as 'today' | 'yesterday' | 'all')}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 cursor-pointer"
                >
                  <option value="today">Today</option>
                  <option value="yesterday">Yesterday</option>
                  <option value="all">All Time</option>
                </select>
              </div>
            </div>

            {/* Quick Metrics */}
            <div className="grid grid-cols-3 gap-2.5 mb-4">
              <div className="bg-slate-50 dark:bg-slate-900/60 p-3 rounded-xl border border-slate-100 dark:border-slate-750 text-center">
                <div className="text-[10px] uppercase font-bold text-slate-400">Total Units</div>
                <div className="text-lg font-black text-slate-900 dark:text-white">{vendorClosingData.totalQty}</div>
              </div>
              <div className="bg-emerald-50/60 dark:bg-emerald-950/20 p-3 rounded-xl border border-emerald-100 dark:border-emerald-900/30 text-center">
                <div className="text-[10px] uppercase font-bold text-emerald-700 dark:text-emerald-400">Cash Collection</div>
                <div className="text-lg font-black text-emerald-700 dark:text-emerald-300">{formatMoney(vendorClosingData.totalCash)}</div>
              </div>
              <div className="bg-amber-50/60 dark:bg-amber-950/20 p-3 rounded-xl border border-amber-100 dark:border-amber-900/30 text-center">
                <div className="text-[10px] uppercase font-bold text-amber-700 dark:text-amber-400">Net Sales</div>
                <div className="text-lg font-black text-amber-700 dark:text-amber-300">{formatMoney(vendorClosingData.totalRevenue)}</div>
              </div>
            </div>

            {/* Item-by-item breakdown */}
            <div className="flex-1 overflow-y-auto mb-4 border border-slate-200 dark:border-slate-700 rounded-xl divide-y divide-slate-100 dark:divide-slate-700/60">
              <div className="bg-slate-50 dark:bg-slate-900/80 px-3.5 py-2 flex items-center justify-between text-xs font-bold text-slate-500 uppercase tracking-wider">
                <span>Item Name</span>
                <span>Sold Qty & Revenue</span>
              </div>
              {vendorClosingData.items.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-400">
                  No sales recorded for this vendor in the selected period.
                </div>
              ) : (
                vendorClosingData.items.map((it, idx) => (
                  <div key={idx} className="px-3.5 py-2.5 flex items-center justify-between hover:bg-slate-50/50 dark:hover:bg-slate-750 text-xs">
                    <span className="font-semibold text-slate-800 dark:text-slate-200">{it.name}</span>
                    <span className="font-mono">
                      <strong className="text-slate-700 dark:text-slate-300">{it.quantity} units</strong> • <span className="font-bold text-amber-600 dark:text-amber-400">{formatMoney(it.revenue)}</span>
                    </span>
                  </div>
                ))
              )}
            </div>

            {/* Actions */}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setVendorClosingOpen(false)}
                className="py-2.5 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300 text-xs font-bold transition cursor-pointer"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => {
                  printVendorClosingSlip({
                    vendorName: selectedVendor === 'All' ? 'ALL VENDORS' : selectedVendor.toUpperCase(),
                    dateRangeLabel: vendorClosingData.dateLabel,
                    generatedBy: user?.name || 'Cashier',
                    items: vendorClosingData.items,
                    totalQty: vendorClosingData.totalQty,
                    totalRevenue: vendorClosingData.totalRevenue,
                    totalCash: vendorClosingData.totalCash,
                    totalCredit: vendorClosingData.totalCredit,
                  })
                }}
                disabled={vendorClosingData.items.length === 0}
                className="flex-1 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 disabled:bg-slate-300 disabled:cursor-not-allowed text-white text-xs font-bold transition cursor-pointer shadow-sm hover:shadow flex items-center justify-center gap-2"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                </svg>
                Print Vendor Closing Slip ({selectedVendor})
              </button>
            </div>
          </div>
        </div>
      )}

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
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition shadow-2xs placeholder:text-slate-400"
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
              <div className="mt-3">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">Category (Vendor / Counter)</label>
                <input
                  list="pos-product-categories"
                  value={productForm.category}
                  onChange={(e) => setProductForm({ ...productForm, category: e.target.value })}
                  placeholder="e.g. Barbecue, Ice Cream, Tea..."
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition shadow-2xs font-semibold"
                />
                <datalist id="pos-product-categories">
                  {Array.from(new Set(products.map((p) => p.category || 'General'))).sort().map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </div>
            </div>
            {productError && (
              <div className="mt-4 text-xs font-medium text-rose-600 bg-rose-50 dark:bg-rose-950/20 border border-rose-200/50 rounded-xl px-4 py-3">
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
                  className={`py-3 px-4 rounded-xl font-bold text-sm border transition duration-200 cursor-pointer text-center ${
                    paymentMethod === 'cash'
                      ? 'bg-emerald-50 border-emerald-300 text-emerald-700 dark:bg-emerald-950/20 dark:border-emerald-900/30 dark:text-emerald-300 shadow-xs'
                      : 'bg-white border-slate-200 text-slate-650 hover:bg-slate-50 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-350 dark:hover:bg-slate-800'
                  }`}
                >
                  💵 Cash
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentMethod('credit')}
                  className={`py-3 px-4 rounded-xl font-bold text-sm border transition duration-200 cursor-pointer text-center ${
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
                    Customer Name <span className="text-rose-500">*</span>
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
                            <span className="text-xs text-slate-400 font-medium">{cust.phone}</span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                    Customer Phone
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
              <div className="text-xs font-medium text-rose-600 bg-rose-50 dark:bg-rose-950/20 border border-rose-200/50 rounded-xl px-4 py-3 mb-4">
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
