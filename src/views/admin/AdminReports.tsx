'use client'

import { useEffect, useMemo, useState } from 'react'
import Spinner from '../../components/Spinner'
import { REPORT_ORDER, REPORT_TYPES, type ReportType } from '../../lib/reports'
import {
  exportCsv,
  exportPdf,
  exportXlsx,
  formatCell,
  rangeLabel,
  type ReportPayload,
  type Row,
} from '../../lib/export'
import { formatDateTime } from '../../lib/datetime'

type Preset = 'today' | 'yesterday' | '7days' | '30days' | 'thisMonth' | 'lastMonth' | 'thisYear' | 'all' | 'custom'

const PRESETS: { key: Preset; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: '7days', label: '7 days' },
  { key: '30days', label: '30 days' },
  { key: 'thisMonth', label: 'This month' },
  { key: 'lastMonth', label: 'Last month' },
  { key: 'thisYear', label: 'This year' },
  { key: 'all', label: 'All time' },
  { key: 'custom', label: 'Custom' },
]

// Rendering tens of thousands of rows would lock the page. Exports always carry the full
// filtered set; only the on-screen preview (and therefore Print) is truncated.
const PREVIEW_LIMIT = 500

/** Small canvas bar chart, embedded into the PDF as a PNG. */
function buildBarChart(labels: string[], values: number[], title: string): string | undefined {
  if (!labels.length || typeof document === 'undefined') return undefined
  const W = 1100
  const H = 340
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  if (!ctx) return undefined

  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, W, H)
  ctx.fillStyle = '#0f172a'
  ctx.font = 'bold 20px sans-serif'
  ctx.fillText(title, 24, 32)

  const padL = 24
  const padB = 56
  const padT = 56
  const max = Math.max(...values, 1)
  const barW = (W - padL * 2) / labels.length

  labels.forEach((label, i) => {
    const v = values[i]
    const h = ((H - padT - padB) * v) / max
    const x = padL + i * barW
    const y = H - padB - h
    ctx.fillStyle = '#2563eb'
    ctx.fillRect(x + barW * 0.15, y, barW * 0.7, h)

    ctx.fillStyle = '#475569'
    ctx.font = '13px sans-serif'
    ctx.textAlign = 'center'
    const short = label.length > 14 ? label.slice(0, 13) + '…' : label
    ctx.fillText(short, x + barW / 2, H - padB + 20)
    ctx.fillStyle = '#0f172a'
    ctx.font = 'bold 12px sans-serif'
    ctx.fillText(
      v.toLocaleString('en-PK', { maximumFractionDigits: 0 }),
      x + barW / 2,
      Math.max(y - 6, padT - 6),
    )
    ctx.textAlign = 'left'
  })

  return canvas.toDataURL('image/png')
}

