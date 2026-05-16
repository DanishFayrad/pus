import { useState } from 'react'
import { useStore } from '../../context/StoreContext'
import type { Product } from '../../types'

interface FormState {
  barcode: string
  name: string
  price: string
  cost: string
  stock: string
}

const emptyForm: FormState = { barcode: '', name: '', price: '', cost: '', stock: '' }

function fmt(n: number) {
  return '$' + n.toFixed(2)
}

export default function AdminProducts() {
  const { products, addProduct, updateProduct, deleteProduct, resetMockData } = useStore()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [error, setError] = useState<string | null>(null)

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
      if (editingId === 'new') {
        await addProduct({
          barcode: form.barcode.trim(),
          name: form.name.trim(),
          price,
          cost,
          stock,
        })
      } else if (editingId) {
        await updateProduct(editingId, {
          barcode: form.barcode.trim(),
          name: form.name.trim(),
          price,
          cost,
          stock,
        })
      }
      cancel()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const remove = async (p: Product) => {
    if (!confirm(`Delete "${p.name}"?`)) return
    try {
      await deleteProduct(p.id)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed')
    }
  }

  return (
    <div className="max-w-7xl mx-auto p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Products</h1>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => {
              if (confirm('Reset all products and sales to demo data?')) resetMockData()
            }}
            className="px-3 py-2 text-sm rounded-md border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            Reset demo data
          </button>
          <button
            type="button"
            onClick={startNew}
            className="px-3 py-2 text-sm rounded-md bg-blue-600 hover:bg-blue-500 text-white font-medium"
          >
            + Add product
          </button>
        </div>
      </div>

      {editingId && (
        <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm p-4 space-y-3">
          <h2 className="font-semibold">
            {editingId === 'new' ? 'New product' : 'Edit product'}
          </h2>
          <div className="grid sm:grid-cols-2 md:grid-cols-5 gap-3">
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
        <table className="w-full text-sm">
          <thead className="text-left text-slate-500 bg-slate-50 dark:bg-slate-900">
            <tr>
              <th className="px-4 py-2 font-medium">Barcode</th>
              <th className="px-4 py-2 font-medium">Name</th>
              <th className="px-4 py-2 font-medium text-right">Price</th>
              <th className="px-4 py-2 font-medium text-right">Cost</th>
              <th className="px-4 py-2 font-medium text-right">Margin</th>
              <th className="px-4 py-2 font-medium text-right">Stock</th>
              <th className="px-4 py-2 font-medium" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
            {products.map((p) => {
              const margin = p.price - p.cost
              return (
                <tr key={p.id}>
                  <td className="px-4 py-2 font-mono text-xs">{p.barcode}</td>
                  <td className="px-4 py-2">{p.name}</td>
                  <td className="px-4 py-2 text-right">{fmt(p.price)}</td>
                  <td className="px-4 py-2 text-right">{fmt(p.cost)}</td>
                  <td
                    className={`px-4 py-2 text-right ${
                      margin >= 0 ? 'text-emerald-600' : 'text-red-600'
                    }`}
                  >
                    {fmt(margin)}
                  </td>
                  <td
                    className={`px-4 py-2 text-right font-medium ${
                      p.stock <= 5 ? 'text-amber-600' : ''
                    }`}
                  >
                    {p.stock}
                  </td>
                  <td className="px-4 py-2 text-right whitespace-nowrap">
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
                      className="text-red-600 hover:underline"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              )
            })}
            {products.length === 0 && (
              <tr>
                <td colSpan={7} className="p-6 text-center text-slate-500">
                  No products. Add one to get started.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
