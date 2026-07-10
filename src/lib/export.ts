// CSV / XLSX / PDF writers. All three consume the same `rows` array the table renders,
// so a downloaded file always matches the filtered view it was produced from.
//
// exceljs and jspdf are heavy and browser-only; they are imported dynamically at the moment
// of download so they stay out of the initial page bundle.

import { formatDateTime } from './datetime'
import type { Column } from './reports'

export type Row = Record<string, string | number>

export interface ReportPayload {
  type: string
  title: string
  columns: Column[]
  rows: Row[]
  summary: Record<string, number | string>
  dateFiltered: boolean
  preset: string
  startDate: string
  endDate: string
  generatedAt: string
}

const isNumeric = (c: Column) => c.type === 'number' || c.type === 'money' || c.type === 'percent'

/** Display value for a cell — used by the table and by CSV/PDF. */
export function formatCell(value: string | number | undefined, type: Column['type']): string {
  if (value === undefined || value === null || value === '') return ''
  switch (type) {
    case 'money':
      return Number(value).toLocaleString('en-PK', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
    case 'percent':
      return `${Number(value).toFixed(1)}%`
    case 'number':
      return String(value)
    case 'datetime':
    case 'date':
      return formatDateTime(String(value))
    default:
      return String(value)
  }
}

export function rangeLabel(p: ReportPayload): string {
  if (!p.dateFiltered) return 'Current snapshot'
  if (p.preset === 'all') return 'All time'
  return `${formatDateTime(p.startDate)} — ${formatDateTime(p.endDate)}`
}

function baseFilename(p: ReportPayload): string {
  const stamp = p.generatedAt.slice(0, 10)
  return `${p.type}-report-${stamp}`
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Revoking synchronously can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/* ------------------------------------------------------------------ CSV */

function csvCell(v: string): string {
  // Quote when the value contains a delimiter, quote or newline; double any inner quotes.
  if (/[",\r\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`
  return v
}

/** Pure CSV text for a payload. Separated from the download so it can be tested. */
export function buildCsv(p: ReportPayload): string {
  const lines: string[] = []
  lines.push(csvCell(p.title))
  lines.push(csvCell(`Range: ${rangeLabel(p)}`))
  lines.push(csvCell(`Generated: ${formatDateTime(p.generatedAt)}`))
  lines.push('')
  lines.push(p.columns.map((c) => csvCell(c.label)).join(','))
  for (const r of p.rows) {
    lines.push(
      p.columns
        .map((c) => {
          // Numbers stay raw so spreadsheets treat them as numbers, not text.
          const v = r[c.key]
          if (isNumeric(c) && typeof v === 'number') return String(v)
          return csvCell(formatCell(v, c.type))
        })
        .join(','),
    )
  }
  if (Object.keys(p.summary).length) {
    lines.push('')
    lines.push(csvCell('Summary'))
    for (const [k, v] of Object.entries(p.summary)) {
      lines.push(`${csvCell(k)},${csvCell(String(v))}`)
    }
  }
  return lines.join('\r\n')
}

export function exportCsv(p: ReportPayload) {
  // Leading BOM so Excel opens UTF-8 correctly.
  download(
    new Blob(['﻿' + buildCsv(p)], { type: 'text/csv;charset=utf-8;' }),
    `${baseFilename(p)}.csv`,
  )
}

/* ----------------------------------------------------------------- XLSX */

/** Pure XLSX bytes for a payload. Separated from the download so it can be tested. */
export async function buildXlsxBuffer(p: ReportPayload): Promise<ArrayBuffer> {
  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()
  wb.creator = 'SalesPoint'
  wb.created = new Date(p.generatedAt)
  const ws = wb.addWorksheet(p.title.slice(0, 31) || 'Report')

  const titleRow = ws.addRow([p.title])
  titleRow.font = { bold: true, size: 14 }
  ws.addRow([`Range: ${rangeLabel(p)}`])
  ws.addRow([`Generated: ${formatDateTime(p.generatedAt)}`])
  ws.addRow([])

  const header = ws.addRow(p.columns.map((c) => c.label))
  header.font = { bold: true }
  header.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } }
    cell.border = { bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } } }
  })

  for (const r of p.rows) {
    const row = ws.addRow(
      p.columns.map((c) => {
        const v = r[c.key]
        if (isNumeric(c) && typeof v === 'number') return v
        if (c.type === 'datetime' || c.type === 'date') return formatCell(v, c.type)
        return v ?? ''
      }),
    )
    p.columns.forEach((c, idx) => {
      const cell = row.getCell(idx + 1)
      if (c.type === 'money') cell.numFmt = '#,##0.00'
      else if (c.type === 'percent') cell.numFmt = '0.0"%"'
      else if (c.type === 'number') cell.numFmt = '#,##0'
    })
  }

  // Freeze the header and size columns to their content.
  ws.views = [{ state: 'frozen', ySplit: 5 }]
  ws.columns.forEach((col, i) => {
    const label = p.columns[i]?.label ?? ''
    let width = label.length + 4
    col.eachCell?.({ includeEmpty: false }, (cell) => {
      width = Math.max(width, String(cell.value ?? '').length + 2)
    })
    col.width = Math.min(width, 40)
  })

  if (Object.keys(p.summary).length) {
    ws.addRow([])
    const s = ws.addRow(['Summary'])
    s.font = { bold: true }
    for (const [k, v] of Object.entries(p.summary)) ws.addRow([k, v])
  }

  return wb.xlsx.writeBuffer() as Promise<ArrayBuffer>
}

