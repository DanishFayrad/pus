import type { Sale } from '../types'
import { formatMoney } from './currency'
import { formatDateTime } from './datetime'

export function printReceipt(sale: Sale) {
  const printWindow = window.open('', '_blank', 'width=350,height=600')
  if (!printWindow) {
    alert('Please allow popups to print receipts')
    return
  }

  const itemsHtml = sale.items
    .map(
      (item) => `
      <tr>
        <td style="padding: 4px 0; text-align: left; vertical-align: top;">${item.name}</td>
        <td style="padding: 4px 0; text-align: right; vertical-align: top; white-space: nowrap;">${item.quantity} x ${formatMoney(item.price)}</td>
        <td style="padding: 4px 0; text-align: right; vertical-align: top; font-weight: bold; white-space: nowrap;">${formatMoney(item.price * item.quantity)}</td>
      </tr>
    `
    )
    .join('')

  const customerHtml =
    sale.paymentMethod === 'credit' && sale.customerName
      ? `
      <div style="border-top: 1px dashed #000; padding: 8px 0; font-size: 11px; text-align: left; line-height: 1.4;">
        <strong>Customer:</strong> ${sale.customerName}<br/>
        ${sale.customerPhone ? `<strong>Phone:</strong> ${sale.customerPhone}<br/>` : ''}
        <strong>Account:</strong> Credit (Udhar)
      </div>
    `
      : ''

  const html = `
    <html>
      <head>
        <title>Receipt - ${sale.id.slice(-8)}</title>
        <style>
          @page {
            margin: 0;
          }
          body {
            font-family: 'Courier New', Courier, monospace;
            font-size: 12px;
            color: #000;
            background: #fff;
            margin: 0;
            padding: 15px;
            width: 280px;
            text-align: center;
          }
          .title {
            font-size: 18px;
            font-weight: bold;
            text-transform: uppercase;
            letter-spacing: 1px;
            margin-bottom: 2px;
          }
          .subtitle {
            font-size: 10px;
            color: #555;
            margin-bottom: 12px;
          }
          .info {
            text-align: left;
            font-size: 11px;
            margin-bottom: 10px;
            line-height: 1.4;
          }
          .divider {
            border-top: 1px dashed #000;
            margin: 8px 0;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            font-size: 11px;
            margin: 8px 0;
          }
          .total-section {
            display: flex;
            justify-content: space-between;
            font-size: 14px;
            font-weight: bold;
            margin-top: 10px;
            padding-top: 6px;
            border-top: 1px dashed #000;
          }
          .footer {
            margin-top: 20px;
            font-size: 10px;
            font-style: italic;
          }
          @media print {
            body {
              padding: 5px;
            }
          }
        </style>
      </head>
      <body>
        <div class="title">SalesPoint</div>
        <div class="subtitle">General Store & Retail POS</div>
        
        <div class="info">
          <strong>Receipt:</strong> #${sale.id.slice(-8)}<br/>
          <strong>Date:</strong> ${formatDateTime(sale.date)}<br/>
          <strong>Cashier:</strong> ${sale.cashierName}<br/>
          <strong>Mode:</strong> ${sale.paymentMethod === 'credit' ? 'Credit (Udhar)' : 'Cash'}<br/>
        </div>

        <div class="divider"></div>

        <table>
          <thead>
            <tr>
              <th style="text-align: left; border-bottom: 1px solid #000; padding-bottom: 4px;">Item</th>
              <th style="text-align: right; border-bottom: 1px solid #000; padding-bottom: 4px;">Qty</th>
              <th style="text-align: right; border-bottom: 1px solid #000; padding-bottom: 4px;">Total</th>
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

        <div class="footer">
          Thank you for shopping!<br/>
          Phir Tashreef Layein!
        </div>

        <script>
          window.onload = function() {
            window.print();
            setTimeout(function() {
              window.close();
            }, 300);
          };
        </script>
      </body>
    </html>
  `

  printWindow.document.write(html)
  printWindow.document.close()
}
