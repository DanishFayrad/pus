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

  const fieldClass =
    'rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-2.5 text-sm font-medium focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-950 dark:focus:bg-slate-900'

  return (
    <div className="mx-auto max-w-7xl space-y-5 p-4 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">Products</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {products.length} product{products.length === 1 ? '' : 's'} in your catalogue.
          </p>
        </div>
        <button
          type="button"
          onClick={startNew}
          className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-blue-600/20 transition hover:from-blue-500 hover:to-indigo-500 hover:shadow-md cursor-pointer"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Add product
        </button>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col gap-2 rounded-2xl border border-slate-200/70 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:flex-row">
        <div className="relative flex-1">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </span>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, barcode or category…"
            className="w-full rounded-xl border border-slate-200 bg-slate-50/60 py-2.5 pl-10 pr-16 text-sm font-medium focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-950 dark:focus:bg-slate-900"
            autoComplete="off"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
            >
              Clear
            </button>
          )}
        </div>
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-2.5 text-sm font-medium focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-950 sm:w-52"
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
        <div className="space-y-4 rounded-2xl border border-slate-200/70 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">
            {editingId === 'new' ? 'New product' : 'Edit product'}
          </h3>
          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-6">
            <input
              placeholder="Barcode"
              value={form.barcode}
              onChange={(e) => setForm({ ...form, barcode: e.target.value })}
              className={`${fieldClass} font-mono`}
            />
            <input
              placeholder="Name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className={`${fieldClass} sm:col-span-1 md:col-span-2`}
            />
            <input
              placeholder="Category"
              list="product-categories"
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
              className={fieldClass}
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
              className={fieldClass}
            />
            <input
              placeholder="Cost"
              type="number"
              step="0.01"
              value={form.cost}
              onChange={(e) => setForm({ ...form, cost: e.target.value })}
              className={fieldClass}
            />
            <input
              placeholder="Stock"
              type="number"
              value={form.stock}
              onChange={(e) => setForm({ ...form, stock: e.target.value })}
              className={fieldClass}
            />
          </div>
          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-600 dark:border-red-900 dark:bg-red-950/40">
              {error}
            </div>
          )}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={cancel}
              className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-emerald-300 cursor-pointer"
            >
              {saving ? 'Saving…' : 'Save product'}
            </button>
          </div>
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-slate-200/70 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500 dark:bg-slate-950/40">
            <tr>
              <th className="hidden px-4 py-3 font-semibold sm:table-cell">Barcode</th>
              <th className="px-4 py-3 font-semibold">Name</th>
              <th className="hidden px-4 py-3 font-semibold lg:table-cell">Category</th>
              <th className="px-4 py-3 font-semibold text-right">Price</th>
              <th className="hidden px-4 py-3 font-semibold text-right md:table-cell">Cost</th>
              <th className="hidden px-4 py-3 font-semibold text-right md:table-cell">Margin</th>
              <th className="px-4 py-3 font-semibold text-right">Stock</th>
              <th className="px-4 py-3 font-semibold" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {visibleProducts.map((p) => {
              const margin = p.price - p.cost
              return (
                <tr
                  key={p.id}
                  className={`transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/40 ${deletingId === p.id ? 'opacity-50' : ''}`}
                >
                  <td className="hidden px-4 py-3 font-mono text-xs text-slate-500 sm:table-cell">{p.barcode}</td>
                  <td className="px-4 py-3">
                    <div className="font-semibold text-slate-800 dark:text-slate-100">{p.name}</div>
                    <div className="font-mono text-[10px] text-slate-400 sm:hidden">{p.barcode}</div>
                  </td>
                  <td className="hidden px-4 py-3 lg:table-cell">
                    <span className="inline-block rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                      {p.category || 'General'}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right font-semibold tabular-nums">{fmt(p.price)}</td>
                  <td className="hidden whitespace-nowrap px-4 py-3 text-right tabular-nums text-slate-500 md:table-cell">{fmt(p.cost)}</td>
                  <td
                    className={`hidden whitespace-nowrap px-4 py-3 text-right font-medium tabular-nums md:table-cell ${
                      margin >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
                    }`}
                  >
                    {fmt(margin)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span
                      className={`inline-flex min-w-9 items-center justify-center rounded-lg px-2 py-0.5 text-xs font-bold tabular-nums ${
                        p.stock === 0
                          ? 'bg-red-50 text-red-600 dark:bg-red-950/50 dark:text-red-400'
                          : p.stock <= 5
                            ? 'bg-amber-50 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400'
                            : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                      }`}
                    >
                      {p.stock}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => startEdit(p)}
                      className="mr-3 text-xs font-semibold text-blue-600 hover:underline dark:text-blue-400 cursor-pointer"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(p)}
                      disabled={deletingId === p.id}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-red-600 hover:underline disabled:opacity-50 dark:text-red-400 cursor-pointer"
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
