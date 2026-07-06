async function test() {
  const r = await fetch('http://localhost:3000/api/sales', {
    headers: {
      'Cookie': 'salespoint-session=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjZhMDhiZjA5MTQ2YjM2NDRlY2M4ZDZkMSIsInVzZXJuYW1lIjoiYWRtaW4iLCJuYW1lIjoiU3RvcmUgQWRtaW4iLCJyb2xlIjoiYWRtaW4iLCJpYXQiOjE3ODMzNDY3NzgsImV4cCI6MTc4Mzk1MTU3OH0.zlf_T1Io3XYGpyPYITpQOgqT-cjGmF2xaf9966tp8eg'
    }
  });
  const d = await r.json();
  const sales = d.sales || [];
  
  let totalRevenue = 0;
  let totalCost = 0;
  let totalProfit = 0;
  let itemsSold = 0;
  sales.forEach(s => {
    totalRevenue += s.total || 0;
    totalCost += s.cost || 0;
    totalProfit += s.profit || 0;
    itemsSold += s.items ? s.items.reduce((a, i) => a + (i.quantity || 0), 0) : 0;
  });
  
  console.log('Stats for returned', sales.length, 'sales:');
  console.log('Revenue:', totalRevenue);
  console.log('Cost:', totalCost);
  console.log('Profit:', totalProfit);
  console.log('Items Sold:', itemsSold);
  process.exit(0);
}

test().catch(console.error);
