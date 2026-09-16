'use client'
import { useState } from 'react'
import type { RestaurantOrder, SplitBill } from '../../types'
import { formatMoney } from '../../lib/currency'
import { printCustomerReceipt } from '../../lib/restaurantReceipt'

interface Props {
  isOpen: boolean
  onClose: () => void
  order: RestaurantOrder
  onSaveSplits: (splits: any[]) => Promise<void>
  onPaySplit?: (split: SplitBill) => void
}

interface SplitItemAllocation {
  itemName: string
  price: number
  totalQty: number
  splitAllocations: number[] // quantity assigned to each split bill
}

export default function SplitBillModal({ isOpen, onClose, order, onSaveSplits, onPaySplit }: Props) {
  const [splitCount, setSplitCount] = useState<number>(2)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [infoMessage, setInfoMessage] = useState<string | null>(null)

  // Initialize allocations: distribute items or assign all to first bill
  const [allocations, setAllocations] = useState<SplitItemAllocation[]>(() => {
    return order.items.map((it) => {
      const alloc = Array(2).fill(0)
      alloc[0] = it.quantity // assign all to bill #1 by default so nothing is unallocated
      return {
        itemName: it.name,
        price: it.price,
        totalQty: it.quantity,
        splitAllocations: alloc,
      }
    })
  })

  if (!isOpen) return null

  const handleSplitCountChange = (newCount: number) => {
    const count = Math.max(2, Math.min(5, newCount))
    setSplitCount(count)
    setAllocations((prev) =>
      prev.map((item) => {
        const alloc = Array(count).fill(0)
        // Keep existing allocations up to new count, and assign remainder to first bill
        let assignedSum = 0
        for (let i = 0; i < count; i++) {
          const current = item.splitAllocations[i] || 0
          if (assignedSum + current <= item.totalQty) {
            alloc[i] = current
            assignedSum += current
          }
        }
        if (assignedSum < item.totalQty) {
          alloc[0] += item.totalQty - assignedSum
        }
        return {
          ...item,
          splitAllocations: alloc,
        }
      }),
    )
    setError(null)
    setInfoMessage(null)
  }

  // Quick 1 Bill Per Item Auto-Split (Separate bill for Chai, Golgappa, etc.)
  const handleSplitByItem = () => {
    const uniqueItemsCount = order.items.length
    if (uniqueItemsCount < 2) {
      setError('You need at least 2 different items on the table to split by item.')
      return
    }
    const count = Math.min(6, uniqueItemsCount)
    setSplitCount(count)
    setAllocations(
      order.items.slice(0, count).map((it, idx) => {
        const alloc = Array(count).fill(0)
        alloc[idx] = it.quantity // assign 100% of this item to its own dedicated bill!
        return {
          itemName: it.name,
          price: it.price,
          totalQty: it.quantity,
          splitAllocations: alloc,
        }
      }),
    )
    setError(null)
    setInfoMessage(`Auto-split activated: 1 separate bill generated for each item (${count} items)!`)
  }

  // Smart Step / Allocation Change with Auto-Shift
  const handleStepAllocation = (itemIdx: number, targetSplitIdx: number, delta: number) => {
    setError(null)
    setInfoMessage(null)

    setAllocations((prev) => {
      const next = [...prev]
      const item = { ...next[itemIdx] }
      const alloc = [...item.splitAllocations]
      const currentVal = alloc[targetSplitIdx] || 0

      if (delta < 0) {
        // Decrease allocation
        if (currentVal > 0) {
          alloc[targetSplitIdx] = currentVal - 1
          item.splitAllocations = alloc
          next[itemIdx] = item
        }
        return next
      }

      // Delta > 0: Try to increase
      const currentAssigned = alloc.reduce((a, b) => a + b, 0)
      const unassigned = item.totalQty - currentAssigned

      if (unassigned > 0) {
        // We have unassigned quantity left: simply add 1
        alloc[targetSplitIdx] = currentVal + 1
        item.splitAllocations = alloc
        next[itemIdx] = item
      } else {
        // All items are already allocated to other bills!
        // Find another split bill that currently has > 0 and shift 1 item to this bill
        let shiftedFrom = -1
        for (let i = 0; i < splitCount; i++) {
          if (i !== targetSplitIdx && (alloc[i] || 0) > 0) {
            shiftedFrom = i
            break
          }
        }

        if (shiftedFrom !== -1) {
          alloc[shiftedFrom] -= 1
          alloc[targetSplitIdx] = currentVal + 1
          item.splitAllocations = alloc
          next[itemIdx] = item
          setInfoMessage(`Shifted 1x "${item.itemName}" from Bill #${shiftedFrom + 1} to Bill #${targetSplitIdx + 1}`)
        } else {
          setError(`Total ordered is ${item.totalQty}. You cannot assign more than the ordered quantity.`)
        }
      }

      return next
    })
  }

  // Direct manual input change
  const handleManualAllocationChange = (itemIdx: number, splitIdx: number, rawVal: number) => {
    setError(null)
    setInfoMessage(null)

    setAllocations((prev) => {
      const next = [...prev]
      const item = { ...next[itemIdx] }
      const alloc = [...item.splitAllocations]
      const targetQty = Math.max(0, rawVal)

      // Other splits sum
      const otherSum = alloc.reduce((a, b, idx) => (idx === splitIdx ? a : a + b), 0)
      const maxAllowed = item.totalQty - otherSum

      if (targetQty <= maxAllowed) {
        alloc[splitIdx] = targetQty
        item.splitAllocations = alloc
        next[itemIdx] = item
      } else {
        // Cap to maximum available
        alloc[splitIdx] = Math.max(0, maxAllowed)
        item.splitAllocations = alloc
        next[itemIdx] = item
        setError(
          `Total ordered is ${item.totalQty}. To give more to Bill #${splitIdx + 1}, decrease from other bills first.`,
        )
      }

      return next
    })
  }

  // Calculate totals per split bill
  const splitTotals = Array.from({ length: splitCount }, (_, splitIdx) => {
    return allocations.reduce((sum, item) => {
      const qty = item.splitAllocations[splitIdx] || 0
      return sum + qty * item.price
    }, 0)
  })

  const handleSave = async () => {
    // Validate that all items are fully allocated
    for (const item of allocations) {
      const sum = item.splitAllocations.reduce((a, b) => a + b, 0)
      if (sum !== item.totalQty) {
        setError(`Item "${item.itemName}" is not fully assigned (${sum}/${item.totalQty} allocated). Please assign all items.`)
        return
      }
    }

    const splitsPayload = Array.from({ length: splitCount }, (_, splitIdx) => {
      const itemsForSplit: { name: string; price: number; quantity: number }[] = []
      allocations.forEach((it) => {
        const qty = it.splitAllocations[splitIdx] || 0
        if (qty > 0) {
          itemsForSplit.push({
            name: it.itemName,
            price: it.price,
            quantity: qty,
          })
        }
      })

      const label =
        itemsForSplit.length === 1
          ? `Bill #${splitIdx + 1} (${itemsForSplit[0].name})`
          : `Bill #${splitIdx + 1}`

      return {
        splitNumber: splitIdx + 1,
        label,
        items: itemsForSplit,
        subtotal: splitTotals[splitIdx],
        discount: 0,
        total: splitTotals[splitIdx],
        status: 'unpaid',
      }
    })

    setSubmitting(true)
    setError(null)
    try {
      await onSaveSplits(splitsPayload)
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save split bills')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 overflow-y-auto animate-in fade-in duration-150">
      <div className="w-full max-w-3xl rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 px-6 py-4 bg-slate-50/50 dark:bg-slate-800/40">
          <div>
            <h2 className="text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
              <span>✂️</span>
              <span>Split Bill: Table {order.tableName}</span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Total Order Value: <span className="font-bold text-slate-900 dark:text-white">{formatMoney(order.total)}</span> ({order.items.reduce((s, i) => s + i.quantity, 0)} items ordered)
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200 cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          {/* Feedback messages */}
          {error && (
            <div className="rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 p-3 text-xs font-bold text-red-600 dark:text-red-400 animate-in fade-in duration-150">
              ⚠️ {error}
            </div>
          )}

          {infoMessage && (
            <div className="rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 p-3 text-xs font-bold text-emerald-700 dark:text-emerald-300 animate-in fade-in duration-150">
              ✓ {infoMessage}
            </div>
          )}

          {/* Number of splits control & Quick 1-Bill-Per-Item button */}
          <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
            <div className="flex items-center gap-2.5">
              <span className="text-xs font-bold uppercase text-slate-500">Split Count:</span>
              <div className="flex rounded-lg border border-slate-200 dark:border-slate-700 p-0.5 bg-white dark:bg-slate-800 shadow-2xs">
                {[2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => handleSplitCountChange(n)}
                    className={`px-3 py-1 text-xs font-bold rounded-md transition cursor-pointer ${
                      splitCount === n
                        ? 'bg-blue-600 text-white shadow-sm font-black'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    {n} Bills
                  </button>
                ))}
              </div>
            </div>

            {/* Quick 1 Bill Per Item Button */}
            {order.items.length >= 2 ? (
              <button
                type="button"
                onClick={handleSplitByItem}
                className="px-3 py-1.5 rounded-lg border border-emerald-300 dark:border-emerald-700 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black transition cursor-pointer flex items-center gap-1.5 shadow-sm"
                title="Automatically create 1 separate bill for each product (e.g. Chai, Golgappa, etc.)"
              >
                <span>⚡</span>
                <span>1 Bill Per Item (Chai, Golgappa, etc.)</span>
              </button>
            ) : (
              <span className="text-[11px] text-slate-400 italic">
                (Add more items to table to enable 1 Bill Per Item)
              </span>
            )}
          </div>

          {/* Allocation Table */}
          <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-[11px] font-bold uppercase text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
                <tr>
                  <th className="px-4 py-3">Ordered Item</th>
                  <th className="px-3 py-3 text-center">Ordered Qty</th>
                  {Array.from({ length: splitCount }, (_, i) => (
                    <th key={i} className="px-3 py-3 text-center">
                      Bill #{i + 1}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {allocations.map((item, itemIdx) => {
                  const currentAssigned = item.splitAllocations.reduce((a, b) => a + b, 0)
                  const unassigned = item.totalQty - currentAssigned

                  return (
                    <tr key={itemIdx} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                      <td className="px-4 py-3 font-bold text-slate-900 dark:text-white">
                        <div>{item.itemName}</div>
                        <div className="text-[11px] text-slate-400 font-normal">{formatMoney(item.price)} each</div>
                      </td>
                      <td className="px-3 py-3 text-center">
                        <span className="font-black text-xs text-slate-800 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-md">
                          {item.totalQty}
                        </span>
                        {unassigned > 0 ? (
                          <div className="text-[10px] text-amber-600 font-bold mt-1">
                            ⚠️ {unassigned} left
                          </div>
                        ) : (
                          <div className="text-[10px] text-emerald-600 font-bold mt-1">
                            ✓ All assigned
                          </div>
                        )}
                      </td>

                      {/* Split Steppers for Each Bill */}
                      {Array.from({ length: splitCount }, (_, splitIdx) => {
                        const qty = item.splitAllocations[splitIdx] || 0

                        return (
                          <td key={splitIdx} className="px-3 py-3 text-center">
                            <div className="inline-flex items-center gap-1 bg-slate-50 dark:bg-slate-800 p-1 rounded-xl border border-slate-200 dark:border-slate-700 shadow-2xs">
                              <button
                                type="button"
                                onClick={() => handleStepAllocation(itemIdx, splitIdx, -1)}
                                disabled={qty <= 0}
                                className="h-7 w-7 rounded-lg bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200 font-black text-xs hover:bg-slate-100 disabled:opacity-30 cursor-pointer shadow-2xs transition"
                                title="Reduce 1"
                              >
                                -
                              </button>

                              <input
                                type="number"
                                min="0"
                                max={item.totalQty}
                                value={qty}
                                onChange={(e) =>
                                  handleManualAllocationChange(itemIdx, splitIdx, parseInt(e.target.value, 10) || 0)
                                }
                                className="w-10 text-center font-black text-xs text-slate-900 dark:text-white bg-transparent focus:outline-none"
                              />

                              <button
                                type="button"
                                onClick={() => handleStepAllocation(itemIdx, splitIdx, 1)}
                                className="h-7 w-7 rounded-lg bg-blue-600 text-white font-black text-xs hover:bg-blue-700 cursor-pointer shadow-sm transition"
                                title={
                                  unassigned > 0
                                    ? 'Add 1 to this bill'
                                    : 'Shift 1 item from another bill to this bill'
                                }
                              >
                                +
                              </button>
                            </div>
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Live Sub-Bills Totals Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {Array.from({ length: splitCount }, (_, i) => (
              <div
                key={i}
                className="rounded-2xl border border-slate-200 dark:border-slate-800 p-3.5 bg-slate-50 dark:bg-slate-800/50 text-center shadow-2xs"
              >
                <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Bill #{i + 1}</div>
                <div className="text-base font-black text-blue-600 dark:text-blue-400 mt-0.5">
                  {formatMoney(splitTotals[i])}
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5">
                  {allocations.reduce((sum, it) => sum + (it.splitAllocations[i] || 0), 0)} items
                </div>
              </div>
            ))}
          </div>

          {/* Previously Saved Splits (if any) */}
          {order.splitBills && order.splitBills.length > 0 && (
            <div className="border-t border-slate-200 dark:border-slate-800 pt-4">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                Currently Saved Splits
              </h3>
              <div className="space-y-2">
                {order.splitBills.map((sb, idx) => {
                  const isPaid = sb.status === 'paid'
                  return (
                    <div
                      key={idx}
                      className={`flex flex-col sm:flex-row sm:items-center justify-between rounded-xl border p-2.5 px-4 text-xs gap-2 ${
                        isPaid
                          ? 'border-emerald-200 dark:border-emerald-800 bg-emerald-50/40 dark:bg-emerald-950/30'
                          : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900'
                      }`}
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-800 dark:text-slate-100">{sb.label}</span>
                          <span
                            className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full border ${
                              isPaid
                                ? 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-900/60 dark:text-emerald-300 dark:border-emerald-700'
                                : 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/60 dark:text-amber-300 dark:border-amber-700'
                            }`}
                          >
                            {isPaid ? `Paid (${sb.paymentMethod || 'cash'})` : 'Unpaid'}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          {sb.items.map((it) => `${it.quantity}x ${it.name}`).join(', ')}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 justify-end">
                        <span className="font-black text-slate-900 dark:text-white">{formatMoney(sb.total)}</span>
                        <button
                          type="button"
                          onClick={() => printCustomerReceipt(order, sb as SplitBill)}
                          className="rounded-lg bg-slate-100 dark:bg-slate-800 px-2 py-1 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 transition"
                        >
                          🖨️ Bill
                        </button>
                        {!isPaid && onPaySplit && (
                          <button
                            type="button"
                            onClick={() => {
                              onClose()
                              onPaySplit(sb as SplitBill)
                            }}
                            className="rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white px-2.5 py-1 text-xs font-bold shadow-sm transition cursor-pointer"
                          >
                            💰 Pay
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 border-t border-slate-200 dark:border-slate-800 px-6 py-4 bg-slate-50/50 dark:bg-slate-800/40">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={submitting}
            onClick={handleSave}
            className="rounded-xl bg-blue-600 px-5 py-2 text-xs font-black text-white shadow-md shadow-blue-600/20 hover:bg-blue-700 transition disabled:opacity-50 cursor-pointer"
          >
            {submitting ? 'Saving...' : 'Confirm & Save Splits'}
          </button>
        </div>
      </div>
    </div>
  )
}
