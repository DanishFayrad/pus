'use client'
import { useState, useEffect, useMemo, useCallback } from 'react'
import Link from 'next/link'
import { useAuth } from '../../context/AuthContext'
import { useConfirm } from '../../components/ConfirmProvider'
import { formatMoney } from '../../lib/currency'
import { formatDateTime } from '../../lib/datetime'
import { printCustomerReceipt, printCashierBill, printKitchenKot, printWaiterSlip } from '../../lib/restaurantReceipt'
import DishModal from './DishModal'
import type { RestaurantTable, RestaurantOrder, MenuItem, TableSection, TableStatus } from '../../types'

const STATUS_CONFIG: Record<
  TableStatus,
  {
    label: string
    badge: string
    border: string
    bg: string
    dot: string
    accent: string
    accentBg: string
    button: string
  }
> = {
  available: {
    label: 'Available',
    badge: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800',
    border: 'border-slate-200/80 dark:border-slate-800 hover:border-emerald-400 dark:hover:border-emerald-500',
    bg: 'bg-white dark:bg-slate-900',
    dot: 'bg-emerald-500 animate-pulse',
    accent: 'text-emerald-600 dark:text-emerald-400',
    accentBg: 'bg-emerald-50/80 dark:bg-emerald-950/30 border-emerald-100 dark:border-emerald-900/40',
    button: 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-600/20',
  },
  occupied: {
    label: 'Occupied',
    badge: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800',
    border: 'border-amber-300/80 dark:border-amber-700/80 hover:border-amber-500',
    bg: 'bg-white dark:bg-slate-900',
    dot: 'bg-amber-500',
    accent: 'text-amber-600 dark:text-amber-400',
    accentBg: 'bg-amber-50/70 dark:bg-amber-950/30 border-amber-200/80 dark:border-amber-900/50',
    button: 'bg-slate-900 hover:bg-slate-800 text-white dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100 shadow-slate-900/10',
  },
  billing: {
    label: 'Billing',
    badge: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800',
    border: 'border-blue-300 dark:border-blue-700 hover:border-blue-500',
    bg: 'bg-white dark:bg-slate-900',
    dot: 'bg-blue-500 animate-pulse',
    accent: 'text-blue-600 dark:text-blue-400',
    accentBg: 'bg-blue-50/80 dark:bg-blue-950/30 border-blue-200 dark:border-blue-900/50',
    button: 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-600/20',
  },
  cleaning: {
    label: 'Needs Cleaning',
    badge: 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/60 dark:text-purple-300 dark:border-purple-800',
    border: 'border-purple-300 dark:border-purple-700 hover:border-purple-500',
    bg: 'bg-white dark:bg-slate-900',
    dot: 'bg-purple-500',
    accent: 'text-purple-600 dark:text-purple-400',
    accentBg: 'bg-purple-50/70 dark:bg-purple-950/30 border-purple-200 dark:border-purple-900/50',
    button: 'bg-purple-600 hover:bg-purple-700 text-white shadow-purple-600/20',
  },
}

