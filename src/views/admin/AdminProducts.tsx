import { useMemo, useState } from 'react'
import { useStore } from '../../context/StoreContext'
import { useConfirm } from '../../components/ConfirmProvider'
import Spinner from '../../components/Spinner'
import { formatMoney as fmt } from '../../lib/currency'
import type { Product } from '../../types'

interface FormState {
  barcode: string
  name: string
  price: string
  cost: string
  stock: string
  category: string
}

const emptyForm: FormState = { barcode: '', name: '', price: '', cost: '', stock: '', category: '' }

export default function AdminProducts() {
  const { products, addProduct, updateProduct, deleteProduct } = useStore()
  const confirm = useConfirm()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')

  const categories = useMemo(
    () => Array.from(new Set(products.map((p) => p.category || 'General'))).sort(),
    [products],
  )

  const visibleProducts = useMemo(() => {
    const q = search.trim().toLowerCase()
    return products.filter((p) => {
      if (categoryFilter && (p.category || 'General') !== categoryFilter) return false
      if (!q) return true
      return (
        p.name.toLowerCase().includes(q) ||
        p.barcode.toLowerCase().includes(q) ||
        (p.category || '').toLowerCase().includes(q)
      )
    })
  }, [products, search, categoryFilter])

  const startNew = () => {
    setEditingId('new')
    setForm(emptyForm)
    setError(null)
  }

  const startEdit = (p: Product) => {
    setEditingId(p.id)
    setForm({
      barcode: p.barcode,
      name: p.name,
      price: String(p.price),
      cost: String(p.cost),
      stock: String(p.stock),
      category: p.category || '',
    })
    setError(null)
  }

  const cancel = () => {
    setEditingId(null)
    setForm(emptyForm)
    setError(null)
  }

  const [saving, setSaving] = useState(false)

  const save = async () => {
    const price = parseFloat(form.price)
    const cost = parseFloat(form.cost)
    const stock = parseInt(form.stock, 10)
    if (!form.barcode.trim() || !form.name.trim()) {
      setError('Barcode and name are required')
      return
    }
    if (isNaN(price) || isNaN(cost) || isNaN(stock)) {
      setError('Price, cost and stock must be numbers')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const payload = {
        barcode: form.barcode.trim(),
        name: form.name.trim(),
        price,
        cost,
        stock,
        category: form.category.trim() || 'General',
      }
      if (editingId === 'new') {
        await addProduct(payload)
      } else if (editingId) {
        await updateProduct(editingId, payload)
      }
      cancel()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const [deletingId, setDeletingId] = useState<string | null>(null)

  const remove = async (p: Product) => {
    const ok = await confirm({
      title: 'Delete product',
      message: (
        <>
          Are you sure you want to delete <span className="font-semibold text-slate-900">{p.name}</span>?
          This action cannot be undone.
        </>
      ),
      confirmLabel: 'Delete',
      tone: 'danger',
    })
    if (!ok) return
    setDeletingId(p.id)
    try {
      await deleteProduct(p.id)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="max-w-7xl mx-auto p-3 sm:p-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl sm:text-2xl font-bold">Products</h1>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={startNew}
            className="px-3 py-2 text-xs sm:text-sm rounded-md bg-blue-600 hover:bg-blue-500 text-white font-medium"
          >
            + Add product
          </button>
        </div>
      </div>

      <div className="mx-auto flex w-full max-w-2xl flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search products by name, barcode or category…"
            className="w-full px-3 py-2 pr-20 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            autoComplete="off"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-slate-500 hover:text-slate-800 hover:underline"
            >
              Clear
            </button>
          )}
        </div>
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="px-3 py-2 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 sm:w-52"
        >
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      {editingId && (
        <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm p-4 space-y-3">
          <h2 className="font-semibold">
            {editingId === 'new' ? 'New product' : 'Edit product'}
          </h2>
          <div className="grid sm:grid-cols-2 md:grid-cols-6 gap-3">
            <input
              placeholder="Barcode"
              value={form.barcode}
              onChange={(e) => setForm({ ...form, barcode: e.target.value })}
              className="px-3 py-2 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono"
            />
            <input
              placeholder="Name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="px-3 py-2 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 sm:col-span-1 md:col-span-2"
            />
            <input
              placeholder="Category"
              list="product-categories"
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
              className="px-3 py-2 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
            />
            <datalist id="product-categories">
              {categories.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
            <input
              placeholder="Price"
              type="number"
              step="0.01"
              value={form.price}
              onChange={(e) => setForm({ ...form, price: e.target.value })}
              className="px-3 py-2 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
            />
            <input
              placeholder="Cost"
              type="number"
              step="0.01"
              value={form.cost}
              onChange={(e) => setForm({ ...form, cost: e.target.value })}
              className="px-3 py-2 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
            />
            <input
              placeholder="Stock"
              type="number"
              value={form.stock}
              onChange={(e) => setForm({ ...form, stock: e.target.value })}
              className="px-3 py-2 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
            />
          </div>
          {error && (
            <div className="text-sm text-red-600 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-md px-3 py-2">
              {error}
            </div>
          )}
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={cancel}
              className="px-3 py-2 text-sm rounded-md border border-slate-300 dark:border-slate-700"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="px-3 py-2 text-sm rounded-md bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-300 disabled:cursor-not-allowed text-white font-medium"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      )}

      <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-slate-500 bg-slate-50 dark:bg-slate-900">
            <tr>
              <th className="px-3 sm:px-4 py-2 font-medium hidden sm:table-cell">Barcode</th>
              <th className="px-3 sm:px-4 py-2 font-medium">Name</th>
              <th className="px-3 sm:px-4 py-2 font-medium hidden lg:table-cell">Category</th>
              <th className="px-3 sm:px-4 py-2 font-medium text-right">Price</th>
              <th className="px-3 sm:px-4 py-2 font-medium text-right hidden md:table-cell">Cost</th>
              <th className="px-3 sm:px-4 py-2 font-medium text-right hidden md:table-cell">Margin</th>
              <th className="px-3 sm:px-4 py-2 font-medium text-right">Stock</th>
              <th className="px-3 sm:px-4 py-2 font-medium" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
            {visibleProducts.map((p) => {
              const margin = p.price - p.cost
              return (
                <tr key={p.id} className={deletingId === p.id ? 'opacity-50 transition-opacity' : ''}>
                  <td className="px-3 sm:px-4 py-2 font-mono text-xs hidden sm:table-cell">{p.barcode}</td>
                  <td className="px-3 sm:px-4 py-2">
                    <div>{p.name}</div>
                    <div className="text-[10px] text-slate-500 font-mono sm:hidden">{p.barcode}</div>
                  </td>
                  <td className="px-3 sm:px-4 py-2 hidden lg:table-cell">
                    <span className="inline-block rounded-full bg-slate-100 dark:bg-slate-700 px-2 py-0.5 text-xs text-slate-600 dark:text-slate-300">
                      {p.category || 'General'}
                    </span>
                  </td>
                  <td className="px-3 sm:px-4 py-2 text-right whitespace-nowrap">{fmt(p.price)}</td>
                  <td className="px-3 sm:px-4 py-2 text-right whitespace-nowrap hidden md:table-cell">{fmt(p.cost)}</td>
                  <td
                    className={`px-3 sm:px-4 py-2 text-right whitespace-nowrap hidden md:table-cell ${
                      margin >= 0 ? 'text-emerald-600' : 'text-red-600'
                    }`}
                  >
                    {fmt(margin)}
                  </td>
                  <td
                    className={`px-3 sm:px-4 py-2 text-right font-medium ${
                      p.stock <= 5 ? 'text-amber-600' : ''
                    }`}
                  >
                    {p.stock}
                  </td>
                  <td className="px-3 sm:px-4 py-2 text-right whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => startEdit(p)}
                      className="text-blue-600 hover:underline mr-3"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(p)}
                      disabled={deletingId === p.id}
                      className="text-red-600 hover:underline disabled:opacity-50 inline-flex items-center gap-1"
                    >
                      {deletingId === p.id ? (
                        <>
                          <Spinner /> Deleting…
                        </>
                      ) : (
                        'Delete'
                      )}
                    </button>
                  </td>
                </tr>
              )
            })}
            {visibleProducts.length === 0 && (
              <tr>
                <td colSpan={8} className="p-6 text-center text-slate-500">
                  {search.trim() || categoryFilter
                    ? 'No products match the current filters'
                    : 'No products. Add one to get started.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  )
}
