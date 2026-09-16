'use client'
import { useState, useEffect } from 'react'
import type { MenuItem } from '../../types'
import { formatMoney } from '../../lib/currency'

interface Props {
  isOpen: boolean
  onClose: () => void
  editingItem: MenuItem | null
  existingCategories: string[]
  onSaved: (item: MenuItem, categories: string[]) => void
  onDeleted?: (itemId: string, categories: string[]) => void
}

export default function DishModal({
  isOpen,
  onClose,
  editingItem,
  existingCategories,
  onSaved,
  onDeleted,
}: Props) {
  const cleanCategories = existingCategories.filter((c) => c !== 'All')

  const [name, setName] = useState('')
  const [category, setCategory] = useState('')
  const [customCategory, setCustomCategory] = useState('')
  const [isCustomCategory, setIsCustomCategory] = useState(false)
  const [price, setPrice] = useState<string>('')
  const [emoji, setEmoji] = useState('🍽️')
  const [submitting, setSubmitting] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (editingItem) {
      setName(editingItem.name)
      setPrice(String(editingItem.price))
      setEmoji(editingItem.emoji || '🍽️')
      if (cleanCategories.includes(editingItem.category)) {
        setCategory(editingItem.category)
        setIsCustomCategory(false)
        setCustomCategory('')
      } else {
        setCategory('__custom__')
        setIsCustomCategory(true)
        setCustomCategory(editingItem.category)
      }
    } else {
      setName('')
      setPrice('')
      setEmoji('🍽️')
      const firstCat = cleanCategories[0] || 'Fast Food'
      setCategory(firstCat)
      setIsCustomCategory(false)
      setCustomCategory('')
    }
    setError(null)
  }, [editingItem, isOpen])

  if (!isOpen) return null

  const handleCategoryChange = (val: string) => {
    if (val === '__custom__') {
      setIsCustomCategory(true)
      setCategory('__custom__')
    } else {
      setIsCustomCategory(false)
      setCategory(val)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    const finalName = name.trim()
    const finalCat = (isCustomCategory ? customCategory.trim() : category.trim())
    const finalPrice = Number(price)

    if (!finalName) {
      setError('Please enter the food dish name')
      return
    }
    if (!finalCat) {
      setError('Please select or type a category')
      return
    }
    if (isNaN(finalPrice) || finalPrice < 0) {
      setError('Please enter a valid price (Rs 0 or more)')
      return
    }

    setSubmitting(true)
    try {
      if (editingItem) {
        // PATCH
        const res = await fetch(`/api/restaurant/menu/${editingItem.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: finalName,
            category: finalCat,
            price: finalPrice,
            emoji,
          }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Failed to update dish')
        onSaved(data.item, data.categories || [])
      } else {
        // POST
        const res = await fetch('/api/restaurant/menu', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: finalName,
            category: finalCat,
            price: finalPrice,
            emoji,
          }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Failed to create dish')
        onSaved(data.item, data.categories || [])
      }
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async () => {
    if (!editingItem || !onDeleted) return
    if (!confirm(`Are you sure you want to delete "${editingItem.name}" from the menu?`)) return

    setDeleting(true)
    try {
      const res = await fetch(`/api/restaurant/menu/${editingItem.id}`, {
        method: 'DELETE',
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to delete dish')
      onDeleted(editingItem.id, data.categories || [])
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-150">
      <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden flex flex-col">
        {/* Modal Header */}
        <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div>
            <h3 className="text-base font-black text-slate-900 dark:text-white">
              {editingItem ? 'Edit Food Item / Price' : 'Add New Menu Dish'}
            </h3>
            <p className="text-xs text-slate-400">
              {editingItem ? 'Update dish price, category, or name' : 'Customize category and price for your menu'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1.5 rounded-lg text-sm cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Modal Form */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && (
            <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-red-700 dark:text-red-300 text-xs font-bold">
              ⚠️ {error}
            </div>
          )}

          {/* Dish Name */}
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
              Food / Dish Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              placeholder="e.g. Special Chicken Karahi, Zinger Burger..."
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/40"
            />
          </div>

          {/* Price (Rs) */}
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
              Price (Rs) <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-black text-slate-400">
                Rs
              </span>
              <input
                type="number"
                min="0"
                step="1"
                required
                placeholder="e.g. 650"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                className="w-full pl-10 pr-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-black text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/40"
              />
            </div>
          </div>

          {/* Category Selector */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                Category <span className="text-red-500">*</span>
              </label>
              <button
                type="button"
                onClick={() => {
                  if (isCustomCategory) {
                    setIsCustomCategory(false)
                    setCategory(cleanCategories[0] || '')
                  } else {
                    setIsCustomCategory(true)
                    setCategory('__custom__')
                    setCustomCategory('')
                  }
                }}
                className="text-xs font-bold text-blue-600 hover:text-blue-700 dark:text-blue-400 cursor-pointer"
              >
                {isCustomCategory ? '← Choose Existing Category' : '✨ + Add New Category'}
              </button>
            </div>

            {isCustomCategory ? (
              <div className="animate-in fade-in duration-150">
                <input
                  type="text"
                  autoFocus
                  required
                  placeholder="Type new category name (e.g. Chinese, Desserts, Breakfast)..."
                  value={customCategory}
                  onChange={(e) => setCustomCategory(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl border border-blue-500 bg-blue-50/40 dark:bg-blue-950/30 text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                />
              </div>
            ) : (
              <select
                value={category}
                onChange={(e) => handleCategoryChange(e.target.value)}
                className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/40 cursor-pointer"
              >
                {cleanCategories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
                <option value="__custom__">✨ + Add New Category...</option>
              </select>
            )}
          </div>


          {/* Footer Actions */}
          <div className="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-slate-800">
            {editingItem && onDeleted ? (
              <button
                type="button"
                disabled={deleting || submitting}
                onClick={handleDelete}
                className="text-xs font-bold text-red-500 hover:text-red-700 cursor-pointer disabled:opacity-50"
              >
                {deleting ? 'Deleting...' : '🗑️ Delete Dish'}
              </button>
            ) : (
              <div />
            )}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-black shadow-md shadow-blue-600/20 transition cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
              >
                <span>💾</span>
                <span>{submitting ? 'Saving...' : editingItem ? 'Update Dish' : 'Add to Menu'}</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
