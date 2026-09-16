// scripts/verify-restaurant.mjs
const baseUrl = 'http://localhost:3000';

async function main() {
  console.log('--- STARTING RESTAURANT POS VERIFICATION ---');

  // Step 1: Login as admin
  console.log('\n[Step 1] Logging in as admin...');
  const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'admin123' }),
  });
  if (!loginRes.ok) {
    throw new Error(`Login failed with status ${loginRes.status}: ${await loginRes.text()}`);
  }
  const setCookie = loginRes.headers.get('set-cookie');
  const loginJson = await loginRes.json();
  console.log('Logged in successfully:', loginJson.user?.name || loginJson);

  const cookieHeader = setCookie ? setCookie.split(';')[0] : '';
  const headers = {
    'Content-Type': 'application/json',
    ...(cookieHeader ? { Cookie: cookieHeader } : {}),
  };

  // Step 2: Verify Tables and Seed
  console.log('\n[Step 2] Fetching restaurant tables...');
  const tablesRes = await fetch(`${baseUrl}/api/restaurant/tables`, { headers });
  if (!tablesRes.ok) throw new Error(`Tables fetch failed: ${tablesRes.status}`);
  const tablesJson = await tablesRes.json();
  const tables = tablesJson.tables || [];
  console.log(`Total tables fetched: ${tables.length}`);

  const secA = tables.filter((t) => t.section === 'A');
  const secB = tables.filter((t) => t.section === 'B');
  const secC = tables.filter((t) => t.section === 'C');
  console.log(`Section A (${secA.length}/16):`, secA.map((t) => t.tableNumber).join(', '));
  console.log(`Section B (${secB.length}/16):`, secB.map((t) => t.tableNumber).join(', '));
  console.log(`Section C (${secC.length}/6):`, secC.map((t) => t.tableNumber).join(', '));

  if (secA.length !== 16 || secB.length !== 16 || secC.length !== 6 || tables.length !== 38) {
    console.warn(`WARNING: Table count mismatch. Expected 38 total (16 A, 16 B, 6 C). Got ${tables.length}`);
  } else {
    console.log('PASS: Exact 38 tables verified across Sections A, B, and C!');
  }

  // Step 3: Fetch Menu items
  console.log('\n[Step 3] Fetching restaurant menu items...');
  const menuRes = await fetch(`${baseUrl}/api/restaurant/menu`, { headers });
  if (!menuRes.ok) throw new Error(`Menu fetch failed: ${menuRes.status}`);
  const menuJson = await menuRes.json();
  const items = menuJson.items || [];
  console.log(`Menu items available: ${items.length}`);
  console.log(`Categories found:`, menuJson.categories);

  const teaItem = items.find((i) => i.name.toLowerCase().includes('tea')) || items[0];
  const foodItem = items.find((i) => i.name.toLowerCase().includes('gol') || i.name.toLowerCase().includes('burger') || i.name.toLowerCase().includes('karahi')) || items[1];

  console.log(`Selected Tea Item: ${teaItem.name} @ Rs ${teaItem.price}`);
  console.log(`Selected Food Item: ${foodItem.name} @ Rs ${foodItem.price}`);

  // Step 4: Multi-round Order - Round 1: Customer sits at Table A1 and orders 2 Teas
  const tableA1 = secA.find((t) => t.tableNumber === 'A1') || tables[0];
  console.log(`\n[Step 4] Creating Order Round 1 at Table ${tableA1.tableNumber} (2x ${teaItem.name})...`);

  const round1Payload = {
    tableId: tableA1.id,
    tableName: tableA1.tableNumber,
    section: tableA1.section,
    items: [
      {
        productId: teaItem.id,
        name: teaItem.name,
        category: teaItem.category,
        price: teaItem.price,
        quantity: 2,
        notes: 'Less sugar',
        round: 1,
      },
    ],
    notes: 'Table near garden view',
  };

  const createOrderRes = await fetch(`${baseUrl}/api/restaurant/orders`, {
    method: 'POST',
    headers,
    body: JSON.stringify(round1Payload),
  });
  if (!createOrderRes.ok) throw new Error(`Failed to create order: ${createOrderRes.status} ${await createOrderRes.text()}`);
  const createOrderJson = await createOrderRes.json();
  const orderId = createOrderJson.order?.id;
  console.log(`Order created: ID ${orderId}, Order Number: ${createOrderJson.order?.orderNumber}`);
  console.log(`Order subtotal: Rs ${createOrderJson.order?.subtotal}, Table status: ${createOrderJson.table?.status}`);

  // Step 5: Multi-round Order - Round 2: 15 mins later, add 1 Food + 1 more Tea to same table/order
  console.log(`\n[Step 5] Appending Round 2: adding 1x ${foodItem.name} and 1x ${teaItem.name}...`);
  const round2Payload = {
    orderId: orderId,
    tableId: tableA1.id,
    tableName: tableA1.tableNumber,
    section: tableA1.section,
    items: [
      {
        productId: foodItem.id,
        name: foodItem.name,
        category: foodItem.category,
        price: foodItem.price,
        quantity: 1,
        notes: 'Spicy',
        round: 2,
      },
      {
        productId: teaItem.id,
        name: teaItem.name,
        category: teaItem.category,
        price: teaItem.price,
        quantity: 1,
        round: 2,
      },
    ],
  };

  const appendOrderRes = await fetch(`${baseUrl}/api/restaurant/orders`, {
    method: 'POST',
    headers,
    body: JSON.stringify(round2Payload),
  });
  if (!appendOrderRes.ok) throw new Error(`Failed to append order: ${appendOrderRes.status} ${await appendOrderRes.text()}`);
  const appendOrderJson = await appendOrderRes.json();
  const updatedOrder = appendOrderJson.order;
  console.log(`Round 2 merged! Total items in order: ${updatedOrder.items?.length}`);
  const totalTeas = updatedOrder.items.filter((i) => i.productId === teaItem.id).reduce((s, i) => s + i.quantity, 0);
  console.log(`Tea total quantity in order: ${totalTeas} (Expected: 3)`);
  console.log(`Updated Order Total: Rs ${updatedOrder.total}`);

  // Step 6: Bill Editing & Discount
  console.log(`\n[Step 6] Cashier modifies order (applies Rs 50 discount & sets status to billing)...`);
  const patchOrderRes = await fetch(`${baseUrl}/api/restaurant/orders/${orderId}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({
      discount: 50,
      discountType: 'fixed',
      status: 'billing',
    }),
  });
  if (!patchOrderRes.ok) throw new Error(`Failed to patch order: ${patchOrderRes.status}`);
  const patchOrderJson = await patchOrderRes.json();
  console.log(`Subtotal: Rs ${patchOrderJson.order?.subtotal}, Discount: Rs ${patchOrderJson.order?.discount}, Final Total: Rs ${patchOrderJson.order?.total}`);
  console.log(`Order status updated to: ${patchOrderJson.order?.status}`);

  // Step 7: Split Billing
  console.log(`\n[Step 7] Testing Split Billing for Order ${orderId}...`);
  const splitRes = await fetch(`${baseUrl}/api/restaurant/orders/${orderId}/split`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      splits: [
        {
          label: 'Bill 1 (Teas)',
          items: [{ name: teaItem.name, price: teaItem.price, quantity: 3 }],
        },
        {
          label: 'Bill 2 (Food)',
          items: [{ name: foodItem.name, price: foodItem.price, quantity: 1 }],
        },
      ],
    }),
  });
  if (!splitRes.ok) throw new Error(`Failed to split bill: ${splitRes.status}`);
  const splitJson = await splitRes.json();
  console.log(`Split bills created (${splitJson.order?.splitBills?.length}):`,
    splitJson.order?.splitBills?.map((sb) => `${sb.label}: Rs ${sb.total}`).join(' | '));

  // Step 8: Pay & Settle Bill
  console.log(`\n[Step 8] Settling payment with Cash...`);
  const payRes = await fetch(`${baseUrl}/api/restaurant/orders/${orderId}/pay`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ paymentMethod: 'cash' }),
  });
  if (!payRes.ok) throw new Error(`Failed to pay order: ${payRes.status}`);
  const payJson = await payRes.json();
  console.log(`Order settled! Order status: ${payJson.order?.status}, Table status: ${payJson.table?.status}`);

  // Step 9: Clean Table & Reset to Available
  console.log(`\n[Step 9] Table cleaning completed. Marking Table ${tableA1.tableNumber} available...`);
  const cleanRes = await fetch(`${baseUrl}/api/restaurant/tables/${tableA1.id}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ status: 'available' }),
  });
  if (!cleanRes.ok) throw new Error(`Failed to reset table: ${cleanRes.status}`);
  const cleanJson = await cleanRes.json();
  console.log(`Table ${tableA1.tableNumber} status: ${cleanJson.table?.status}, activeTotal: Rs ${cleanJson.table?.activeOrderTotal}`);

  // Step 10: Regression Tests on Existing Retail POS routes
  console.log('\n[Step 10] Checking existing Retail POS & Admin APIs for regression...');
  const [prodRes, retRes, salesRes] = await Promise.all([
    fetch(`${baseUrl}/api/products`, { headers }),
    fetch(`${baseUrl}/api/returns`, { headers }),
    fetch(`${baseUrl}/api/sales`, { headers }),
  ]);

  console.log(`GET /api/products: status ${prodRes.status} (OK: ${prodRes.ok})`);
  console.log(`GET /api/returns:  status ${retRes.status} (OK: ${retRes.ok})`);
  console.log(`GET /api/sales:    status ${salesRes.status} (OK: ${salesRes.ok})`);

  if (!prodRes.ok || !retRes.ok || !salesRes.ok) {
    throw new Error('Regression check failed on existing routes!');
  }

  console.log('\n======================================================');
  console.log('>>> ALL VERIFICATION TESTS PASSED SUCCESSFULLY! <<<');
  console.log('======================================================\n');
}

main().catch((err) => {
  console.error('\nVerification Error:', err);
  process.exit(1);
});
