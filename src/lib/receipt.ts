import JsBarcode from 'jsbarcode'
import QRCode from 'qrcode'
import type { Sale } from '../types'
import { formatMoney } from './currency'
import { formatDateTime } from './datetime'

/** Generate Barcode Data URL via in-memory canvas */
function generateBarcode(text: string): string {
  if (typeof document === 'undefined') return ''
  try {
    const canvas = document.createElement('canvas')
    JsBarcode(canvas, text, {
      format: 'CODE128',
      width: 1.8,
      height: 38,
      displayValue: true,
      fontSize: 11,
      font: 'Courier New',
      textMargin: 2,
      margin: 2,
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

export async function printReceipt(sale: Sale) {
  const printWindow = window.open('', '_blank', 'width=340,height=600')
  if (!printWindow) {
    alert('Please allow popups to print receipts')
    return
  }

  const invoiceBarcodeText = `INV-${sale.id.slice(-8).toUpperCase()}`
  const barcodeImg = generateBarcode(invoiceBarcodeText)
  const qrImg = await generateQRCode(`INV:${sale.id}`)

  const itemsHtml = sale.items
    .map(
      (item) => `
      <tr>
        <td style="padding: 3px 0; text-align: left; vertical-align: top; word-break: break-word;">${item.name}</td>
        <td style="padding: 3px 2px; text-align: right; vertical-align: top; white-space: nowrap;">${item.quantity}x${formatMoney(item.price)}</td>
        <td style="padding: 3px 0; text-align: right; vertical-align: top; font-weight: bold; white-space: nowrap;">${formatMoney(item.price * item.quantity)}</td>
      </tr>
    `
    )
    .join('')

  const customerHtml =
    sale.paymentMethod === 'credit' && sale.customerName
      ? `
      <div style="border-top: 1px dashed #000; padding: 5px 0; font-size: 10px; text-align: left; line-height: 1.3;">
        <strong>Customer:</strong> ${sale.customerName}<br/>
        ${sale.customerPhone ? `<strong>Phone:</strong> ${sale.customerPhone}<br/>` : ''}
        <strong>Account:</strong> Credit
      </div>
    `
      : ''

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <title>Receipt - ${sale.id.slice(-8).toUpperCase()}</title>
        <style>
          @page {
            margin: 0;
            size: auto;
          }
          * {
            box-sizing: border-box;
          }
          body {
            font-family: 'Courier New', Courier, monospace;
            font-size: 11px;
            color: #000;
            background: #fff;
            margin: 0 auto;
            padding: 4px 10px;
            width: 100%;
            max-width: 225px;
            text-align: center;
          }
          .title {
            font-size: 17px;
            font-weight: 900;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            margin-bottom: 2px;
          }
          .subtitle {
            font-size: 9.5px;
            color: #333;
            margin-bottom: 6px;
          }
          .info {
            text-align: left;
            font-size: 10.5px;
            margin-bottom: 6px;
            line-height: 1.35;
          }
          .divider {
            border-top: 1px dashed #000;
            margin: 5px 0;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            font-size: 10px;
            margin: 5px 0;
            table-layout: fixed;
          }
          th, td {
            overflow: hidden;
          }
          .total-section {
            display: flex;
            justify-content: space-between;
            font-size: 13px;
            font-weight: bold;
            margin-top: 6px;
            padding-top: 5px;
            border-top: 1px dashed #000;
          }
          .barcode-box {
            margin-top: 8px;
            text-align: center;
          }
          .barcode-box img {
            max-width: 185px;
            height: auto;
            display: inline-block;
          }
          .footer {
            margin-top: 8px;
            font-size: 9.5px;
            line-height: 1.35;
          }
          @media print {
            body {
              margin: 0 auto;
              padding: 2px 8px;
              max-width: 220px;
              width: 100%;
            }
          }
        </style>
      </head>
      <body>
        <div class="title">MILANO GARDEN</div>
        <div class="subtitle">Restaurant & Cafe</div>
        
        <div class="info">
          <strong>Receipt:</strong> #${sale.id.slice(-8).toUpperCase()}<br/>
          <strong>Date:</strong> ${formatDateTime(sale.date)}<br/>
          <strong>Cashier:</strong> ${sale.cashierName}<br/>
          <strong>Mode:</strong> ${sale.paymentMethod === 'credit' ? 'Credit' : 'Cash'}<br/>
        </div>

        <div class="divider"></div>

        <table>
          <thead>
            <tr>
              <th style="width: 44%; text-align: left; border-bottom: 1px solid #000; padding-bottom: 3px;">Item</th>
              <th style="width: 28%; text-align: right; border-bottom: 1px solid #000; padding-bottom: 3px;">Qty</th>
              <th style="width: 28%; text-align: right; border-bottom: 1px solid #000; padding-bottom: 3px;">Total</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHtml}
          </tbody>
        </table>

        ${customerHtml}

        <div class="total-section">
          <span>TOTAL BILL:</span>
          <span>${formatMoney(sale.total)}</span>
        </div>

        <div class="divider"></div>

        <div class="barcode-box">
          ${barcodeImg ? `<img src="${barcodeImg}" alt="${invoiceBarcodeText}" />` : `<strong>${invoiceBarcodeText}</strong>`}
        </div>

        <div class="footer">
          Scan barcode above for returns / lookup<br/>
          Thank you for visiting Milano Garden!
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

/** Print dedicated Return / Refund Slip */
export async function printReturnReceipt(ret: {
  receiptNo: string
  date: string | Date
  cashierName: string
  customerName?: string
  paymentMethod?: string
  items: { productName: string; quantity: number; price: number; refund: number }[]
  totalRefund: number
}) {
  const printWindow = window.open('', '_blank', 'width=340,height=600')
  if (!printWindow) {
    alert('Please allow popups to print receipts')
    return
  }

  const barcodeImg = generateBarcode(`RET-${ret.receiptNo.replace('#', '')}`)

  const itemsHtml = ret.items
    .map(
      (item) => `
      <tr>
        <td style="padding: 3px 0; text-align: left; vertical-align: top; word-break: break-word;">${item.productName}</td>
        <td style="padding: 3px 2px; text-align: right; vertical-align: top; white-space: nowrap;">${item.quantity}x${formatMoney(item.price)}</td>
        <td style="padding: 3px 0; text-align: right; vertical-align: top; font-weight: bold; white-space: nowrap;">-${formatMoney(item.refund)}</td>
      </tr>
    `
    )
    .join('')

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <title>Return Slip - ${ret.receiptNo}</title>
        <style>
          @page { margin: 0; size: auto; }
          * { box-sizing: border-box; }
          body {
            font-family: 'Courier New', Courier, monospace;
            font-size: 11px;
            color: #000;
            background: #fff;
            margin: 0 auto;
            padding: 4px 10px;
            width: 100%;
            max-width: 225px;
            text-align: center;
          }
          .title { font-size: 17px; font-weight: 900; text-transform: uppercase; }
          .badge {
            display: inline-block;
            background: #000;
            color: #fff;
            padding: 2px 6px;
            font-size: 10px;
            font-weight: bold;
            border-radius: 3px;
            margin: 3px 0 6px 0;
          }
          .info { text-align: left; font-size: 10.5px; margin-bottom: 6px; line-height: 1.35; }
          .divider { border-top: 1px dashed #000; margin: 5px 0; }
          table { width: 100%; border-collapse: collapse; font-size: 10px; margin: 5px 0; table-layout: fixed; }
          .total-section {
            display: flex;
            justify-content: space-between;
            font-size: 13px;
            font-weight: bold;
            margin-top: 6px;
            padding-top: 5px;
            border-top: 1px dashed #000;
          }
          .barcode-box { margin-top: 8px; text-align: center; }
          .barcode-box img { max-width: 185px; height: auto; }
          .footer { margin-top: 8px; font-size: 9.5px; line-height: 1.35; }
          @media print {
            body { margin: 0 auto; padding: 2px 8px; max-width: 220px; width: 100%; }
          }
        </style>
      </head>
      <body>
        <div class="title">MILANO GARDEN</div>
        <div class="badge">RETURN / REFUND SLIP</div>
        
        <div class="info">
          <strong>Orig Invoice:</strong> ${ret.receiptNo}<br/>
          <strong>Date:</strong> ${formatDateTime(ret.date)}<br/>
          <strong>Cashier:</strong> ${ret.cashierName}<br/>
          ${ret.customerName ? `<strong>Customer:</strong> ${ret.customerName}<br/>` : ''}
          <strong>Refund Mode:</strong> Cash Refund<br/>
        </div>

        <div class="divider"></div>

        <table>
          <thead>
            <tr>
              <th style="width: 44%; text-align: left; border-bottom: 1px solid #000; padding-bottom: 3px;">Item</th>
              <th style="width: 28%; text-align: right; border-bottom: 1px solid #000; padding-bottom: 3px;">Qty</th>
              <th style="width: 28%; text-align: right; border-bottom: 1px solid #000; padding-bottom: 3px;">Refund</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHtml}
          </tbody>
        </table>

        <div class="total-section">
          <span>TOTAL REFUNDED:</span>
          <span>${formatMoney(ret.totalRefund)}</span>
        </div>

        <div class="divider"></div>

        <div class="barcode-box">
          ${barcodeImg ? `<img src="${barcodeImg}" alt="RET-${ret.receiptNo}" />` : ''}
        </div>

        <div class="footer">
          Items returned to inventory.<br/>
          Customer Signature: ______________
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

/** Print dedicated Vendor / Counter Closing Slip */
export function printVendorClosingSlip(closing: {
  vendorName: string
  dateRangeLabel: string
  generatedBy: string
  items: { name: string; quantity: number; revenue: number }[]
  totalQty: number
  totalRevenue: number
  totalCash: number
  totalCredit: number
}) {
  const printWindow = window.open('', '_blank', 'width=340,height=600')
  if (!printWindow) {
    alert('Please allow popups to print closing slips')
    return
  }

  const itemsHtml = closing.items
    .map(
      (item) => `
      <tr>
        <td style="padding: 3px 0; text-align: left; vertical-align: top; word-break: break-word;">${item.name}</td>
        <td style="padding: 3px 2px; text-align: right; vertical-align: top; white-space: nowrap;">${item.quantity}</td>
        <td style="padding: 3px 0; text-align: right; vertical-align: top; font-weight: bold; white-space: nowrap;">${formatMoney(item.revenue)}</td>
      </tr>
    `
    )
    .join('')

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <title>Closing Slip - ${closing.vendorName}</title>
        <style>
          @page { margin: 0; size: auto; }
          * { box-sizing: border-box; }
          body {
            font-family: 'Courier New', Courier, monospace;
            font-size: 11px;
            color: #000;
            background: #fff;
            margin: 0 auto;
            padding: 4px 10px;
            width: 100%;
            max-width: 225px;
            text-align: center;
          }
          .title { font-size: 17px; font-weight: 900; text-transform: uppercase; }
          .vendor-title {
            font-size: 13px;
            font-weight: bold;
            background: #000;
            color: #fff;
            padding: 3px;
            margin: 4px 0 6px 0;
            border-radius: 3px;
            text-transform: uppercase;
          }
          .info { text-align: left; font-size: 10.5px; margin-bottom: 5px; line-height: 1.35; }
          .divider { border-top: 1px dashed #000; margin: 5px 0; }
          table { width: 100%; border-collapse: collapse; font-size: 10px; margin: 5px 0; table-layout: fixed; }
          .summary-row {
            display: flex;
            justify-content: space-between;
            font-size: 11px;
            padding: 2px 0;
          }
          .total-section {
            display: flex;
            justify-content: space-between;
            font-size: 13px;
            font-weight: bold;
            margin-top: 5px;
            padding-top: 5px;
            border-top: 1px dashed #000;
          }
          .footer { margin-top: 10px; font-size: 9.5px; line-height: 1.35; }
          @media print {
            body { margin: 0 auto; padding: 2px 8px; max-width: 220px; width: 100%; }
          }
        </style>
      </head>
      <body>
        <div class="title">MILANO GARDEN</div>
        <div class="vendor-title">${closing.vendorName} CLOSING</div>
        
        <div class="info">
          <strong>Period:</strong> ${closing.dateRangeLabel}<br/>
          <strong>Printed:</strong> ${formatDateTime(new Date())}<br/>
          <strong>User:</strong> ${closing.generatedBy}<br/>
        </div>

        <div class="divider"></div>

        <div style="font-weight: bold; font-size: 10px; text-align: left; margin-bottom: 3px;">ITEM SALES:</div>
        <table>
          <thead>
            <tr>
              <th style="width: 44%; text-align: left; border-bottom: 1px solid #000; padding-bottom: 2px;">Item</th>
              <th style="width: 28%; text-align: right; border-bottom: 1px solid #000; padding-bottom: 2px;">Qty</th>
              <th style="width: 28%; text-align: right; border-bottom: 1px solid #000; padding-bottom: 2px;">Total</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHtml || '<tr><td colspan="3" style="text-align:center; padding:6px;">No sales</td></tr>'}
          </tbody>
        </table>

        <div class="divider"></div>

        <div class="summary-row">
          <span>Units Sold:</span>
          <strong>${closing.totalQty}</strong>
        </div>
        <div class="summary-row">
          <span>Cash:</span>
          <span>${formatMoney(closing.totalCash)}</span>
        </div>
        <div class="summary-row">
          <span>Credit:</span>
          <span>${formatMoney(closing.totalCredit)}</span>
        </div>

        <div class="total-section">
          <span>NET SALE:</span>
          <span>${formatMoney(closing.totalRevenue)}</span>
        </div>

        <div class="divider"></div>

        <div class="footer">
          Vendor Signature: ______________<br/>
          Verified by Manager / Admin
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
