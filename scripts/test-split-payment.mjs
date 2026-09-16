// scripts/test-split-payment.mjs
const baseUrl = 'http://localhost:3000';

async function testSplitPayment() {
  console.log('--- STARTING SPLIT BILL APPROVAL & PAYMENT TEST ---');

  // 1. Admin login
  console.log('\n[1] Logging in as admin...');
  const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'admin123' }),
  });
  const cookie = loginRes.headers.get('set-cookie');
  const headers = {
    'Content-Type': 'application/json',
    ...(cookie ? { Cookie: cookie.split(';')[0] } : {}),
  };
  console.log('Admin login OK!');

  // 2. Find Table A2
  const tablesRes = await fetch(`${baseUrl}/api/restaurant/tables`, { headers });
  const tablesData = await tablesRes.json();
  const tableA2 = tablesData.tables.find((t) => t.tableNumber === 'A2');
  console.log(`\n[2] Found Table ${tableA2.tableNumber} (Current status: ${tableA2.status})`);

  // 3. Place order with 2 teas and 1 karahi
  const menuRes = await fetch(`${baseUrl}/api/restaurant/menu`, { headers });
  const menuData = await menuRes.json();
  const tea = menuData.items.find((i) => i.name.toLowerCase().includes('tea'));
  const karahi = menuData.items.find((i) => i.name.toLowerCase().includes('karahi') || i.price > 500) || menuData.items[1];

  console.log(`Selected Items: 2x ${tea.name} (Rs ${tea.price}) & 1x ${karahi.name} (Rs ${karahi.price})`);

  const createOrderRes = await fetch(`${baseUrl}/api/restaurant/orders`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      tableId: tableA2.id,
      tableNumber: tableA2.tableNumber,
      items: [
        { productId: tea.id, name: tea.name, category: tea.category, price: tea.price, quantity: 2, round: 1 },
        { productId: karahi.id, name: karahi.name, category: karahi.category, price: karahi.price, quantity: 1, round: 1 },
      ],
    }),
  });
  const createData = await createOrderRes.json();
  const orderId = createData.order.id;
  const expectedTotal = tea.price * 2 + karahi.price;
  console.log(`Order created ID ${orderId}, Total: Rs ${createData.order.total} (Expected: ${expectedTotal})`);

  // 4. Split Bill: Bill 1 = Teas, Bill 2 = Karahi
  console.log('\n[4] Creating 2 separate bills for products...');
  const splitRes = await fetch(`${baseUrl}/api/restaurant/orders/${orderId}/split`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      splits: [
        {
          label: 'Bill #1 (Teas)',
          items: [{ name: tea.name, price: tea.price, quantity: 2 }],
        },
        {
          label: 'Bill #2 (Food)',
          items: [{ name: karahi.name, price: karahi.price, quantity: 1 }],
        },
      ],
    }),
  });
  const splitData = await splitRes.json();
  console.log('Split bills created:', splitData.order.splitBills.map((sb) => `${sb.label}: Rs ${sb.total} [${sb.status}]`));

  // 5. Admin approves and pays Bill #1 ONLY
  console.log('\n[5] Admin approves payment for Bill #1 (Teas) with CASH...');
  const paySplit1Res = await fetch(`${baseUrl}/api/restaurant/orders/${orderId}/pay`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ splitNumber: 1, paymentMethod: 'cash' }),
  });
  const paySplit1Data = await paySplit1Res.json();
  console.log('Bill #1 Payment Result:');
  console.log(' - Bill #1 status:', paySplit1Data.order.splitBills[0].status, `(${paySplit1Data.order.splitBills[0].paymentMethod})`);
  console.log(' - Bill #2 status:', paySplit1Data.order.splitBills[1].status);
  console.log(' - Order overall status:', paySplit1Data.order.status);
  console.log(' - Table active remaining total:', paySplit1Data.table?.activeOrderTotal);
  console.log(' - Table status:', paySplit1Data.table?.status);

  if (paySplit1Data.order.splitBills[0].status !== 'paid' || paySplit1Data.order.splitBills[1].status !== 'unpaid') {
    throw new Error('Verification failed: Bill #1 should be paid and Bill #2 should be unpaid!');
  }
  if (paySplit1Data.table?.activeOrderTotal !== karahi.price) {
    throw new Error(`Verification failed: Expected remaining table total ${karahi.price}, got ${paySplit1Data.table?.activeOrderTotal}`);
  }
  console.log('PASS: Individual split bill payment verified! Remaining balance is tracked accurately.');

  // 6. Admin approves and pays Bill #2 (Food) with CARD
  console.log('\n[6] Admin approves payment for Bill #2 (Food) with CARD...');
  const paySplit2Res = await fetch(`${baseUrl}/api/restaurant/orders/${orderId}/pay`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ splitNumber: 2, paymentMethod: 'card' }),
  });
  const paySplit2Data = await paySplit2Res.json();
  console.log('Bill #2 Payment Result:');
  console.log(' - Bill #2 status:', paySplit2Data.order.splitBills[1].status, `(${paySplit2Data.order.splitBills[1].paymentMethod})`);
  console.log(' - Order overall status:', paySplit2Data.order.status);
  console.log(' - All settled flag:', paySplit2Data.allSettled);
  console.log(' - Table final status:', paySplit2Data.table?.status);
  console.log(' - Table active total:', paySplit2Data.table?.activeOrderTotal);

  if (!paySplit2Data.allSettled || paySplit2Data.order.status !== 'paid' || paySplit2Data.table?.status !== 'cleaning') {
    throw new Error('Verification failed: All bills should now be paid and table moved to cleaning!');
  }
  console.log('PASS: Full settlement upon all splits paid verified!');

  // 7. Clean table
  console.log('\n[7] Cleaning Table A2 back to available...');
  await fetch(`${baseUrl}/api/restaurant/tables/${tableA2.id}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ status: 'available' }),
  });
  console.log('Table A2 reset to available.');

  console.log('\n================================================================');
  console.log('>>> ALL SEPARATE BILL APPROVAL & PAYMENT TESTS PASSED! <<<');
  console.log('================================================================\n');
}

testSplitPayment().catch((err) => {
  console.error('Test Failed:', err);
  process.exit(1);
});