export default function RestaurantPos() {
  const { user } = useAuth()
  const confirm = useConfirm()

  // Tables & Filter State
  const [tables, setTables] = useState<RestaurantTable[]>([])
  const [loadingTables, setLoadingTables] = useState(true)
  const [activeSection, setActiveSection] = useState<'ALL' | TableSection>('ALL')
  const [statusFilter, setStatusFilter] = useState<'ALL' | TableStatus>('ALL')
  const [tableSearch, setTableSearch] = useState<string>('')

  // Selected Table & Active Order Workspace
  const [selectedTable, setSelectedTable] = useState<RestaurantTable | null>(null)
  const [activeOrder, setActiveOrder] = useState<RestaurantOrder | null>(null)
  const [loadingOrder, setLoadingOrder] = useState(false)
  const [isFocusMode, setIsFocusMode] = useState(false)

  // Menu State
  const [menuItems, setMenuItems] = useState<MenuItem[]>([])
  const [menuCategories, setMenuCategories] = useState<string[]>([])
  const [selectedCategory, setSelectedCategory] = useState<string>('All')
  const [searchQuery, setSearchQuery] = useState<string>('')

  // Draft items in active order workspace
  const [draftItems, setDraftItems] = useState<any[]>([])
  const [waiterName, setWaiterName] = useState<string>('')
  const [orderNotes, setOrderNotes] = useState<string>('')
  const [discountVal, setDiscountVal] = useState<number>(0)
  const [discountType, setDiscountType] = useState<'fixed' | 'percent'>('fixed')

  // UI States inside Ticket
  const [editingNoteIndex, setEditingNoteIndex] = useState<number | null>(null)
  const [savedSuccess, setSavedSuccess] = useState(false)
  const [showNoteDiscountBar, setShowNoteDiscountBar] = useState(false)

  // Modal States
  const [paymentModalOpen, setPaymentModalOpen] = useState(false)
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'credit' | 'online' | 'card'>('cash')
  const [processingAction, setProcessingAction] = useState(false)
  const [actionMessage, setActionMessage] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)

  // Dish Customization Modal
  const [dishModalOpen, setDishModalOpen] = useState(false)
  const [editingDish, setEditingDish] = useState<MenuItem | null>(null)

  // Fetch Tables
  const fetchTables = useCallback(async () => {
    try {
      const res = await fetch('/api/restaurant/tables')
      if (!res.ok) return
      const data = await res.json()
      setTables(data.tables || [])
    } catch (e) {
      console.error('Failed to load tables', e)
    } finally {
      setLoadingTables(false)
    }
  }, [])

  // Fetch Menu
  const fetchMenu = useCallback(async () => {
    try {
      const res = await fetch('/api/restaurant/menu')
      if (!res.ok) return
      const data = await res.json()
      setMenuItems(data.items || [])
      setMenuCategories(data.categories || [])
    } catch (e) {
      console.error('Failed to load menu', e)
    }
  }, [])

  useEffect(() => {
    fetchTables()
    fetchMenu()
    const interval = setInterval(fetchTables, 12000)
    return () => clearInterval(interval)
  }, [fetchTables, fetchMenu])

  // Keyboard shortcut: Escape to close modals or return to floor plan
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (dishModalOpen) {
          setDishModalOpen(false)
          setEditingDish(null)
        } else if (paymentModalOpen) {
          setPaymentModalOpen(false)
        } else if (isFocusMode) {
          setIsFocusMode(false)
        } else if (selectedTable) {
          handleBackToTables()
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [dishModalOpen, paymentModalOpen, selectedTable, isFocusMode])

  // Select Table & Load its Active Order (updates URL query)
  const handleSelectTable = async (table: RestaurantTable) => {
    setSelectedTable(table)
    setLoadingOrder(true)
    setActionMessage(null)
    setSavedSuccess(false)
    setEditingNoteIndex(null)

    if (typeof window !== 'undefined') {
      window.history.pushState(null, '', `?table=${table.tableNumber}`)
    }

    try {
      const res = await fetch(`/api/restaurant/tables/${table.id}`)
      if (res.ok) {
        const data = await res.json()
        const ord = data.activeOrder as RestaurantOrder | null
        setActiveOrder(ord)
        if (ord) {
          setDraftItems(ord.items || [])
          setWaiterName(ord.waiterName || '')
          setOrderNotes(ord.notes || '')
          setDiscountVal(ord.discount || 0)
          setDiscountType(ord.discountType || 'fixed')
        } else {
          setDraftItems([])
          setWaiterName('')
          setOrderNotes('')
          setDiscountVal(0)
          setDiscountType('fixed')
        }
      }
    } catch (e) {
      console.error('Failed to load table active order', e)
    } finally {
      setLoadingOrder(false)
    }
  }

  // Return to Floor Plan (clears URL query)
  const handleBackToTables = async () => {
    if (activeOrder && draftItems.length === 0) {
      const ok = await confirm({
        title: `Free Table ${selectedTable?.tableNumber}?`,
        message: `All items were removed from Table ${selectedTable?.tableNumber}. Do you want to cancel this order and make the table Available?`,
        confirmLabel: 'Yes, Make Available',
        cancelLabel: 'Keep Occupied',
        tone: 'danger',
      })
      if (ok && selectedTable) {
        await fetch(`/api/restaurant/tables/${selectedTable.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'available' }),
        })
        await fetchTables()
      }
    }
    setSelectedTable(null)
    setActiveOrder(null)
    setDraftItems([])
    setWaiterName('')
    setIsFocusMode(false)
    setSavedSuccess(false)
    if (typeof window !== 'undefined') {
      window.history.pushState(null, '', window.location.pathname)
    }
  }

  // Handle Browser Back / Forward buttons (popstate)
  useEffect(() => {
    const handlePopState = async () => {
      const paramTable = new URLSearchParams(window.location.search).get('table')
      if (!paramTable) {
        if (activeOrder && draftItems.length === 0 && selectedTable) {
          try {
            await fetch(`/api/restaurant/tables/${selectedTable.id}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ status: 'available' }),
            })
            await fetchTables()
          } catch (e) {
            console.error('Auto-free on popstate error:', e)
          }
        }
        setSelectedTable(null)
        setActiveOrder(null)
        setDraftItems([])
        setWaiterName('')
        setIsFocusMode(false)
        setSavedSuccess(false)
      } else if (tables.length > 0) {
        const found = tables.find((t) => t.tableNumber.toUpperCase() === paramTable.toUpperCase())
        if (found) handleSelectTable(found)
      }
    }
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [tables, activeOrder, draftItems, selectedTable, fetchTables])

  // Check URL on initial page load
  useEffect(() => {
    if (tables.length > 0 && !selectedTable) {
      const paramTable = new URLSearchParams(window.location.search).get('table')
      if (paramTable) {
        const found = tables.find((t) => t.tableNumber.toUpperCase() === paramTable.toUpperCase())
        if (found) handleSelectTable(found)
      }
    }
  }, [tables])

  // Filter Tables
  const filteredTables = useMemo(() => {
    return tables.filter((t) => {
      const matchSection = activeSection === 'ALL' || t.section === activeSection
      const matchStatus = statusFilter === 'ALL' || t.status === statusFilter
      const matchSearch = !tableSearch.trim() || t.tableNumber.toLowerCase().includes(tableSearch.trim().toLowerCase())
      return matchSection && matchStatus && matchSearch
    })
  }, [tables, activeSection, statusFilter, tableSearch])

  // Counts for Stats Bar
  const stats = useMemo(() => {
    return {
      total: tables.length,
      available: tables.filter((t) => t.status === 'available').length,
      occupied: tables.filter((t) => t.status === 'occupied').length,
      billing: tables.filter((t) => t.status === 'billing').length,
      cleaning: tables.filter((t) => t.status === 'cleaning').length,
    }
  }, [tables])

  // Filtered Menu Items (by category and search query)
  const filteredMenu = useMemo(() => {
    return menuItems.filter((item) => {
      const matchCat =
        selectedCategory === 'All' ||
        (item.category && item.category.toLowerCase() === selectedCategory.toLowerCase())
      const q = searchQuery.trim().toLowerCase()
      const matchQ =
        !q ||
        item.name.toLowerCase().includes(q) ||
        (item.category && item.category.toLowerCase().includes(q))
      return matchCat && matchQ
    })
  }, [menuItems, selectedCategory, searchQuery])

  // In-Ticket item count helper
  const inTicketCounts = useMemo(() => {
    const map = new Map<string, number>()
    draftItems.forEach((it) => {
      map.set(it.productId, (map.get(it.productId) || 0) + it.quantity)
    })
    return map
  }, [draftItems])

  // Check if current draft has unsaved changes compared to server active order
  const hasUnsavedChanges = useMemo(() => {
    if (!activeOrder) return draftItems.length > 0
    if (draftItems.length !== (activeOrder.items?.length || 0)) return true
    if ((orderNotes || '') !== (activeOrder.notes || '')) return true
    if ((discountVal || 0) !== (activeOrder.discount || 0)) return true
    if ((discountType || 'fixed') !== (activeOrder.discountType || 'fixed')) return true
    for (let i = 0; i < draftItems.length; i++) {
      const d = draftItems[i]
      const a = activeOrder.items[i]
      if (!a || d.productId !== a.productId || d.quantity !== a.quantity || (d.notes || '') !== (a.notes || '')) {
        return true
      }
    }
    return false
  }, [draftItems, activeOrder, orderNotes, discountVal, discountType])

  // Dish Customization Handlers
  const handleOpenAddDish = () => {
    setEditingDish(null)
    setDishModalOpen(true)
  }

  const handleOpenEditDish = (item: MenuItem, e: React.MouseEvent) => {
    e.stopPropagation()
    setEditingDish(item)
    setDishModalOpen(true)
  }

  const handleDishSaved = (savedItem: MenuItem, newCategories: string[]) => {
    setMenuItems((prev) => {
      const idx = prev.findIndex((i) => i.id === savedItem.id)
      if (idx > -1) {
        const next = [...prev]
        next[idx] = savedItem
        return next
      }
      return [savedItem, ...prev]
    })
    if (newCategories && newCategories.length > 0) {
      setMenuCategories(newCategories)
    }
    setActionMessage({
      kind: 'ok',
      text: `Dish "${savedItem.name}" (${formatMoney(savedItem.price)}) saved successfully!`,
    })
  }

  const handleDishDeleted = (deletedId: string, newCategories: string[]) => {
    setMenuItems((prev) => prev.filter((i) => i.id !== deletedId))
    if (newCategories && newCategories.length > 0) {
      setMenuCategories(newCategories)
    }
    setActionMessage({ kind: 'ok', text: 'Dish deleted successfully from menu.' })
  }

  // Add Item to Active Order Cart
  const handleAddItem = (menuItem: MenuItem) => {
    setDraftItems((prev) => {
      const currentMaxRound = activeOrder ? activeOrder.items.reduce((max, i) => Math.max(max, i.round || 1), 1) : 1
      const roundNumber = activeOrder && activeOrder.items.length > 0 ? currentMaxRound + 1 : 1

      const existingIndex = prev.findIndex(
        (i) => i.productId === menuItem.id && (i.round === roundNumber || !activeOrder),
      )

      if (existingIndex > -1) {
        const next = [...prev]
        next[existingIndex] = {
          ...next[existingIndex],
          quantity: next[existingIndex].quantity + 1,
        }
        return next
      }

      return [
        ...prev,
        {
          productId: menuItem.id,
          name: menuItem.name,
          category: menuItem.category,
          price: menuItem.price,
          quantity: 1,
          round: roundNumber,
          notes: '',
        },
      ]
    })
  }

  const handleUpdateQty = (index: number, delta: number) => {
    setDraftItems((prev) => {
      const next = [...prev]
      const newQty = next[index].quantity + delta
      if (newQty <= 0) {
        next.splice(index, 1)
      } else {
        next[index] = { ...next[index], quantity: newQty }
      }
      return next
    })
  }

  const handleUpdateItemNotes = (index: number, notes: string) => {
    setDraftItems((prev) => {
      const next = [...prev]
      next[index] = { ...next[index], notes }
      return next
    })
  }

  const handleRemoveItem = (index: number) => {
    setDraftItems((prev) => prev.filter((_, i) => i !== index))
  }

  // Calculate Draft Totals
  const draftSubtotal = useMemo(() => {
    return draftItems.reduce((sum, item) => sum + item.price * item.quantity, 0)
  }, [draftItems])

  const calculatedDiscount = useMemo(() => {
    if (discountType === 'percent') {
      return (draftSubtotal * (discountVal || 0)) / 100
    }
    return discountVal || 0
  }, [draftSubtotal, discountVal, discountType])

  const draftGrandTotal = Math.max(0, draftSubtotal - calculatedDiscount)

  // Save Order / ensure order is persisted (returns saved order)
  const handleSaveOrder = async (): Promise<RestaurantOrder | null> => {
    if (!selectedTable || draftItems.length === 0) return null
    setProcessingAction(true)
    setActionMessage(null)

    try {
      let savedOrder: RestaurantOrder | null = null
      if (activeOrder) {
        const res = await fetch(`/api/restaurant/orders/${activeOrder.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            items: draftItems,
            notes: orderNotes,
            discount: discountVal,
            discountType,
            waiterName,
          }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Failed to update order')
        savedOrder = data.order
        setActiveOrder(data.order)
      } else {
        const res = await fetch('/api/restaurant/orders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tableId: selectedTable.id,
            tableNumber: selectedTable.tableNumber,
            items: draftItems,
            notes: orderNotes,
            discount: discountVal,
            discountType,
            waiterName,
          }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Failed to create order')
        savedOrder = data.order
        setActiveOrder(data.order)
      }
      await fetchTables()
      return savedOrder
    } catch (e) {
      setActionMessage({ kind: 'err', text: e instanceof Error ? e.message : 'Action failed' })
      return null
    } finally {
      setProcessingAction(false)
    }
  }

  // Handle Print Slips with auto-save or draft fallback (works even before saving!)
  const handlePrintSlipAction = async (type: 'waiter' | 'cashier' | 'receipt') => {
    let orderToPrint = activeOrder
    if (!orderToPrint && draftItems.length > 0) {
      // Build draft order for immediate printing without requiring DB save first
      const draftOrder: RestaurantOrder = {
        id: 'draft',
        orderNumber: `TBL-${selectedTable?.tableNumber || 'ORDER'}`,
        tableId: selectedTable?.id || '',
        tableName: selectedTable?.tableNumber || '',
        section: (selectedTable?.section || 'A') as 'A' | 'B' | 'C',
        waiterName: waiterName || 'Staff',
        cashierName: user?.name || 'Cashier',
        status: 'open',
        items: draftItems,
        subtotal: draftSubtotal,
        discount: discountVal,
        discountType: discountType,
        tax: 0,
        total: draftGrandTotal,
        notes: orderNotes,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      orderToPrint = draftOrder
    } else if (hasUnsavedChanges) {
      try {
        const saved = await handleSaveOrder()
        if (saved) orderToPrint = saved
      } catch (e) {
        console.error('Save before print failed:', e)
      }
    }
    if (!orderToPrint) return

    const finalOrderToPrint: RestaurantOrder = {
      ...orderToPrint,
      waiterName: waiterName || orderToPrint.waiterName || 'Staff',
    }

    if (type === 'waiter') {
      printWaiterSlip(finalOrderToPrint)
    } else if (type === 'cashier') {
      printCashierBill(finalOrderToPrint)
    } else {
      printCustomerReceipt(finalOrderToPrint)
    }
  }

  // Handle Settle with auto-save
  const handleOpenPaymentModal = async () => {
    let orderToSettle = activeOrder
    if (!orderToSettle || hasUnsavedChanges) {
      orderToSettle = await handleSaveOrder()
    }
    if (orderToSettle) {
      setPaymentModalOpen(true)
    }
  }

  // Request Bill
  const handleRequestBill = async () => {
    if (!activeOrder) return
    setProcessingAction(true)
    try {
      const res = await fetch(`/api/restaurant/orders/${activeOrder.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'billing' }),
      })
      const data = await res.json()
      if (res.ok) {
        setActiveOrder(data.order)
        setActionMessage({ kind: 'ok', text: `Table ${selectedTable?.tableNumber} is now in Billing status.` })
        await fetchTables()
      }
    } catch (e) {
      console.error('Request bill failed', e)
    } finally {
      setProcessingAction(false)
    }
  }

  // Settle & Pay Order
  const handleConfirmPayment = async () => {
    if (!activeOrder) return
    setProcessingAction(true)
    try {
      const res = await fetch(`/api/restaurant/orders/${activeOrder.id}/pay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentMethod }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Payment failed')

      printCustomerReceipt(data.order)
      setActiveOrder(null)
      setPaymentModalOpen(false)
      setActionMessage({ kind: 'ok', text: `Payment received! Table ${selectedTable?.tableNumber} is now marked for cleaning.` })
      if (selectedTable) {
        setSelectedTable({ ...selectedTable, status: 'cleaning', activeOrderTotal: 0, activeItemsCount: 0 })
      }
      await fetchTables()
    } catch (e) {
      setActionMessage({ kind: 'err', text: e instanceof Error ? e.message : 'Payment settlement failed' })
    } finally {
      setProcessingAction(false)
    }
  }

  // Cancel active order and free table
  const handleCancelAndFreeTable = async (tableToFree?: RestaurantTable | null) => {
    const tbl = tableToFree || selectedTable
    if (!tbl) return
    const ok = await confirm({
      title: `Free Table ${tbl.tableNumber}`,
      message: `Are you sure you want to cancel the active order on Table ${tbl.tableNumber} and mark it Available?`,
      confirmLabel: 'Free Table',
      tone: 'danger',
    })
    if (!ok) return

    setProcessingAction(true)
    try {
      const res = await fetch(`/api/restaurant/tables/${tbl.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'available' }),
      })
      if (res.ok) {
        setActionMessage({ kind: 'ok', text: `Table ${tbl.tableNumber} is now Available.` })
        if (selectedTable?.id === tbl.id) {
          handleBackToTables()
        }
        await fetchTables()
      }
    } catch (e) {
      console.error('Cancel order / free table failed', e)
      setActionMessage({ kind: 'err', text: 'Failed to free table' })
    } finally {
      setProcessingAction(false)
    }
  }

  // Mark Table Clean / Available
  const handleMarkAvailable = async (tableId: string) => {
    setProcessingAction(true)
    try {
      const res = await fetch(`/api/restaurant/tables/${tableId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'available' }),
      })
      if (res.ok) {
        if (selectedTable?.id === tableId) {
          setSelectedTable({ ...selectedTable, status: 'available', activeOrderTotal: 0, activeItemsCount: 0 })
          setActiveOrder(null)
          setDraftItems([])
        }
        await fetchTables()
      }
    } catch (e) {
      console.error('Mark available failed', e)
    } finally {
      setProcessingAction(false)
    }
  }

  // Category Icon Helper
  const getCategoryIcon = (cat: string) => {
    const c = cat.toLowerCase()
    if (c.includes('bbq')) return '🍢'
    if (c.includes('desi') || c.includes('karahi')) return '🍛'
    if (c.includes('fast') || c.includes('burger')) return '🍔'
    if (c.includes('drink') || c.includes('beverage')) return '🥤'
    if (c.includes('water')) return '💧'
    if (c.includes('tea') || c.includes('chai') || c.includes('coffee')) return '☕'
    return '🍽️'
  }

  // =========================================================================
  // VIEW 2: DEDICATED FULL-PAGE ORDER WORKSPACE (Clean, Non-cramped POS Terminal)
  // =========================================================================
  if (selectedTable) {
    const tableConf = STATUS_CONFIG[selectedTable.status] || STATUS_CONFIG.available
    const totalQty = draftItems.reduce((s, it) => s + it.quantity, 0)

    return (
      <div
        className={
          isFocusMode
            ? 'fixed inset-0 z-50 bg-slate-100 dark:bg-slate-950 p-3 sm:p-5 lg:p-6 space-y-4 animate-in fade-in duration-150 overflow-hidden flex flex-col'
            : 'p-3 sm:p-5 lg:p-6 space-y-4 animate-in fade-in duration-150'
        }
      >
        {/* Full-Page Top Control Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-white dark:bg-slate-900 p-3.5 sm:p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm shrink-0">
          <div className="flex flex-wrap items-center gap-3.5">
            {/* Back Button */}
            <button
              type="button"
              onClick={handleBackToTables}
              className="flex items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3.5 py-2 text-xs font-black text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 hover:border-slate-300 transition cursor-pointer shadow-sm group"
            >
              <svg className="h-4 w-4 text-slate-500 group-hover:-translate-x-0.5 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              <span>Back to Floor Plan</span>
              <kbd className="hidden sm:inline-block ml-1 px-1.5 py-0.5 text-[10px] font-mono bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded">Esc</kbd>
            </button>

            {/* Table Badge & Info */}
            <div className="flex items-center gap-3">
              <div className="h-11 w-11 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white font-black text-lg flex items-center justify-center shadow-md shadow-blue-500/25 shrink-0">
                {selectedTable.tableNumber}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-lg font-black text-slate-900 dark:text-white">
                    Table {selectedTable.tableNumber}
                  </h1>
                  <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${tableConf.badge}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${tableConf.dot}`} />
                    {tableConf.label}
                  </span>
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 flex flex-wrap items-center gap-2">
                  <span>Section {selectedTable.section}</span>
                  <span>&bull;</span>
                  <span>👥 {selectedTable.capacity} guests</span>
                  {activeOrder && (
                    <>
                      <span>&bull;</span>
                      <span className="font-mono font-bold text-blue-600 dark:text-blue-400">{activeOrder.orderNumber}</span>
                    </>
                  )}
                  {activeOrder?.waiterName && (
                    <>
                      <span>&bull;</span>
                      <span>Waiter: {activeOrder.waiterName}</span>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Quick Table Switcher & Fullscreen Mode */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold text-slate-400 hidden sm:inline">Switch Table:</span>
            <select
              value={selectedTable.id}
              onChange={(e) => {
                const t = tables.find((item) => item.id === e.target.value)
                if (t) handleSelectTable(t)
              }}
              className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-bold text-slate-800 dark:text-white focus:outline-none cursor-pointer shadow-sm"
            >
              {tables.map((t) => (
                <option key={t.id} value={t.id}>
                  Table {t.tableNumber} ({STATUS_CONFIG[t.status]?.label || t.status})
                </option>
              ))}
            </select>

            {/* Free Table Action if order is active */}
            {activeOrder && (
              <button
                type="button"
                onClick={() => handleCancelAndFreeTable()}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-900/50 text-xs font-black transition cursor-pointer shadow-sm"
                title={`Cancel order and make Table ${selectedTable.tableNumber} available`}
              >
                <span>🧹</span>
                <span>Free Table</span>
              </button>
            )}

            {/* Focus / Fullscreen Mode Toggle */}
            <button
              type="button"
              onClick={() => setIsFocusMode(!isFocusMode)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold transition cursor-pointer shadow-sm ${
                isFocusMode
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100'
              }`}
              title={isFocusMode ? 'Exit Full Screen Mode' : 'Toggle Full Screen POS Mode'}
            >
              <span>{isFocusMode ? '🗗' : '⛶'}</span>
              <span className="hidden sm:inline">{isFocusMode ? 'Exit Fullscreen' : 'Fullscreen POS'}</span>
            </button>
          </div>
        </div>

        {/* Global Action Message Banner */}
        {actionMessage && (
          <div
            className={`p-3.5 rounded-2xl text-xs font-bold flex items-center justify-between shadow-sm animate-in fade-in duration-200 shrink-0 ${
              actionMessage.kind === 'ok'
                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800'
                : 'bg-red-50 text-red-800 border border-red-200 dark:bg-red-950/60 dark:text-red-300 dark:border-red-800'
            }`}
          >
            <div className="flex items-center gap-2">
              <span>{actionMessage.kind === 'ok' ? '✅' : '⚠️'}</span>
              <span>{actionMessage.text}</span>
            </div>
            <button
              type="button"
              onClick={() => setActionMessage(null)}
              className="text-xs opacity-70 hover:opacity-100 cursor-pointer px-2 py-1"
            >
              ✕
            </button>
          </div>
        )}

        {/* 2-Column POS Layout (Matching Heights, Clean & Spacious) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start flex-1 min-h-0">
          
          {/* ============================================================= */}
          {/* LEFT COLUMN (7 COLS): Menu Catalog with internal scroll       */}
          {/* ============================================================= */}
          <div className="lg:col-span-7 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-4 sm:p-5 space-y-3.5 shadow-sm h-[calc(100vh-9.5rem)] min-h-[580px] flex flex-col">
            
            {/* Search Bar & Category Filter & Add Dish Button */}
            <div className="flex items-center gap-2 shrink-0">
              {/* Category Dropdown Selector */}
              <div className="relative shrink-0 w-36 sm:w-44">
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className={`w-full h-9 pl-2.5 pr-7 rounded-xl border text-xs font-bold transition cursor-pointer appearance-none truncate ${
                    selectedCategory !== 'All'
                      ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                      : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700'
                  }`}
                  title="Filter dishes by category"
                >
                  <option value="All">📂 All Categories ({menuItems.length})</option>
                  {menuCategories
                    .filter((c) => c !== 'All')
                    .map((cat) => {
                      const count = menuItems.filter((i) => i.category === cat).length
                      return (
                        <option
                          key={cat}
                          value={cat}
                          className="text-slate-900 dark:text-slate-100 bg-white dark:bg-slate-900 font-medium"
                        >
                          {cat} ({count})
                        </option>
                      )
                    })}
                </select>
                <div
                  className={`pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] ${
                    selectedCategory !== 'All' ? 'text-white' : 'text-slate-400'
                  }`}
                >
                  ▼
                </div>
              </div>

              {/* Search Bar */}
              <div className="relative flex-1">
                <svg className="h-4 w-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  type="text"
                  placeholder="Search food menu (e.g. Afghani Boti, Karahi, Tea, Golgappay)..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-9 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 text-xs text-slate-800 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 transition"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    ✕
                  </button>
                )}
              </div>

              {/* Add New Dish / Category Button */}
              {(user?.role === 'admin' || user?.role === 'cashier') && (
                <button
                  type="button"
                  onClick={handleOpenAddDish}
                  className="px-3.5 py-2 rounded-xl bg-slate-900 text-white dark:bg-white dark:text-slate-900 text-xs font-black shadow-sm flex items-center gap-1.5 hover:opacity-90 cursor-pointer shrink-0 transition"
                  title="Add new dish with custom price and category"
                >
                  <span>+</span>
                  <span className="hidden sm:inline">Add Dish</span>
                </button>
              )}
            </div>

            {/* Active Category Filter Tag (if filtered) */}
            {selectedCategory !== 'All' && (
              <div className="flex items-center justify-between px-3 py-1.5 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800/60 rounded-xl text-xs shrink-0">
                <span className="font-bold text-blue-700 dark:text-blue-300 flex items-center gap-1.5">
                  <span>📂 Filtered by:</span>
                  <span className="bg-blue-600 text-white px-2 py-0.5 rounded-md font-black">{selectedCategory}</span>
                  <span className="text-slate-500 dark:text-slate-400 text-[11px]">({filteredMenu.length} dishes)</span>
                </span>
                <button
                  type="button"
                  onClick={() => setSelectedCategory('All')}
                  className="font-bold text-blue-600 hover:text-blue-800 dark:text-blue-400 cursor-pointer flex items-center gap-1 hover:underline"
                >
                  ✕ Show All Categories
                </button>
              </div>
            )}

            {/* Menu Items Tiles Grid (Internally scrollable, no whole-page scroll) */}
            <div className="flex-1 overflow-y-auto pr-1 scrollbar-hide min-h-0">
              {filteredMenu.length === 0 ? (
                <div className="py-16 text-center text-slate-400">
                  <span className="text-3xl">🔍</span>
                  <p className="text-xs font-bold mt-2">No menu items found</p>
                  <p className="text-[11px] text-slate-400">Try changing your search query or add a new dish</p>
                  {(user?.role === 'admin' || user?.role === 'cashier') && (
                    <button
                      type="button"
                      onClick={handleOpenAddDish}
                      className="mt-3 px-3.5 py-1.5 rounded-xl bg-blue-600 text-white text-xs font-bold shadow-sm inline-flex items-center gap-1.5 hover:bg-blue-700"
                    >
                      <span>+</span>
                      <span>Add Dish Now</span>
                    </button>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {filteredMenu.map((item) => {
                    const inTicket = inTicketCounts.get(item.id) || 0

                    return (
                      <div
                        key={item.id}
                        onClick={() => handleAddItem(item)}
                        className={`p-3 rounded-2xl border transition-all duration-150 shadow-sm hover:shadow-md cursor-pointer flex flex-col justify-between group active:scale-[0.98] ${
                          inTicket > 0
                            ? 'border-blue-400 bg-blue-50/40 dark:bg-blue-950/30 dark:border-blue-700 ring-1 ring-blue-500/20'
                            : 'border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-800/50 hover:bg-blue-50/40 dark:hover:bg-blue-950/30 hover:border-blue-300 dark:hover:border-blue-600'
                        }`}
                      >
                        <div>
                          <div className="flex items-center justify-between gap-1 mb-2">
                            <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-md truncate max-w-[120px]">
                              {item.category}
                            </span>
                            <div className="flex items-center gap-1">
                              {inTicket > 0 ? (
                                <span className="text-[10px] font-black uppercase bg-blue-600 text-white px-2 py-0.5 rounded-full shadow-sm">
                                  {inTicket} in ticket
                                </span>
                              ) : null}

                              {/* Edit Price & Category Button */}
                              {(user?.role === 'admin' || user?.role === 'cashier') && (
                                <button
                                  type="button"
                                  onClick={(e) => handleOpenEditDish(item, e)}
                                  className="h-6 w-6 rounded-md text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center justify-center transition cursor-pointer text-xs"
                                  title="Edit Dish Price or Category"
                                >
                                  ✎
                                </button>
                              )}
                            </div>
                          </div>
                          <div className="font-black text-xs sm:text-sm text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition line-clamp-2">
                            {item.name}
                          </div>
                        </div>

                        <div className="mt-2.5 pt-2 border-t border-slate-100 dark:border-slate-700/60 flex items-center justify-between">
                          <span className="text-xs font-black text-slate-900 dark:text-white">
                            {formatMoney(item.price)}
                          </span>
                          <span className="h-6 w-6 rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-300 flex items-center justify-center text-xs font-black group-hover:bg-blue-600 group-hover:text-white transition shadow-sm">
                            +
                          </span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          {/* ============================================================= */}
          {/* RIGHT COLUMN (5 COLS): Organized Fixed-Height Order Ticket    */}
          {/* ============================================================= */}
          <div className="lg:col-span-5 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm h-[calc(100vh-9.5rem)] min-h-[580px] flex flex-col justify-between overflow-hidden">
            
            {/* Zone 1: Ticket Header & Segmented Tabs */}
            <div className="p-4 border-b border-slate-200/80 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-850 shrink-0 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-white flex items-center gap-1.5">
                    <span>🧾</span> Table {selectedTable.tableNumber} Order
                  </span>
                  <span className="rounded-full bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 px-2 py-0.5 text-[11px] font-bold">
                    {totalQty} items
                  </span>
                  {activeOrder && (
                    <span className="text-[10.5px] font-black text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/60 px-2 py-0.5 rounded-md border border-blue-200 dark:border-blue-900/40">
                      ✏️ Edit Mode Live
                    </span>
                  )}
                </div>
                {draftItems.length > 0 && !activeOrder ? (
                  <button
                    type="button"
                    onClick={() => setDraftItems([])}
                    className="text-xs font-bold text-red-500 hover:text-red-700 cursor-pointer"
                  >
                    Clear All
                  </button>
                ) : activeOrder ? (
                  <button
                    type="button"
                    onClick={() => handleCancelAndFreeTable()}
                    className="text-xs font-bold text-red-500 hover:text-red-700 hover:underline cursor-pointer flex items-center gap-1"
                    title="Cancel order and make table available"
                  >
                    <span>🧹 Free Table</span>
                  </button>
                ) : null}
              </div>

              {/* Waiter Name Input Field */}
              <div className="flex items-center gap-2 pt-2 border-t border-slate-200/60 dark:border-slate-800">
                <span className="text-sm">🤵</span>
                <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400 shrink-0">
                  Waiter Name:
                </label>
                <input
                  type="text"
                  value={waiterName}
                  onChange={(e) => setWaiterName(e.target.value)}
                  placeholder="Enter waiter name (e.g. Ali, Hamza)..."
                  className="flex-1 px-2.5 py-1 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500 font-medium shadow-2xs"
                />
              </div>
            </div>

            {/* Zone 2: Middle Scrollable Content (Items List) */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2.5 min-h-0 scrollbar-hide">
              {draftItems.length === 0 ? (
                activeOrder ? (
                  <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-3.5 animate-in fade-in">
                    <span className="text-4xl">🧹</span>
                    <div>
                      <p className="text-sm font-black text-slate-800 dark:text-slate-100">
                        All Items Removed from Table {selectedTable.tableNumber}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-xs">
                        Is order k saray items remove ho chukay hain. Table ko free aur available karne k lye neechay click karein:
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={processingAction}
                      onClick={() => handleCancelAndFreeTable()}
                      className="px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-black shadow-lg shadow-red-600/25 transition cursor-pointer flex items-center gap-2"
                    >
                      <span>🧹</span>
                      <span>Save &amp; Make Table Available</span>
                    </button>
                  </div>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-center p-8 text-slate-400">
                    <span className="text-4xl mb-2">🍽️</span>
                    <p className="text-xs font-bold text-slate-600 dark:text-slate-300">Ticket is empty</p>
                    <p className="text-[11px] text-slate-400 mt-1">Tap items from the left menu to add to this order</p>
                  </div>
                )
              ) : (
                    draftItems.map((item, idx) => (
                      <div
                        key={idx}
                        className="rounded-xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 p-2.5 space-y-1.5 hover:border-slate-300 transition"
                      >
                        {/* Line 1: Item Name, Price & Steppers */}
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <span className="font-bold text-xs text-slate-900 dark:text-white truncate">
                                {item.name}
                              </span>
                              {item.round && item.round > 1 && (
                                <span className="text-[9px] font-black uppercase bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300 px-1.5 py-0.2 rounded">
                                  R{item.round}
                                </span>
                              )}
                            </div>
                            <span className="text-[11px] text-slate-400 font-mono">
                              {formatMoney(item.price)} each
                            </span>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <span className="font-black text-xs text-slate-900 dark:text-white">
                              {formatMoney(item.price * item.quantity)}
                            </span>

                            <div className="flex items-center gap-1 bg-white dark:bg-slate-700/80 rounded-lg p-0.5 border border-slate-200 dark:border-slate-600 shadow-2xs">
                              <button
                                type="button"
                                onClick={() => handleUpdateQty(idx, -1)}
                                className="h-6 w-6 rounded-md hover:bg-slate-100 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 font-bold flex items-center justify-center text-xs cursor-pointer"
                              >
                                -
                              </button>
                              <span className="w-5 text-center text-xs font-black text-slate-900 dark:text-white">
                                {item.quantity}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleUpdateQty(idx, 1)}
                                className="h-6 w-6 rounded-md hover:bg-slate-100 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 font-bold flex items-center justify-center text-xs cursor-pointer"
                              >
                                +
                              </button>
                            </div>

                            <button
                              type="button"
                              onClick={() => handleRemoveItem(idx)}
                              className="text-slate-300 hover:text-red-500 text-sm cursor-pointer p-0.5 transition"
                              title="Remove item"
                            >
                              ✕
                            </button>
                          </div>
                        </div>

                        {/* Line 2: Note Pill / Input & Dedicated Print Slip Button */}
                        <div className="flex items-center justify-between gap-2 pt-1.5 border-t border-slate-100 dark:border-slate-800/60">
                          {editingNoteIndex === idx ? (
                            <div className="flex items-center gap-1.5 flex-1">
                              <input
                                type="text"
                                autoFocus
                                placeholder="Kitchen note (e.g. Less spicy, well done)..."
                                value={item.notes || ''}
                                onChange={(e) => handleUpdateItemNotes(idx, e.target.value)}
                                onBlur={() => setEditingNoteIndex(null)}
                                onKeyDown={(e) => e.key === 'Enter' && setEditingNoteIndex(null)}
                                className="w-full px-2 py-1 rounded-lg border border-blue-400 bg-white dark:bg-slate-800 text-[11px] text-slate-800 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none"
                              />
                              <button
                                type="button"
                                onClick={() => setEditingNoteIndex(null)}
                                className="text-[10px] font-bold text-blue-600 px-2 py-1 bg-blue-50 rounded-lg cursor-pointer shrink-0"
                              >
                                Done
                              </button>
                            </div>
                          ) : item.notes ? (
                            <div className="flex items-center gap-1 text-[11px] text-amber-700 dark:text-amber-300 bg-amber-50/60 dark:bg-amber-950/30 px-2 py-0.5 rounded-md border border-amber-200/60 dark:border-amber-900/40 min-w-0">
                              <span className="truncate">📝 {item.notes}</span>
                              <button
                                type="button"
                                onClick={() => setEditingNoteIndex(idx)}
                                className="text-[10px] underline ml-1 cursor-pointer shrink-0"
                              >
                                Edit
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setEditingNoteIndex(idx)}
                              className="text-[11px] text-slate-400 hover:text-blue-600 transition cursor-pointer inline-flex items-center gap-1"
                            >
                              <span>+ Add note for chef</span>
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => {
                              const baseOrder = activeOrder || {
                                id: 'draft',
                                orderNumber: `TBL-${selectedTable?.tableNumber || 'ORDER'}`,
                                tableId: selectedTable?.id || '',
                                tableName: selectedTable?.tableNumber || '',
                                section: (selectedTable?.section || 'A') as 'A' | 'B' | 'C',
                                waiterName: waiterName || 'Staff',
                                cashierName: user?.name || 'Cashier',
                                status: 'open',
                                items: draftItems,
                                subtotal: draftSubtotal,
                                discount: discountVal,
                                discountType: discountType,
                                tax: 0,
                                total: draftGrandTotal,
                                notes: orderNotes,
                                createdAt: new Date().toISOString(),
                                updatedAt: new Date().toISOString(),
                              }
                              const orderToUse: RestaurantOrder = {
                                ...baseOrder,
                                waiterName: waiterName || baseOrder.waiterName || 'Staff',
                              }
                              printCustomerReceipt(orderToUse, {
                                splitNumber: idx + 1,
                                label: item.name,
                                items: [{ name: item.name, price: item.price, quantity: item.quantity }],
                                subtotal: item.price * item.quantity,
                                discount: 0,
                                total: item.price * item.quantity,
                                status: 'unpaid',
                                paymentMethod: 'cash',
                              })
                            }}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-[10.5px] font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 hover:text-blue-600 dark:hover:bg-slate-700 transition cursor-pointer shadow-2xs shrink-0"
                            title={`Print receipt slip for ${item.name}`}
                          >
                            <span>🖨️</span>
                            <span>Print Receipt</span>
                          </button>
                        </div>
                      </div>
                    ))
                  )}
            </div>

            {/* Zone 3: Fixed Bottom Controls (Always in view, no whole-page scroll!) */}
            <div className="p-4 border-t border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 shrink-0 space-y-3">
              
              {/* Optional Table Note & Discount Toggle */}
              <div>
                <div className="flex items-center justify-between text-[11px] font-bold text-slate-500">
                  <button
                    type="button"
                    onClick={() => setShowNoteDiscountBar(!showNoteDiscountBar)}
                    className="text-blue-600 dark:text-blue-400 hover:underline cursor-pointer flex items-center gap-1"
                  >
                    <span>{showNoteDiscountBar ? '▲ Hide' : '▼ Add'} Discount &amp; Table Note</span>
                    {(discountVal > 0 || orderNotes) && (
                      <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
                    )}
                  </button>
                  {calculatedDiscount > 0 && (
                    <span className="text-emerald-600 dark:text-emerald-400">
                      Discount: -{formatMoney(calculatedDiscount)}
                    </span>
                  )}
                </div>

                {showNoteDiscountBar && (
                  <div className="grid grid-cols-2 gap-2 mt-2 pt-2 border-t border-slate-100 dark:border-slate-800 animate-in fade-in duration-150">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 mb-0.5">Discount</label>
                      <div className="flex rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden bg-slate-50 dark:bg-slate-800">
                        <input
                          type="number"
                          min="0"
                          value={discountVal || ''}
                          onChange={(e) => setDiscountVal(Number(e.target.value) || 0)}
                          placeholder="0"
                          className="w-full px-2 py-1 text-xs text-slate-800 dark:text-white focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => setDiscountType(discountType === 'fixed' ? 'percent' : 'fixed')}
                          className="px-2 bg-slate-200 dark:bg-slate-700 text-[10px] font-bold text-slate-700 dark:text-slate-300"
                        >
                          {discountType === 'fixed' ? 'Rs' : '%'}
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 mb-0.5">Table Note</label>
                      <input
                        type="text"
                        placeholder="e.g. VIP, Birthday..."
                        value={orderNotes}
                        onChange={(e) => setOrderNotes(e.target.value)}
                        className="w-full px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs focus:outline-none"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Grand Total Bar */}
              <div className="flex items-center justify-between pt-1 border-t border-slate-100 dark:border-slate-800">
                <div>
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Grand Total</span>
                  {calculatedDiscount > 0 && (
                    <span className="text-[10px] text-slate-400 line-through mr-1">
                      {formatMoney(draftSubtotal)}
                    </span>
                  )}
                </div>
                <span className="text-xl font-black text-blue-600 dark:text-blue-400">
                  {formatMoney(draftGrandTotal)}
                </span>
              </div>

              {/* If all items were removed from an active order: Free Table Action */}
              {activeOrder && draftItems.length === 0 && (
                <button
                  type="button"
                  disabled={processingAction}
                  onClick={() => handleCancelAndFreeTable()}
                  className="w-full rounded-xl bg-red-600 hover:bg-red-700 text-white font-black py-3 px-4 text-xs shadow-md shadow-red-600/20 transition cursor-pointer flex items-center justify-center gap-2"
                >
                  {processingAction ? (
                    <>
                      <span className="animate-spin text-sm">⏳</span>
                      <span>Clearing Table...</span>
                    </>
                  ) : (
                    <>
                      <span>🧹</span>
                      <span>All Items Removed • Save &amp; Make Table Available</span>
                    </>
                  )}
                </button>
              )}

              {/* Primary Action: Settle Payment & Quick Print Receipt */}
              {draftItems.length > 0 && (user?.role === 'admin' || user?.role === 'cashier') && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={processingAction || draftItems.length === 0}
                    onClick={() => handlePrintSlipAction('receipt')}
                    className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold py-2.5 px-3 text-xs transition cursor-pointer flex items-center justify-center gap-1.5 shrink-0 shadow-2xs"
                    title="Print Table Receipt before settlement"
                  >
                    <span>🧾</span>
                    <span>Print Receipt</span>
                  </button>
                  <button
                    type="button"
                    disabled={processingAction}
                    onClick={handleOpenPaymentModal}
                    className="flex-1 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black py-2.5 px-4 text-xs shadow-md shadow-emerald-600/20 transition cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {processingAction ? (
                      <>
                        <span className="animate-spin text-sm">⏳</span>
                        <span>Processing...</span>
                      </>
                    ) : (
                      <>
                        <span>💰</span>
                        <span>Receive Payment</span>
                      </>
                    )}
                  </button>
                </div>
              )}

              {/* Slips Toolbar: Dedicated Print Slips for Waiter, Cashier, and Customer */}
              <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-1.5">
                <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-wider text-slate-400">
                  <span>Print Slips</span>
                  {activeOrder && activeOrder.status !== 'billing' && activeOrder.status !== 'paid' && (
                    <button
                      type="button"
                      disabled={processingAction}
                      onClick={handleRequestBill}
                      className="text-blue-600 dark:text-blue-400 hover:underline cursor-pointer lowercase first-letter:uppercase font-bold"
                      title="Mark table status as billing requested"
                    >
                      🧾 mark bill req
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-3 gap-2">
                  {/* 1. Waiter Slip */}
                  <button
                    type="button"
                    disabled={processingAction || draftItems.length === 0}
                    onClick={() => handlePrintSlipAction('waiter')}
                    className="rounded-xl border border-purple-200 dark:border-purple-800/80 bg-purple-50/80 dark:bg-purple-950/40 py-2.5 px-1 text-xs font-black text-purple-700 dark:text-purple-300 hover:bg-purple-100 dark:hover:bg-purple-900/50 transition cursor-pointer disabled:opacity-30 text-center flex flex-col items-center justify-center gap-0.5 shadow-2xs"
                    title="Print Waiter / Server Captain Slip for delivering dishes"
                  >
                    <span className="text-base">🤵</span>
                    <span>Waiter</span>
                  </button>

                  {/* 2. Cashier Slip */}
                  <button
                    type="button"
                    disabled={processingAction || draftItems.length === 0}
                    onClick={() => handlePrintSlipAction('cashier')}
                    className="rounded-xl border border-emerald-200 dark:border-emerald-800/80 bg-emerald-50/80 dark:bg-emerald-950/40 py-2.5 px-1 text-xs font-black text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 transition cursor-pointer disabled:opacity-30 text-center flex flex-col items-center justify-center gap-0.5 shadow-2xs"
                    title="Print Cashier Audit Bill Slip"
                  >
                    <span className="text-base">💵</span>
                    <span>Cashier</span>
                  </button>

                  {/* 3. Customer Receipt */}
                  <button
                    type="button"
                    disabled={processingAction || draftItems.length === 0}
                    onClick={() => handlePrintSlipAction('receipt')}
                    className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 py-2.5 px-1 text-xs font-black text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition cursor-pointer disabled:opacity-30 text-center flex flex-col items-center justify-center gap-0.5 shadow-2xs"
                    title="Print Customer Dining Receipt with Barcode"
                  >
                    <span className="text-base">🧾</span>
                    <span>Receipt</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Payment / Settlement Modal */}
        {paymentModalOpen && activeOrder && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-150">
            <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl p-6 space-y-5">
              <div className="text-center space-y-1.5">
                <span className="text-3xl">💵</span>
                <h3 className="text-lg font-black text-slate-900 dark:text-white">
                  Receive Payment: Table {selectedTable?.tableNumber}
                </h3>

                {/* Waiter Name Badge */}
                <div className="flex items-center justify-center">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-900/50 text-xs font-bold shadow-2xs">
                    <span>🤵</span>
                    <span className="text-slate-500 dark:text-slate-400">Waiter:</span>
                    <span className="font-black text-blue-800 dark:text-blue-200 font-mono">
                      {waiterName || activeOrder.waiterName || 'Staff'}
                    </span>
                  </span>
                </div>

                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {draftItems.map((it) => `${it.quantity}x ${it.name}`).join(', ')}
                </p>
                <p className="text-2xl font-black text-emerald-600 dark:text-emerald-400">
                  {formatMoney(activeOrder.total)}
                </p>
              </div>

              <div className="space-y-2">
                <label className="block text-xs font-bold uppercase text-slate-500">
                  Select Payment Method
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(
                    [
                      { id: 'cash', label: 'CASH', icon: '💵' },
                      { id: 'online', label: 'ONLINE', icon: '🌐' },
                      { id: 'credit', label: 'CREDIT', icon: '📋' },
                    ] as const
                  ).map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setPaymentMethod(m.id)}
                      className={`p-3 rounded-xl border text-xs font-bold uppercase transition flex flex-col items-center gap-1 cursor-pointer ${
                        paymentMethod === m.id
                          ? 'border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 ring-2 ring-emerald-500/20'
                          : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
                      }`}
                    >
                      <span>{m.icon}</span>
                      <span>{m.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setPaymentModalOpen(false)}
                  className="rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-2 text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={processingAction}
                  onClick={handleConfirmPayment}
                  className="rounded-xl bg-emerald-600 px-5 py-2 text-xs font-bold text-white hover:bg-emerald-700 shadow-md shadow-emerald-600/20 disabled:opacity-50 cursor-pointer"
                >
                  {processingAction ? 'Processing...' : 'Confirm & Settle Bill'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Dish Customization Modal (Add / Edit Dish Price & Category) */}
        {dishModalOpen && (
          <DishModal
            isOpen={dishModalOpen}
            onClose={() => {
              setDishModalOpen(false)
              setEditingDish(null)
            }}
            editingItem={editingDish}
            existingCategories={menuCategories}
            onSaved={handleDishSaved}
            onDeleted={handleDishDeleted}
          />
        )}
      </div>
    )
  }

  // =========================================================================
  // VIEW 1: FLOOR PLAN TABLES VIEW (Spacious & Compact Realistic Cards)
  // =========================================================================
  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 animate-in fade-in duration-200">
      {/* Top Banner / Stats Overview */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white flex items-center gap-2.5">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-600/25 text-lg">
              🍽️
            </span>
            Restaurant POS &amp; Table Orders
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Real-time table orders, multi-round kitchen additions, split bills, and dining receipts
          </p>
        </div>

        {/* Quick Summary Badges & Actions */}
        <div className="flex flex-wrap items-center gap-2">
          {(user?.role === 'admin' || user?.role === 'cashier') && (
            <Link
              href="/admin/restaurant-sales"
              className="px-3.5 py-1.5 rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50/80 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 text-xs font-black shadow-sm flex items-center gap-1.5 hover:bg-blue-100 dark:hover:bg-blue-900/50 transition cursor-pointer"
              title="View Restaurant Sales, Section Breakdown & Table-wise Report"
            >
              <span>📊</span>
              <span>Sales Report &rarr;</span>
            </Link>
          )}

          {(user?.role === 'admin' || user?.role === 'cashier') && (
            <button
              type="button"
              onClick={handleOpenAddDish}
              className="px-3.5 py-1.5 rounded-xl bg-slate-900 text-white dark:bg-white dark:text-slate-900 text-xs font-black shadow-sm flex items-center gap-1.5 hover:opacity-90 cursor-pointer transition"
              title="Add a new dish with custom price and category"
            >
              <span>+</span>
              <span>Add Dish</span>
            </button>
          )}

          <div className="flex items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-1.5 shadow-sm text-xs font-bold">
            <span className="h-2.5 w-2.5 rounded-full bg-slate-400" />
            <span className="text-slate-600 dark:text-slate-400">Total:</span>
            <span className="text-slate-900 dark:text-white font-black">{stats.total} Tables</span>
          </div>
          <div className="flex items-center gap-2 rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/40 px-3 py-1.5 shadow-sm text-xs font-bold text-emerald-700 dark:text-emerald-300">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse" />
            <span>Available: {stats.available}</span>
          </div>
          <div className="flex items-center gap-2 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/40 px-3 py-1.5 shadow-sm text-xs font-bold text-amber-700 dark:text-amber-300">
            <span className="h-2.5 w-2.5 rounded-full bg-amber-500" />
            <span>Occupied: {stats.occupied}</span>
          </div>
          <div className="flex items-center gap-2 rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/40 px-3 py-1.5 shadow-sm text-xs font-bold text-blue-700 dark:text-blue-300">
            <span className="h-2.5 w-2.5 rounded-full bg-blue-500" />
            <span>Billing: {stats.billing}</span>
          </div>
          {stats.cleaning > 0 && (
            <div className="flex items-center gap-2 rounded-xl border border-purple-200 dark:border-purple-800 bg-purple-50/50 dark:bg-purple-950/40 px-3 py-1.5 shadow-sm text-xs font-bold text-purple-700 dark:text-purple-300">
              <span className="h-2.5 w-2.5 rounded-full bg-purple-500" />
              <span>Cleaning: {stats.cleaning}</span>
            </div>
          )}
        </div>
      </div>

      {/* Navigation, Quick Search & Status Filter Bar */}
      <div className="space-y-3 bg-white dark:bg-slate-900 p-3.5 sm:p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm">
        {/* Row 1: Section Selector Tabs & Search */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {/* Section Selector Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-hide">
            {(['ALL', 'A', 'B', 'C'] as const).map((sec) => (
              <button
                key={sec}
                type="button"
                onClick={() => setActiveSection(sec)}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer whitespace-nowrap ${
                  activeSection === sec
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-500/25 font-black'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                {sec === 'ALL' ? `All Tables (${tables.length})` : `Section ${sec} (${tables.filter(t => t.section === sec).length})`}
              </button>
            ))}
          </div>

          {/* Quick Search Input for Table Number */}
          <div className="relative w-full sm:w-64 shrink-0">
            <svg className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Search table (e.g. A3, B12)..."
              value={tableSearch}
              onChange={(e) => setTableSearch(e.target.value)}
              className="w-full pl-9 pr-7 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 text-xs text-slate-800 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 transition"
            />
            {tableSearch && (
              <button
                type="button"
                onClick={() => setTableSearch('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* Row 2: Status Filter Pills */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2.5 border-t border-slate-100 dark:border-slate-800/80">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-bold text-slate-400 mr-1 uppercase">Filter:</span>
            {(['ALL', 'available', 'occupied', 'billing', 'cleaning'] as const).map((st) => {
              const count = st === 'ALL' ? tables.length : stats[st] || 0
              return (
                <button
                  key={st}
                  type="button"
                  onClick={() => setStatusFilter(st)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
                    statusFilter === st
                      ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-sm font-black'
                      : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200/60 dark:border-slate-700/60'
                  }`}
                >
                  {st !== 'ALL' && (
                    <span className={`h-1.5 w-1.5 rounded-full ${STATUS_CONFIG[st].dot.replace('animate-pulse', '')}`} />
                  )}
                  <span>{st === 'ALL' ? 'All' : STATUS_CONFIG[st].label}</span>
                  <span className="text-[10px] opacity-70">({count})</span>
                </button>
              )
            })}
          </div>

          <div className="text-[11px] font-bold text-slate-400 hidden sm:block">
            Showing {filteredTables.length} of {tables.length} tables
          </div>
        </div>
      </div>

      {/* Tables Floor Plan Grid (Spacious 3-4 Columns, Not Cramped) */}
      {loadingTables ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="h-44 rounded-2xl bg-slate-200 dark:bg-slate-800 animate-pulse" />
          ))}
        </div>
      ) : filteredTables.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-12 text-center text-slate-400">
          <span className="text-4xl">🔍</span>
          <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200 mt-2">No tables found</h3>
          <p className="text-xs text-slate-400 mt-1">Try resetting your section, status, or search filter</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
          {filteredTables.map((table) => {
            const conf = STATUS_CONFIG[table.status] || STATUS_CONFIG.available

            return (
              <div
                key={table.id}
                onClick={() => handleSelectTable(table)}
                className={`group relative rounded-2xl p-4 border transition-all duration-200 cursor-pointer text-left flex flex-col justify-between hover:-translate-y-1 hover:shadow-xl ${conf.bg} ${conf.border} shadow-sm`}
              >
                {/* Top Row: Table Badge, Details, and Status */}
                <div className="flex items-center justify-between gap-2.5">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900 text-white dark:bg-white dark:text-slate-900 text-base font-black shadow-sm shrink-0 group-hover:scale-105 transition-transform">
                      {table.tableNumber}
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-black text-slate-900 dark:text-white truncate">
                        Table {table.tableNumber}
                      </div>
                      <div className="text-[11px] text-slate-400 dark:text-slate-500 font-medium truncate">
                        Sec {table.section} • {table.capacity} guests
                      </div>
                    </div>
                  </div>

                  <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-black shrink-0 whitespace-nowrap shadow-2xs ${conf.badge}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${conf.dot}`} />
                    {conf.label}
                  </span>
                </div>

                {/* Middle Row: Realistic Dining / Bill Information */}
                <div className="my-4">
                  {table.status === 'occupied' || table.status === 'billing' ? (
                    <div className={`rounded-xl p-3 border flex items-center justify-between gap-3 ${conf.accentBg}`}>
                      <div>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                          {table.status === 'billing' ? 'Bill Requested' : 'Active Dining Bill'}
                        </span>
                        <div className="text-lg font-black text-slate-900 dark:text-white">
                          {formatMoney(table.activeOrderTotal || 0)}
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="text-xs font-bold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 px-2.5 py-1 rounded-lg border border-slate-200/80 dark:border-slate-700 shadow-2xs">
                          {table.activeItemsCount || 0} items
                        </span>
                      </div>
                    </div>
                  ) : table.status === 'cleaning' ? (
                    <div className="rounded-xl bg-purple-50/80 dark:bg-purple-950/40 p-3 border border-purple-200 dark:border-purple-900/50 flex items-center justify-between text-xs font-bold text-purple-700 dark:text-purple-300">
                      <div className="flex items-center gap-2">
                        <span className="text-base">🧹</span>
                        <span>Needs Sanitization &amp; Bussing</span>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-xl bg-slate-50 dark:bg-slate-800/50 p-3 border border-slate-100 dark:border-slate-800 flex items-center gap-2 text-xs font-bold text-slate-600 dark:text-slate-300">
                      <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                      <span>Ready for Guests • No active order</span>
                    </div>
                  )}
                </div>

                {/* Bottom Action Button */}
                <div className="pt-2">
                  {table.status === 'occupied' || table.status === 'billing' ? (
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleSelectTable(table)
                        }}
                        className={`flex-1 py-2.5 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-sm cursor-pointer ${conf.button}`}
                      >
                        <span>
                          {table.status === 'occupied'
                            ? '✏️ Edit Order →'
                            : 'Approve & Settle 💰'}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleCancelAndFreeTable(table)
                        }}
                        className="py-2.5 px-3 rounded-xl text-xs font-black bg-rose-50 hover:bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:hover:bg-rose-900/50 dark:text-rose-300 border border-rose-200 dark:border-rose-800/80 transition cursor-pointer shrink-0 flex items-center gap-1 shadow-2xs"
                        title={`Cancel unpaid order and free Table ${table.tableNumber}`}
                      >
                        <span>🧹</span>
                        <span>Free</span>
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        if (table.status === 'cleaning') {
                          handleMarkAvailable(table.id)
                        } else {
                          handleSelectTable(table)
                        }
                      }}
                      className={`w-full py-2.5 px-4 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-sm cursor-pointer ${conf.button}`}
                    >
                      <span>
                        {table.status === 'available'
                          ? '+ Take Order'
                          : '✨ Mark Clean & Make Ready'}
                      </span>
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Dish Customization Modal (View 1) */}
      {dishModalOpen && (
        <DishModal
          isOpen={dishModalOpen}
          onClose={() => {
            setDishModalOpen(false)
            setEditingDish(null)
          }}
          editingItem={editingDish}
          existingCategories={menuCategories}
          onSaved={handleDishSaved}
          onDeleted={handleDishDeleted}
        />
      )}
    </div>
  )
}