export default function AdminReports() {
  const [type, setType] = useState<ReportType>('sales')
  const [preset, setPreset] = useState<Preset>('30days')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [search, setSearch] = useState('')
  // Keyed to the request it belongs to, so a stale export error clears when filters change.
  const [exportError, setExportError] = useState<{ key: string; message: string } | null>(null)
  const [busy, setBusy] = useState<'csv' | 'xlsx' | 'pdf' | null>(null)

  const spec = REPORT_TYPES[type]
  const isSnapshot = 'snapshot' in spec && spec.snapshot === true

  // The result carries the request it answers. Anything whose key no longer matches the
  // current filters is stale, so `loading` is derived rather than tracked — a late response
  // for an abandoned filter can never be shown, and there is no flash of previous data.
  const requestKey = JSON.stringify({ type, preset, start: isSnapshot ? '' : start, end: isSnapshot ? '' : end })
  const [result, setResult] = useState<{ key: string; data?: ReportPayload; error?: string } | null>(null)

  const fresh = result?.key === requestKey
  const loading = !fresh
  const data = fresh ? result?.data ?? null : null
  const error =
    (fresh ? result?.error : null) ??
    (exportError?.key === requestKey ? exportError.message : null)

  useEffect(() => {
    const controller = new AbortController()
    void (async () => {
      try {
        const qs = new URLSearchParams({ type, preset })
        if (preset === 'custom') {
          if (start) qs.set('startDate', start)
          if (end) qs.set('endDate', end)
        }
        const res = await fetch(`/api/reports?${qs}`, { signal: controller.signal })
        const json = await res.json()
        if (!res.ok) throw new Error(json?.error || `Request failed: ${res.status}`)
        setResult({ key: requestKey, data: json as ReportPayload })
      } catch (e) {
        if (controller.signal.aborted) return
        setResult({ key: requestKey, error: e instanceof Error ? e.message : 'Failed to load report' })
      }
    })()
    return () => controller.abort()
  }, [type, preset, start, end, requestKey])

  // The rows the admin can actually see — and therefore exactly what gets exported.
  const filteredRows: Row[] = useMemo(() => {
    if (!data) return []
    const q = search.trim().toLowerCase()
    if (!q) return data.rows
    return data.rows.filter((r) =>
      data.columns.some((c) => String(r[c.key] ?? '').toLowerCase().includes(q)),
    )
  }, [data, search])

  const previewRows = filteredRows.slice(0, PREVIEW_LIMIT)
  const truncated = filteredRows.length > PREVIEW_LIMIT

  /** Recompute summary over the filtered subset, so headline figures track the search box. */
  const summary = useMemo(() => {
    if (!data) return {}
    if (!search.trim()) return data.summary
    const moneyCols = data.columns.filter((c) => c.type === 'money')
    const numCols = data.columns.filter((c) => c.type === 'number')
    const out: Record<string, number | string> = { Rows: filteredRows.length }
    for (const c of [...numCols, ...moneyCols]) {
      out[c.label] = Math.round(
        filteredRows.reduce((a, r) => a + (Number(r[c.key]) || 0), 0) * 100,
      ) / 100
    }
    return out
  }, [data, search, filteredRows])

  const payload = (): ReportPayload | null =>
    data ? { ...data, rows: filteredRows, summary } : null

  const chartFor = (p: ReportPayload) => {
    // Chart the dominant money column grouped by the most meaningful text column.
    const groupCol =
      p.columns.find((c) => c.key === 'category') ??
      p.columns.find((c) => c.key === 'customer') ??
      p.columns.find((c) => c.key === 'status')
    const moneyCol = p.columns.find((c) => c.type === 'money')
    if (!groupCol || !moneyCol || !p.rows.length) return undefined

    const groups = new Map<string, number>()
    for (const r of p.rows) {
      const k = String(r[groupCol.key] ?? '—')
      groups.set(k, (groups.get(k) || 0) + (Number(r[moneyCol.key]) || 0))
    }
    const top = [...groups.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)
    if (!top.length) return undefined
    const dataUrl = buildBarChart(
      top.map((t) => t[0]),
      top.map((t) => t[1]),
      `${moneyCol.label} by ${groupCol.label}`,
    )
    return dataUrl ? { title: `${moneyCol.label} by ${groupCol.label}`, dataUrl } : undefined
  }

  const doExport = async (kind: 'csv' | 'xlsx' | 'pdf') => {
    const p = payload()
    if (!p || !p.rows.length) return
    setBusy(kind)
    setExportError(null)
    try {
      if (kind === 'csv') exportCsv(p)
      else if (kind === 'xlsx') await exportXlsx(p)
      else await exportPdf(p, chartFor(p))
    } catch (e) {
      setExportError({
        key: requestKey,
        message: e instanceof Error ? e.message : `${kind.toUpperCase()} export failed`,
      })
    } finally {
      setBusy(null)
    }
  }

  const btn =
    'px-3 py-2 text-xs sm:text-sm rounded-lg font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer'

  return (
    <div className="max-w-7xl mx-auto p-3 sm:p-4 space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3 no-print">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Reports &amp; Exports</h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">{spec.description}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => doExport('csv')}
            disabled={!filteredRows.length || busy !== null}
            className={`${btn} border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800`}
          >
            {busy === 'csv' ? <Spinner /> : 'CSV'}
          </button>
          <button
            type="button"
            onClick={() => doExport('xlsx')}
            disabled={!filteredRows.length || busy !== null}
            className={`${btn} bg-emerald-600 hover:bg-emerald-500 text-white`}
          >
            {busy === 'xlsx' ? <Spinner /> : 'Excel'}
          </button>
          <button
            type="button"
            onClick={() => doExport('pdf')}
            disabled={!filteredRows.length || busy !== null}
            className={`${btn} bg-red-600 hover:bg-red-500 text-white`}
          >
            {busy === 'pdf' ? <Spinner /> : 'PDF'}
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            disabled={!filteredRows.length}
            className={`${btn} border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800`}
          >
            Print
          </button>
        </div>
      </div>

      {/* Report type */}
      <div className="flex flex-wrap gap-1.5 no-print">
        {REPORT_ORDER.map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setType(k)}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition cursor-pointer ${
              type === k
                ? 'bg-blue-600 border-blue-600 text-white shadow-xs'
                : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-blue-400'
            }`}
          >
            {REPORT_TYPES[k].title}
          </button>
        ))}
      </div>

      {/* Range + search */}
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 space-y-3 no-print">
        {isSnapshot ? (
          <p className="text-xs text-slate-500">
            This report is a snapshot of the catalogue as it stands now, so the date range does not apply.
          </p>
        ) : (
          <div className="flex flex-wrap items-center gap-1.5">
            {PRESETS.map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={() => setPreset(p.key)}
                className={`px-2.5 py-1.5 text-xs font-semibold rounded-md transition cursor-pointer ${
                  preset === p.key
                    ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900'
                    : 'bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
                }`}
              >
                {p.label}
              </button>
            ))}
            {preset === 'custom' && (
              <div className="flex flex-wrap items-center gap-2 ml-1">
                <input
                  type="date"
                  value={start}
                  max={end || undefined}
                  onChange={(e) => setStart(e.target.value)}
                  className="px-2 py-1.5 text-xs rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                />
                <span className="text-xs text-slate-400">to</span>
                <input
                  type="date"
                  value={end}
                  min={start || undefined}
                  onChange={(e) => setEnd(e.target.value)}
                  className="px-2 py-1.5 text-xs rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                />
              </div>
            )}
          </div>
        )}

        <div className="relative">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter rows — exports include only what matches"
            className="w-full px-3 py-2 pr-16 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-slate-500 hover:underline cursor-pointer"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="text-sm text-red-600 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-lg px-3 py-2 no-print">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-slate-500">
          <Spinner /> Loading report…
        </div>
      ) : data ? (
        <div className="print-area space-y-4">
          <div className="hidden print:block mb-2">
            <h2 className="text-lg font-bold">{data.title}</h2>
            <p className="text-xs text-slate-600">Range: {rangeLabel(data)}</p>
            <p className="text-xs text-slate-600">Generated: {formatDateTime(data.generatedAt)}</p>
          </div>

          {/* Summary statistics */}
          {Object.keys(summary).length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
              {Object.entries(summary).map(([k, v]) => (
                <div
                  key={k}
                  className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3"
                >
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{k}</div>
                  <div className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100 mt-1 tabular-nums">
                    {typeof v === 'number'
                      ? v.toLocaleString('en-PK', { maximumFractionDigits: 2 })
                      : v}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 border-b border-slate-200 dark:border-slate-700 text-xs text-slate-500 no-print">
              <span>
                {filteredRows.length.toLocaleString()} row{filteredRows.length === 1 ? '' : 's'}
                {search.trim() && data.rows.length !== filteredRows.length && (
                  <> filtered from {data.rows.length.toLocaleString()}</>
                )}
              </span>
              <span>{rangeLabel(data)}</span>
            </div>

            <div className="overflow-x-auto print-scroll">
              <table className="w-full text-sm">
                <thead className="text-left text-slate-500 bg-slate-50 dark:bg-slate-900">
                  <tr>
                    {data.columns.map((c) => (
                      <th
                        key={c.key}
                        className={`px-3 py-2 font-semibold whitespace-nowrap ${
                          c.type === 'money' || c.type === 'number' || c.type === 'percent'
                            ? 'text-right'
                            : ''
                        }`}
                      >
                        {c.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                  {previewRows.map((r, i) => (
                    <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-900/40">
                      {data.columns.map((c) => (
                        <td
                          key={c.key}
                          className={`px-3 py-2 whitespace-nowrap ${
                            c.type === 'money' || c.type === 'number' || c.type === 'percent'
                              ? 'text-right tabular-nums'
                              : ''
                          }`}
                        >
                          {formatCell(r[c.key], c.type)}
                        </td>
                      ))}
                    </tr>
                  ))}
                  {!filteredRows.length && (
                    <tr>
                      <td colSpan={data.columns.length} className="p-10 text-center text-slate-500">
                        No data for this report and range.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {truncated && (
              <div className="px-3 py-2 text-xs text-amber-700 bg-amber-50 dark:bg-amber-950/30 border-t border-amber-200 dark:border-amber-900 no-print">
                Showing the first {PREVIEW_LIMIT.toLocaleString()} of {filteredRows.length.toLocaleString()} rows.
                CSV, Excel and PDF exports contain all {filteredRows.length.toLocaleString()}; Print captures only what is shown.
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  )
}
