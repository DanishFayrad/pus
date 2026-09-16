import JsBarcode from 'jsbarcode'
import QRCode from 'qrcode'
import type { RestaurantOrder, SplitBill } from '../types'
import { formatMoney } from './currency'
import { formatDateTime } from './datetime'

/** Generate Barcode Data URL via in-memory canvas */
function generateBarcode(text: string): string {
  if (typeof document === 'undefined') return ''
  try {
    const canvas = document.createElement('canvas')
    JsBarcode(canvas, text, {
      format: 'CODE128',
      width: 1.15,
      height: 26,
      displayValue: true,
      fontSize: 8.5,
      font: 'Consolas',
      textMargin: 1.5,
      margin: 0,
    })
    return canvas.toDataURL('image/png')
  } catch (e) {
    console.error('Barcode generation error:', e)
    return ''
  }
}

/** Generate QR Code Data URL */
async function generateQRCode(text: string): Promise<string> {
  try {
    return await QRCode.toDataURL(text, {
      width: 65,
      margin: 1,
      errorCorrectionLevel: 'M',
    })
  } catch (e) {
    console.error('QR code generation error:', e)
    return ''
  }
}

/** Print Customer-Facing Dining Receipt */
export async function printCustomerReceipt(order: RestaurantOrder, split?: SplitBill) {
  const printWindow = window.open('', '_blank', 'width=340,height=600')
  if (!printWindow) {
    alert('Please allow popups to print customer receipt')
    return
  }

  const invoiceNo = split ? `${order.orderNumber}-S${split.splitNumber}` : order.orderNumber
  const barcodeImg = generateBarcode(invoiceNo)
  const qrImg = await generateQRCode(`TABLE:${order.tableName}|ORDER:${invoiceNo}|TOTAL:${split ? split.total : order.total}`)

  const items = split ? split.items : order.items

  const itemsHtml = items
    .map(
      (item) => `
      <tr>
        <td style="padding: 2px 0; text-align: left; vertical-align: top; word-break: break-word;">
          <strong>${item.name}</strong>
          ${item.quantity > 1 ? `<div style="font-size: 7.5pt; color: #444;">@ ${formatMoney(item.price)}</div>` : ''}
          ${'notes' in item && item.notes ? `<div style="font-size: 7pt; color: #555; font-style: italic;">* ${item.notes}</div>` : ''}
        </td>
        <td style="padding: 2px 0; text-align: center; vertical-align: top; font-weight: bold;">
          ${item.quantity}
        </td>
        <td style="padding: 2px 0; text-align: right; vertical-align: top; font-weight: bold; white-space: nowrap;">
          ${formatMoney(item.price * item.quantity)}
        </td>
      </tr>
    `,
    )
    .join('')

  const subtotal = split ? split.subtotal : order.subtotal
  const discount = split ? split.discount : order.discount
  const total = split ? split.total : order.total

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <title>Receipt - ${order.tableName} - ${invoiceNo}</title>
        <style>
          @page { margin: 0; size: auto; }
          * { box-sizing: border-box; margin: 0; padding: 0; }
          html, body { width: 100%; background: #fff; color: #000; }
          body {
            font-family: 'Consolas', 'Courier New', monospace;
            font-size: 8.5pt;
            line-height: 1.3;
            margin: 0 auto;
            padding: 2mm 3.5mm;
            width: 100%;
            max-width: 180px;
            text-align: center;
            overflow-x: hidden;
          }
          .title { font-size: 12pt; font-weight: 900; text-transform: uppercase; letter-spacing: 0.3px; margin-bottom: 1px; word-break: break-word; }
          .subtitle { font-size: 7.5pt; color: #333; margin-bottom: 4px; }
          .table-badge {
            display: inline-block;
            background: #000;
            color: #fff;
            padding: 2px 6px;
            font-size: 8.5pt;
            font-weight: bold;
            border-radius: 3px;
            margin-bottom: 4px;
          }
          .info { text-align: left; font-size: 8pt; margin-bottom: 4px; line-height: 1.35; word-break: break-word; }
          .divider { border-top: 1px dashed #000; margin: 3px 0; }
          table { width: 100%; border-collapse: collapse; font-size: 8pt; margin: 3px 0; table-layout: fixed; }
          th, td { overflow: hidden; }
          .summary-row { display: flex; justify-content: space-between; font-size: 8.5pt; padding: 1px 0; }
          .total-section {
            display: flex;
            justify-content: space-between;
            font-size: 10pt;
            font-weight: 900;
            margin-top: 3px;
            padding-top: 3px;
            border-top: 1px dashed #000;
          }
          .barcode-box { margin-top: 5px; text-align: center; }
          .barcode-box img { max-width: 130px; height: auto; display: inline-block; }
          .footer { margin-top: 6px; font-size: 7.5pt; line-height: 1.3; }
          @media print {
            html, body {
              margin: 0 auto !important;
              padding: 1.5mm 3mm !important;
              width: 100% !important;
              max-width: 172px !important;
            }
          }
        </style>
      </head>
      <body>
        <div class="title">MILANO GARDEN</div>
        <div class="subtitle">Restaurant & Cafe</div>
        <div class="table-badge">TABLE ${order.tableName} ${split ? `(${split.label})` : ''}</div>
        
        <div class="info">
          <strong>Receipt #:</strong> ${invoiceNo}<br/>
          <strong>Date:</strong> ${formatDateTime(order.createdAt)}<br/>
          <strong>Waiter:</strong> ${order.waiterName || 'Staff'}<br/>
          ${order.cashierName ? `<strong>Cashier:</strong> ${order.cashierName}<br/>` : ''}
          <strong>Payment:</strong> ${split?.paymentMethod || order.paymentMethod || 'Cash'}<br/>
        </div>

        <div class="divider"></div>

        <table>
          <thead>
            <tr style="border-bottom: 1px dashed #000;">
              <th style="width: 50%; text-align: left; padding-bottom: 2px;">Item</th>
              <th style="width: 16%; text-align: center; padding-bottom: 2px;">Qty</th>
              <th style="width: 34%; text-align: right; padding-bottom: 2px;">Amount</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHtml}
          </tbody>
        </table>

        <div class="divider"></div>

        <div class="summary-row">
          <span>Subtotal:</span>
          <span>${formatMoney(subtotal)}</span>
        </div>
        ${
          discount > 0
            ? `
        <div class="summary-row" style="color: #000;">
          <span>Discount:</span>
          <span>-${formatMoney(discount)}</span>
        </div>`
            : ''
        }
        ${
          order.tax > 0 && !split
            ? `
        <div class="summary-row">
          <span>Tax:</span>
          <span>${formatMoney(order.tax)}</span>
        </div>`
            : ''
        }

        <div class="total-section">
          <span>TOTAL:</span>
          <span>${formatMoney(total)}</span>
        </div>

        <div class="divider"></div>

        <div class="barcode-box">
          ${barcodeImg ? `<img src="${barcodeImg}" alt="${invoiceNo}" />` : `<strong>${invoiceNo}</strong>`}
        </div>

        <div class="footer">
          Thank you for dining at Milano Garden!<br/>
          Please visit again.
        </div>

        <script>
          window.onload = function() {
            window.print();
            setTimeout(function() {
              window.close();
            }, 400);
          };
        </script>
      </body>
    </html>
  `

  printWindow.document.write(html)
  printWindow.document.close()
}

/** Print Detailed Cashier & Kitchen Audit Bill */
export async function printCashierBill(order: RestaurantOrder) {
  const printWindow = window.open('', '_blank', 'width=360,height=650')
  if (!printWindow) {
    alert('Please allow popups to print cashier bill')
    return
  }

  const barcodeImg = generateBarcode(order.orderNumber)

  // Group items by round
  const roundsMap = new Map<number, typeof order.items>()
  order.items.forEach((item) => {
    const r = item.round || 1
    if (!roundsMap.has(r)) roundsMap.set(r, [])
    roundsMap.get(r)!.push(item)
  })

  const roundsHtml = Array.from(roundsMap.entries())
    .sort(([a], [b]) => a - b)
    .map(([roundNum, items]) => {
      const rows = items
        .map(
          (item) => `
          <tr>
            <td style="padding: 2px 0; text-align: left; vertical-align: top; word-break: break-word;">
              ${item.name}
              ${item.quantity > 1 ? `<div style="font-size: 7.5pt; color: #444;">@ ${formatMoney(item.price)}</div>` : ''}
              ${item.notes ? `<div style="font-size: 7pt; color: #444; font-weight: bold;">[Note: ${item.notes}]</div>` : ''}
            </td>
            <td style="padding: 2px 0; text-align: center; vertical-align: top; font-weight: bold;">
              ${item.quantity}
            </td>
            <td style="padding: 2px 0; text-align: right; vertical-align: top; font-weight: bold; white-space: nowrap;">
              ${formatMoney(item.price * item.quantity)}
            </td>
          </tr>
        `,
        )
        .join('')

      return `
        <tr>
          <td colspan="3" style="padding: 3px 0 1px 0; font-size: 7.5pt; font-weight: bold; border-bottom: 1px dotted #000; text-transform: uppercase;">
            --- ROUND ${roundNum} ---
          </td>
        </tr>
        ${rows}
      `
    })
    .join('')

  const splitBillsHtml =
    order.splitBills && order.splitBills.length > 0
      ? `
      <div class="divider"></div>
      <div style="font-weight: bold; font-size: 8pt; text-align: left; margin: 2px 0;">SPLIT BILLS:</div>
      ${order.splitBills
        .map(
          (sb) => `
        <div style="display: flex; justify-content: space-between; font-size: 8pt; padding: 1px 0;">
          <span>${sb.label} (${sb.status.toUpperCase()}):</span>
          <strong>${formatMoney(sb.total)}</strong>
        </div>
      `,
        )
        .join('')}
    `
      : ''

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <title>Cashier Bill - ${order.tableName} - ${order.orderNumber}</title>
        <style>
          @page { margin: 0; size: auto; }
          * { box-sizing: border-box; margin: 0; padding: 0; }
          html, body { width: 100%; background: #fff; color: #000; }
          body {
            font-family: 'Consolas', 'Courier New', monospace;
            font-size: 8.5pt;
            line-height: 1.3;
            margin: 0 auto;
            padding: 2mm 3.5mm;
            width: 100%;
            max-width: 180px;
            text-align: center;
            overflow-x: hidden;
          }
          .title { font-size: 12pt; font-weight: 900; text-transform: uppercase; letter-spacing: 0.3px; }
          .badge {
            display: inline-block;
            background: #111;
            color: #fff;
            padding: 1px 5px;
            font-size: 7.5pt;
            font-weight: bold;
            border-radius: 3px;
            margin: 2px 0 3px 0;
            text-transform: uppercase;
          }
          .info { text-align: left; font-size: 8pt; margin-bottom: 3px; line-height: 1.3; }
          .divider { border-top: 1px dashed #000; margin: 3px 0; }
          table { width: 100%; border-collapse: collapse; font-size: 8pt; margin: 3px 0; table-layout: fixed; }
          th, td { overflow: hidden; }
          .summary-row { display: flex; justify-content: space-between; font-size: 8.5pt; padding: 1px 0; }
          .total-section {
            display: flex;
            justify-content: space-between;
            font-size: 10pt;
            font-weight: 900;
            margin-top: 3px;
            padding-top: 3px;
            border-top: 1px dashed #000;
          }
          .footer { margin-top: 6px; font-size: 7.5pt; line-height: 1.3; }
          @media print {
            html, body {
              margin: 0 auto !important;
              padding: 1.5mm 3mm !important;
              width: 100% !important;
              max-width: 172px !important;
            }
          }
        </style>
      </head>
      <body>
        <div class="title">MILANO GARDEN</div>
        <div class="badge">AUDIT SLIP</div>
        
        <div class="info">
          <strong>Table:</strong> ${order.tableName} (Sec ${order.section})<br/>
          <strong>Order #:</strong> ${order.orderNumber}<br/>
          <strong>Time:</strong> ${formatDateTime(order.createdAt)}<br/>
          <strong>Waiter:</strong> ${order.waiterName || 'Staff'}<br/>
          <strong>Cashier:</strong> ${order.cashierName || 'Cashier'}<br/>
          <strong>Status:</strong> ${order.status.toUpperCase()} (${order.paymentMethod || 'Cash'})<br/>
          ${order.notes ? `<strong>Note:</strong> ${order.notes}<br/>` : ''}
        </div>

        <div class="divider"></div>

        <table>
          <thead>
            <tr style="border-bottom: 1px dashed #000;">
              <th style="width: 50%; text-align: left; padding-bottom: 2px;">Item</th>
              <th style="width: 16%; text-align: center; padding-bottom: 2px;">Qty</th>
              <th style="width: 34%; text-align: right; padding-bottom: 2px;">Amount</th>
            </tr>
          </thead>
          <tbody>
            ${roundsHtml}
          </tbody>
        </table>

        <div class="divider"></div>

        <div class="summary-row">
          <span>Subtotal:</span>
          <span>${formatMoney(order.subtotal)}</span>
        </div>
        ${
          order.discount > 0
            ? `
        <div class="summary-row">
          <span>Discount:</span>
          <span>-${formatMoney(order.discount)}</span>
        </div>`
            : ''
        }
        ${
          order.tax > 0
            ? `
        <div class="summary-row">
          <span>Tax:</span>
          <span>${formatMoney(order.tax)}</span>
        </div>`
            : ''
        }

        <div class="total-section">
          <span>TOTAL:</span>
          <span>${formatMoney(order.total)}</span>
        </div>

        ${splitBillsHtml}

        <div class="divider"></div>

        <div class="barcode-box">
          ${barcodeImg ? `<img src="${barcodeImg}" alt="${order.orderNumber}" style="max-width: 130px; height: auto;" />` : ''}
        </div>

        <div class="footer">
          Cashier Sign: ______________<br/>
          Manager Sign: ______________
        </div>

        <script>
          window.onload = function() {
            window.print();
            setTimeout(function() {
              window.close();
            }, 400);
          };
        </script>
      </body>
    </html>
  `

  printWindow.document.write(html)
  printWindow.document.close()
}

/** Print Dedicated Kitchen Order Ticket (KOT) for Chef / Kitchen Thermal Printer */
export async function printKitchenKot(order: RestaurantOrder) {
  const printWindow = window.open('', '_blank', 'width=360,height=600')
  if (!printWindow) {
    alert('Please allow popups to print Kitchen Order Ticket (KOT)')
    return
  }

  // Group items by round
  const roundsMap = new Map<number, typeof order.items>()
  order.items.forEach((item) => {
    const r = item.round || 1
    if (!roundsMap.has(r)) roundsMap.set(r, [])
    roundsMap.get(r)!.push(item)
  })

  const roundsHtml = Array.from(roundsMap.entries())
    .sort(([a], [b]) => a - b)
    .map(([roundNum, items]) => {
      const rows = items
        .map(
          (item) => `
          <tr style="border-bottom: 1px dashed #ccc;">
            <td style="padding: 4px 1px; text-align: center; vertical-align: top; font-size: 13pt; font-weight: 900; width: 30px;">
              ${item.quantity}x
            </td>
            <td style="padding: 4px 2px; text-align: left; vertical-align: top;">
              <div style="font-size: 11pt; font-weight: 900; text-transform: uppercase; color: #000;">${item.name}</div>
              ${item.notes ? `<div style="font-size: 8pt; font-weight: 800; color: #b91c1c; background: #fee2e2; border: 1px solid #f87171; padding: 2px 3px; border-radius: 2px; margin-top: 2px;">⚠️ NOTE: ${item.notes}</div>` : ''}
            </td>
          </tr>
        `,
        )
        .join('')

      return `
        <tr>
          <td colspan="2" style="padding: 4px 0 2px 0; font-size: 8.5pt; font-weight: 900; border-bottom: 1.5px solid #000; text-transform: uppercase;">
            --- KITCHEN ROUND ${roundNum} ---
          </td>
        </tr>
        ${rows}
      `
    })
    .join('')

  const totalQty = order.items.reduce((s, i) => s + (Number(i.quantity) || 1), 0)

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <title>KOT - ${order.tableName} - ${order.orderNumber}</title>
        <style>
          @page { margin: 0; size: auto; }
          * { box-sizing: border-box; margin: 0; padding: 0; }
          html, body { width: 100%; background: #fff; color: #000; }
          body {
            font-family: 'Consolas', 'Courier New', monospace;
            font-size: 9pt;
            color: #000;
            background: #fff;
            margin: 0 auto;
            padding: 2mm 3.5mm;
            width: 100%;
            max-width: 180px;
            text-align: center;
            overflow-x: hidden;
          }
          .header-box { border: 2px solid #000; padding: 3px; margin-bottom: 4px; border-radius: 3px; }
          .kot-title { font-size: 11pt; font-weight: 900; letter-spacing: 0.5px; }
          .table-title { font-size: 18pt; font-weight: 900; margin: 2px 0; background: #000; color: #fff; padding: 2px 4px; border-radius: 2px; }
          .info { text-align: left; font-size: 8pt; margin-bottom: 4px; line-height: 1.35; border-bottom: 1px dashed #000; padding-bottom: 3px; }
          table { width: 100%; border-collapse: collapse; margin: 4px 0; }
          .footer { margin-top: 6px; font-size: 9.5pt; font-weight: bold; border-top: 1.5px solid #000; padding-top: 4px; }
          @media print {
            html, body {
              margin: 0 auto !important;
              padding: 1.5mm 3mm !important;
              width: 100% !important;
              max-width: 172px !important;
            }
          }
        </style>
      </head>
      <body>
        <div class="header-box">
          <div class="kot-title">KITCHEN TICKET</div>
          <div class="table-title">TABLE ${order.tableName}</div>
          <div style="font-size: 8pt; font-weight: bold;">Sec: ${order.section || 'Dining'}</div>
        </div>

        <div class="info">
          <strong>Order #:</strong> ${order.orderNumber}<br/>
          <strong>Time:</strong> ${formatDateTime(new Date())}<br/>
          <strong>Waiter:</strong> ${order.waiterName || 'Staff'}<br/>
          ${order.notes ? `<strong>Note:</strong> ${order.notes}<br/>` : ''}
        </div>

        <table>
          <tbody>
            ${roundsHtml}
          </tbody>
        </table>

        <div class="footer">
          TOTAL ITEMS: ${totalQty}
        </div>

        <script>
          window.onload = function() {
            window.print();
            setTimeout(function() {
              window.close();
            }, 400);
          };
        </script>
      </body>
    </html>
  `

  printWindow.document.write(html)
  printWindow.document.close()
}

/** Print Dedicated Waiter / Captain Slip (for server to deliver food to tables) */
export async function printWaiterSlip(order: RestaurantOrder) {
  const printWindow = window.open('', '_blank', 'width=360,height=600')
  if (!printWindow) {
    alert('Please allow popups to print Waiter Slip')
    return
  }

  // Group items by round
  const roundsMap = new Map<number, typeof order.items>()
  order.items.forEach((item) => {
    const r = item.round || 1
    if (!roundsMap.has(r)) roundsMap.set(r, [])
    roundsMap.get(r)!.push(item)
  })

  const roundsHtml = Array.from(roundsMap.entries())
    .sort(([a], [b]) => a - b)
    .map(([roundNum, items]) => {
      const rows = items
        .map(
          (item) => `
          <tr style="border-bottom: 1px dashed #ccc;">
            <td style="padding: 3px 1px; text-align: center; vertical-align: top; font-size: 11pt; font-weight: 900; width: 26px;">
              ${item.quantity}x
            </td>
            <td style="padding: 3px 2px; text-align: left; vertical-align: top;">
              <div style="font-size: 9.5pt; font-weight: 800; color: #000;">${item.name}</div>
              ${item.notes ? `<div style="font-size: 7.5pt; color: #b45309; font-style: italic;">Note: ${item.notes}</div>` : ''}
            </td>
            <td style="padding: 3px 0; text-align: right; vertical-align: top; font-size: 8.5pt; font-weight: bold; white-space: nowrap;">
              ${formatMoney(item.price * item.quantity)}
            </td>
          </tr>
        `,
        )
        .join('')

      return `
        <tr>
          <td colspan="3" style="padding: 3px 0 1px 0; font-size: 8pt; font-weight: 900; border-bottom: 1px solid #000; text-transform: uppercase;">
            --- SERVING ROUND ${roundNum} ---
          </td>
        </tr>
        ${rows}
      `
    })
    .join('')

  const totalQty = order.items.reduce((s, i) => s + (Number(i.quantity) || 1), 0)

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <title>Waiter Slip - ${order.tableName} - ${order.orderNumber}</title>
        <style>
          @page { margin: 0; size: auto; }
          * { box-sizing: border-box; margin: 0; padding: 0; }
          html, body { width: 100%; background: #fff; color: #000; }
          body {
            font-family: 'Consolas', 'Courier New', monospace;
            font-size: 8.5pt;
            color: #000;
            background: #fff;
            margin: 0 auto;
            padding: 2mm 3.5mm;
            width: 100%;
            max-width: 180px;
            text-align: center;
            overflow-x: hidden;
          }
          .title { font-size: 12pt; font-weight: 900; text-transform: uppercase; letter-spacing: 0.3px; }
          .badge {
            display: inline-block;
            background: #1e293b;
            color: #fff;
            padding: 1px 5px;
            font-size: 7.5pt;
            font-weight: 900;
            border-radius: 3px;
            margin: 2px 0 3px 0;
            text-transform: uppercase;
          }
          .table-box {
            border: 1.5px solid #000;
            background: #f1f5f9;
            padding: 3px;
            margin-bottom: 4px;
            border-radius: 3px;
          }
          .table-name { font-size: 16pt; font-weight: 900; color: #000; }
          .info { text-align: left; font-size: 8pt; margin-bottom: 3px; line-height: 1.3; border-bottom: 1px dashed #000; padding-bottom: 3px; }
          table { width: 100%; border-collapse: collapse; margin: 3px 0; table-layout: fixed; }
          th, td { overflow: hidden; }
          .summary { border-top: 1px dashed #000; padding-top: 3px; margin-top: 4px; }
          .summary-row { display: flex; justify-content: space-between; font-size: 8.5pt; padding: 1px 0; }
          .total-row { display: flex; justify-content: space-between; font-size: 10pt; font-weight: 900; border-top: 1px solid #000; margin-top: 2px; padding-top: 2px; }
          .footer { margin-top: 6px; font-size: 8pt; font-weight: bold; border-top: 1px dashed #000; padding-top: 3px; }
          @media print {
            html, body {
              margin: 0 auto !important;
              padding: 1.5mm 3mm !important;
              width: 100% !important;
              max-width: 172px !important;
            }
          }
        </style>
      </head>
      <body>
        <div class="title">MILANO GARDEN</div>
        <div class="badge">WAITER SLIP</div>

        <div class="table-box">
          <div class="table-name">TABLE ${order.tableName}</div>
          <div style="font-size: 8pt; font-weight: bold; color: #475569;">Sec ${order.section || 'Main'}</div>
        </div>

        <div class="info">
          <strong>Order #:</strong> ${order.orderNumber}<br/>
          <strong>Waiter:</strong> ${order.waiterName || 'Staff'}<br/>
          <strong>Time:</strong> ${formatDateTime(new Date())}<br/>
          ${order.notes ? `<strong>Note:</strong> ${order.notes}<br/>` : ''}
        </div>

        <table>
          <thead>
            <tr style="border-bottom: 1px solid #000;">
              <th style="width: 18%; text-align: center; padding-bottom: 2px;">Qty</th>
              <th style="width: 48%; text-align: left; padding-bottom: 2px;">Item</th>
              <th style="width: 34%; text-align: right; padding-bottom: 2px;">Amount</th>
            </tr>
          </thead>
          <tbody>
            ${roundsHtml}
          </tbody>
        </table>

        <div class="summary">
          <div class="summary-row">
            <span>Total Items:</span>
            <strong>${totalQty}</strong>
          </div>
          <div class="total-row">
            <span>TOTAL:</span>
            <span>${formatMoney(order.total)}</span>
          </div>
        </div>

        <div class="footer">
          ⭐ Deliver to Table ${order.tableName} ⭐
        </div>

        <script>
          window.onload = function() {
            window.print();
            setTimeout(function() {
              window.close();
            }, 400);
          };
        </script>
      </body>
    </html>
  `

  printWindow.document.write(html)
  printWindow.document.close()
}