export async function exportXlsx(p: ReportPayload) {
  const buf = await buildXlsxBuffer(p)
  download(
    new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    `${baseFilename(p)}.xlsx`,
  )
}

/* ------------------------------------------------------------------ PDF */

export async function exportPdf(p: ReportPayload, chart?: { title: string; dataUrl: string }) {
  const { jsPDF } = await import('jspdf')
  const autoTable = (await import('jspdf-autotable')).default

  const landscape = p.columns.length > 7
  const doc = new jsPDF({ orientation: landscape ? 'landscape' : 'portrait', unit: 'pt', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const margin = 36

  doc.setFontSize(16)
  doc.setTextColor(15, 23, 42)
  doc.text(p.title, margin, 46)

  doc.setFontSize(9)
  doc.setTextColor(100, 116, 139)
  doc.text(`Range: ${rangeLabel(p)}`, margin, 62)
  doc.text(`Generated: ${formatDateTime(p.generatedAt)}`, margin, 74)
  doc.text('SalesPoint', pageWidth - margin, 46, { align: 'right' })

  let cursorY = 92

  // Summary statistics as a compact grid of boxes.
  const entries = Object.entries(p.summary)
  if (entries.length) {
    const perRow = landscape ? 4 : 3
    const boxW = (pageWidth - margin * 2 - (perRow - 1) * 8) / perRow
    const boxH = 34
    entries.forEach(([k, v], i) => {
      const col = i % perRow
      const rowIdx = Math.floor(i / perRow)
      const x = margin + col * (boxW + 8)
      const y = cursorY + rowIdx * (boxH + 6)
      doc.setDrawColor(226, 232, 240)
      doc.setFillColor(248, 250, 252)
      doc.roundedRect(x, y, boxW, boxH, 3, 3, 'FD')
      doc.setFontSize(6.5)
      doc.setTextColor(100, 116, 139)
      doc.text(k.toUpperCase(), x + 7, y + 12)
      doc.setFontSize(10)
      doc.setTextColor(15, 23, 42)
      const val = typeof v === 'number' ? v.toLocaleString('en-PK', { maximumFractionDigits: 2 }) : String(v)
      doc.text(val, x + 7, y + 26)
    })
    cursorY += Math.ceil(entries.length / perRow) * (boxH + 6) + 8
  }

  if (chart?.dataUrl) {
    const imgW = pageWidth - margin * 2
    const imgH = imgW * 0.32
    doc.addImage(chart.dataUrl, 'PNG', margin, cursorY, imgW, imgH, undefined, 'FAST')
    cursorY += imgH + 12
  }

  autoTable(doc, {
    startY: cursorY,
    margin: { left: margin, right: margin },
    head: [p.columns.map((c) => c.label)],
    body: p.rows.map((r) => p.columns.map((c) => formatCell(r[c.key], c.type))),
    styles: { fontSize: 7.5, cellPadding: 3, textColor: [30, 41, 59], lineColor: [226, 232, 240] },
    headStyles: { fillColor: [37, 99, 235], textColor: 255, fontStyle: 'bold', fontSize: 7.5 },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: Object.fromEntries(
      p.columns.map((c, i) => [i, { halign: isNumeric(c) ? 'right' : 'left' }]),
    ),
    didDrawPage: () => {
      const page = doc.getNumberOfPages()
      doc.setFontSize(7.5)
      doc.setTextColor(148, 163, 184)
      doc.text(`Page ${page}`, pageWidth - margin, doc.internal.pageSize.getHeight() - 16, {
        align: 'right',
      })
    },
  })

  doc.save(`${baseFilename(p)}.pdf`)
}
