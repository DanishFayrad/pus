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
      width: 1.45,
      height: 34,
      displayValue: true,
      fontSize: 9.5,
      font: 'Courier New',
      textMargin: 2,
      margin: 1,
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
      width: 75,
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
        <td style="padding: 3px 0; text-align: left; vertical-align: top; word-break: break-word;">
          ${item.name}
          ${'notes' in item && item.notes ? `<div style="font-size: 8px; color: #555; font-style: italic;">Note: ${item.notes}</div>` : ''}
        </td>
        <td style="padding: 3px 2px; text-align: right; vertical-align: top; white-space: nowrap;">
          ${item.quantity}x${formatMoney(item.price)}
        </td>
        <td style="padding: 3px 0; text-align: right; vertical-align: top; font-weight: bold; white-space: nowrap;">
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
          * { box-sizing: border-box; }
          body {
            font-family: 'Courier New', Courier, monospace;
            font-size: 9.5px;
            color: #000;
            background: #fff;
            margin: 0 auto;
            padding: 4px 6px;
            width: 100%;
            max-width: 205px;
            text-align: center;
          }
          .title { font-size: 14px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 1px; }
          .subtitle { font-size: 8.5px; color: #333; margin-bottom: 5px; }
          .info { text-align: left; font-size: 9px; margin-bottom: 4px; line-height: 1.35; }
          .table-badge {
            display: inline-block;
            background: #000;
            color: #fff;
            padding: 2px 6px;
            font-size: 10px;
            font-weight: bold;
            border-radius: 3px;
            margin-bottom: 5px;
          }
          .divider { border-top: 1px dashed #000; margin: 4px 0; }
          table { width: 100%; border-collapse: collapse; font-size: 9px; margin: 4px 0; table-layout: fixed; }
          .summary-row { display: flex; justify-content: space-between; font-size: 9.5px; padding: 1px 0; }
          .total-section {
            display: flex;
            justify-content: space-between;
            font-size: 12px;
            font-weight: bold;
            margin-top: 4px;
            padding-top: 4px;
            border-top: 1px dashed #000;
          }
          .barcode-box { margin-top: 6px; text-align: center; }
          .barcode-box img { max-width: 155px; height: auto; display: inline-block; }
          .footer { margin-top: 7px; font-size: 8.5px; line-height: 1.3; }
          @media print {
            body { margin: 0 auto; padding: 0 4px; max-width: 195px; width: 100%; }
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
          ${order.waiterName ? `<strong>Server:</strong> ${order.waiterName}<br/>` : ''}
          ${order.cashierName ? `<strong>Cashier:</strong> ${order.cashierName}<br/>` : ''}
          <strong>Payment:</strong> ${split?.paymentMethod || order.paymentMethod || 'Cash'}<br/>
        </div>

        <div class="divider"></div>

        <table>
          <thead>
            <tr>
              <th style="width: 44%; text-align: left; border-bottom: 1px solid #000; padding-bottom: 2px;">Item</th>
              <th style="width: 28%; text-align: right; border-bottom: 1px solid #000; padding-bottom: 2px;">Qty</th>
              <th style="width: 28%; text-align: right; border-bottom: 1px solid #000; padding-bottom: 2px;">Total</th>
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
          <span>TOTAL PAYABLE:</span>
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
            <td style="padding: 2.5px 0; text-align: left; vertical-align: top; word-break: break-word;">
              ${item.name}
              ${item.notes ? `<div style="font-size: 8px; color: #444; font-weight: bold;">[Note: ${item.notes}]</div>` : ''}
            </td>
            <td style="padding: 2.5px 2px; text-align: right; vertical-align: top; white-space: nowrap;">
              ${item.quantity}x${formatMoney(item.price)}
            </td>
            <td style="padding: 2.5px 0; text-align: right; vertical-align: top; font-weight: bold; white-space: nowrap;">
              ${formatMoney(item.price * item.quantity)}
            </td>
          </tr>
        `,
        )
        .join('')

      return `
        <tr>
          <td colspan="3" style="padding: 4px 0 2px 0; font-size: 9px; font-weight: bold; border-bottom: 1px dotted #000; text-transform: uppercase;">
            --- ORDER ROUND ${roundNum} ---
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
      <div style="font-weight: bold; font-size: 9.5px; text-align: left; margin: 3px 0;">SPLIT BILL BREAKDOWN:</div>
      ${order.splitBills
        .map(
          (sb) => `
        <div style="display: flex; justify-content: space-between; font-size: 9px; padding: 1px 0;">
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
          * { box-sizing: border-box; }
          body {
            font-family: 'Courier New', Courier, monospace;
            font-size: 9.5px;
            color: #000;
            background: #fff;
            margin: 0 auto;
            padding: 4px 6px;
            width: 100%;
            max-width: 205px;
            text-align: center;
          }
          .title { font-size: 14px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.5px; }
          .badge {
            display: inline-block;
            background: #111;
            color: #fff;
            padding: 2px 5px;
            font-size: 8.5px;
            font-weight: bold;
            border-radius: 3px;
            margin: 2px 0 4px 0;
            text-transform: uppercase;
          }
          .info { text-align: left; font-size: 9px; margin-bottom: 4px; line-height: 1.35; }
          .divider { border-top: 1px dashed #000; margin: 4px 0; }
          table { width: 100%; border-collapse: collapse; font-size: 9px; margin: 4px 0; table-layout: fixed; }
          .summary-row { display: flex; justify-content: space-between; font-size: 9.5px; padding: 1.5px 0; }
          .total-section {
            display: flex;
            justify-content: space-between;
            font-size: 12px;
            font-weight: bold;
            margin-top: 4px;
            padding-top: 4px;
            border-top: 1px dashed #000;
          }
          .footer { margin-top: 8px; font-size: 8.5px; line-height: 1.3; }
          @media print {
            body { margin: 0 auto; padding: 0 4px; max-width: 195px; width: 100%; }
          }
        </style>
      </head>
      <body>
        <div class="title">MILANO GARDEN</div>
        <div class="badge">ADMIN / CASHIER AUDIT SLIP</div>
        
        <div class="info">
          <strong>Table:</strong> ${order.tableName} (Section ${order.section})<br/>
          <strong>Order #:</strong> ${order.orderNumber}<br/>
          <strong>Opened:</strong> ${formatDateTime(order.createdAt)}<br/>
          <strong>Printed:</strong> ${formatDateTime(new Date())}<br/>
          <strong>Waiter:</strong> ${order.waiterName || 'Staff'}<br/>
          <strong>Cashier:</strong> ${order.cashierName || 'Cashier'}<br/>
          <strong>Status:</strong> ${order.status.toUpperCase()} (${order.paymentMethod || 'Cash'})<br/>
          ${order.notes ? `<strong>Order Note:</strong> ${order.notes}<br/>` : ''}
        </div>

        <div class="divider"></div>

        <table>
          <thead>
            <tr>
              <th style="width: 44%; text-align: left; border-bottom: 1px solid #000; padding-bottom: 2px;">Item</th>
              <th style="width: 28%; text-align: right; border-bottom: 1px solid #000; padding-bottom: 2px;">Qty</th>
              <th style="width: 28%; text-align: right; border-bottom: 1px solid #000; padding-bottom: 2px;">Total</th>
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
          <span>Discount (${order.discountType === 'percent' ? 'Percent' : 'Fixed'}):</span>
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
          <span>GRAND TOTAL:</span>
          <span>${formatMoney(order.total)}</span>
        </div>

        ${splitBillsHtml}

        <div class="divider"></div>

        <div class="barcode-box">
          ${barcodeImg ? `<img src="${barcodeImg}" alt="${order.orderNumber}" style="max-width: 155px; height: auto;" />` : ''}
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
          <tr style="border-bottom: 1px dashed #ddd;">
            <td style="padding: 6px 2px; text-align: left; vertical-align: top; font-size: 15px; font-weight: 900; width: 34px;">
              ${item.quantity}x
            </td>
            <td style="padding: 6px 2px; text-align: left; vertical-align: top;">
              <div style="font-size: 14px; font-weight: 900; text-transform: uppercase; color: #000;">${item.name}</div>
              ${item.notes ? `<div style="font-size: 11px; font-weight: 800; color: #b91c1c; background: #fee2e2; border: 1px solid #f87171; padding: 2px 4px; border-radius: 3px; margin-top: 3px;">⚠️ INSTRUCTION: ${item.notes}</div>` : ''}
            </td>
          </tr>
        `,
        )
        .join('')

      return `
        <tr>
          <td colspan="2" style="padding: 6px 0 3px 0; font-size: 10px; font-weight: 900; border-bottom: 2px solid #000; text-transform: uppercase; letter-spacing: 0.5px;">
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
          * { box-sizing: border-box; }
          body {
            font-family: 'Courier New', Courier, monospace;
            font-size: 11px;
            color: #000;
            background: #fff;
            margin: 0 auto;
            padding: 6px 8px;
            width: 100%;
            max-width: 220px;
            text-align: center;
          }
          .header-box { border: 2px solid #000; padding: 4px; margin-bottom: 6px; border-radius: 4px; }
          .kot-title { font-size: 15px; font-weight: 900; letter-spacing: 1px; }
          .table-title { font-size: 26px; font-weight: 900; margin: 2px 0; background: #000; color: #fff; padding: 3px 6px; border-radius: 3px; }
          .info { text-align: left; font-size: 10px; margin-bottom: 6px; line-height: 1.4; border-bottom: 1px dashed #000; padding-bottom: 4px; }
          table { width: 100%; border-collapse: collapse; margin: 6px 0; }
          .footer { margin-top: 10px; font-size: 11px; font-weight: bold; border-top: 2px solid #000; padding-top: 6px; }
          @media print {
            body { margin: 0 auto; padding: 0 4px; max-width: 210px; width: 100%; }
          }
        </style>
      </head>
      <body>
        <div class="header-box">
          <div class="kot-title">KITCHEN ORDER TICKET</div>
          <div class="table-title">TABLE ${order.tableName}</div>
          <div style="font-size: 10px; font-weight: bold;">Section: ${order.section || 'Dining'}</div>
        </div>

        <div class="info">
          <strong>Order #:</strong> ${order.orderNumber}<br/>
          <strong>Time:</strong> ${formatDateTime(new Date())}<br/>
          <strong>Server/Waiter:</strong> ${order.waiterName || 'Staff'}<br/>
          ${order.notes ? `<strong>Table Note:</strong> ${order.notes}<br/>` : ''}
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
          <tr style="border-bottom: 1px dashed #ddd;">
            <td style="padding: 5px 2px; text-align: left; vertical-align: top; font-size: 14px; font-weight: 900; width: 32px;">
              ${item.quantity}x
            </td>
            <td style="padding: 5px 2px; text-align: left; vertical-align: top;">
              <div style="font-size: 13px; font-weight: 800; color: #000;">${item.name}</div>
              ${item.notes ? `<div style="font-size: 10px; color: #b45309; font-style: italic;">Note: ${item.notes}</div>` : ''}
            </td>
            <td style="padding: 5px 0; text-align: right; vertical-align: top; font-size: 11px; font-weight: bold; white-space: nowrap;">
              ${formatMoney(item.price * item.quantity)}
            </td>
          </tr>
        `,
        )
        .join('')

      return `
        <tr>
          <td colspan="3" style="padding: 5px 0 2px 0; font-size: 9.5px; font-weight: 900; border-bottom: 1.5px solid #000; text-transform: uppercase;">
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
          * { box-sizing: border-box; }
          body {
            font-family: 'Courier New', Courier, monospace;
            font-size: 10px;
            color: #000;
            background: #fff;
            margin: 0 auto;
            padding: 5px 7px;
            width: 100%;
            max-width: 215px;
            text-align: center;
          }
          .title { font-size: 14px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.5px; }
          .badge {
            display: inline-block;
            background: #1e293b;
            color: #fff;
            padding: 2px 6px;
            font-size: 9px;
            font-weight: 900;
            border-radius: 3px;
            margin: 2px 0 5px 0;
            text-transform: uppercase;
            letter-spacing: 0.5px;
          }
          .table-box {
            border: 2px solid #000;
            background: #f1f5f9;
            padding: 4px;
            margin-bottom: 5px;
            border-radius: 4px;
          }
          .table-name { font-size: 22px; font-weight: 900; color: #000; }
          .info { text-align: left; font-size: 9.5px; margin-bottom: 5px; line-height: 1.35; border-bottom: 1px dashed #000; padding-bottom: 4px; }
          table { width: 100%; border-collapse: collapse; margin: 4px 0; }
          .summary { border-top: 1px dashed #000; padding-top: 4px; margin-top: 5px; }
          .summary-row { display: flex; justify-content: space-between; font-size: 10px; padding: 1.5px 0; }
          .total-row { display: flex; justify-content: space-between; font-size: 13px; font-weight: 900; border-top: 1px solid #000; margin-top: 3px; padding-top: 3px; }
          .footer { margin-top: 8px; font-size: 9px; font-weight: bold; border-top: 1px dashed #000; padding-top: 4px; }
          @media print {
            body { margin: 0 auto; padding: 0 4px; max-width: 205px; width: 100%; }
          }
        </style>
      </head>
      <body>
        <div class="title">MILANO GARDEN</div>
        <div class="badge">WAITER / SERVER SLIP</div>

        <div class="table-box">
          <div class="table-name">TABLE ${order.tableName}</div>
          <div style="font-size: 10px; font-weight: bold; color: #475569;">Section ${order.section || 'Main'}</div>
        </div>

        <div class="info">
          <strong>Order #:</strong> ${order.orderNumber}<br/>
          <strong>Waiter:</strong> ${order.waiterName || 'Staff'}<br/>
          <strong>Time:</strong> ${formatDateTime(new Date())}<br/>
          ${order.notes ? `<strong>Order Note:</strong> ${order.notes}<br/>` : ''}
        </div>

        <table>
          <thead>
            <tr style="border-bottom: 1.5px solid #000;">
              <th style="width: 18%; text-align: left; padding-bottom: 2px;">Qty</th>
              <th style="width: 54%; text-align: left; padding-bottom: 2px;">Item Name</th>
              <th style="width: 28%; text-align: right; padding-bottom: 2px;">Amount</th>
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
            <span>TOTAL BILL:</span>
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

