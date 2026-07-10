/**
 * Remove fake seeded sales/returns from MongoDB so the app shows only real data.
 *
 * Usage:
 *   node clean_fake_seed.cjs                         # dry-run (report only)
 *   node clean_fake_seed.cjs --delete                # delete detected fake records + restore stock
 *   node clean_fake_seed.cjs --purge-all             # delete ALL sales & returns + restore stock
 *   node clean_fake_seed.cjs --keep-after=2026-07-01 # keep sales on/after date, delete older + restore stock
 */

const mongoose = require('mongoose')
const fs = require('fs')
const path = require('path')

const FAKE_CUSTOMERS = new Set([
  'John Doe',
  'Jane Smith',
  'Alice Johnson',
  'Bob Miller',
  'Charlie Davis',
  'Emily Wilson',
  'David Clark',
  'Sophia Turner',
])

const FAKE_PHONE_RE = /^555-01\d{2}$/
const BULK_DAY_THRESHOLD = 20 // seed script generated 24–36 sales/day

function loadEnv() {
  const envPath = path.join(__dirname, '.env.local')
  if (!fs.existsSync(envPath)) {
    throw new Error('.env.local not found')
  }
  const env = {}
  fs.readFileSync(envPath, 'utf8')
    .split('\n')
    .forEach((line) => {
      const match = line.match(/^\s*([^#\s=]+)\s*=\s*(.*)\s*$/)
      if (!match) return
      let val = match[2].trim()
      if (val.startsWith('"') && val.endsWith('"')) {
        val = val.slice(1, -1)
      }
      env[match[1]] = val
    })
  return env
}

function pktDayKey(date) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Karachi',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(date))
}

function isFakeCreditSale(sale) {
  if (sale.paymentMethod !== 'credit') return false
  const name = (sale.customerName || '').trim()
  const phone = (sale.customerPhone || '').trim()
  return FAKE_CUSTOMERS.has(name) || FAKE_PHONE_RE.test(phone)
}

function parseArgs() {
  const args = process.argv.slice(2)
  const opts = { dryRun: true, delete: false, purgeAll: false, keepAfter: null }

  for (const arg of args) {
    if (arg === '--delete') {
      opts.dryRun = false
      opts.delete = true
    } else if (arg === '--purge-all') {
      opts.dryRun = false
      opts.purgeAll = true
    } else if (arg.startsWith('--keep-after=')) {
      opts.dryRun = false
      opts.keepAfter = arg.split('=')[1]
      if (!/^\d{4}-\d{2}-\d{2}$/.test(opts.keepAfter)) {
        throw new Error('Invalid --keep-after date. Use YYYY-MM-DD')
      }
    }
  }

  return opts
}

async function restoreStock(Product, sales) {
  const stockByProduct = new Map()
  for (const sale of sales) {
    for (const item of sale.items || []) {
      const id = String(item.productId)
      stockByProduct.set(id, (stockByProduct.get(id) || 0) + item.quantity)
    }
  }

  for (const [productId, qty] of stockByProduct) {
    await Product.findByIdAndUpdate(productId, { $inc: { stock: qty } })
  }

  return stockByProduct
}

async function run() {
  const opts = parseArgs()
  const env = loadEnv()

  await mongoose.connect(env.MONGODB_URI, {
    dbName: env.MONGODB_DB || 'salespoint',
  })

  const Sale = mongoose.connection.model('Sale', new mongoose.Schema({}, { strict: false }), 'sales')
  const ReturnRequest = mongoose.connection.model(
    'ReturnRequest',
    new mongoose.Schema({}, { strict: false }),
    'returnrequests',
  )
  const Product = mongoose.connection.model('Product', new mongoose.Schema({}, { strict: false }), 'products')

  const allSales = await Sale.find().lean()
  const allReturns = await ReturnRequest.find().lean()

  console.log('=== Fake Seed Cleanup ===')
  console.log(`Mode: ${opts.purgeAll ? 'PURGE ALL' : opts.keepAfter ? `KEEP AFTER ${opts.keepAfter}` : opts.delete ? 'DELETE DETECTED' : 'DRY RUN'}`)
  console.log(`Sales in DB: ${allSales.length}`)
  console.log(`Returns in DB: ${allReturns.length}`)
  console.log('')

  let salesToDelete = []
  let returnsToDelete = []

  if (opts.purgeAll) {
    salesToDelete = allSales
    returnsToDelete = allReturns
    console.log('Will delete ALL sales and returns.')
  } else if (opts.keepAfter) {
    const cutoff = new Date(`${opts.keepAfter}T00:00:00+05:00`)
    salesToDelete = allSales.filter((s) => new Date(s.date) < cutoff)
    returnsToDelete = allReturns.filter((r) => new Date(r.createdAt) < cutoff)
    console.log(`Will delete sales/returns before ${opts.keepAfter} (PKT).`)
    console.log(`  Sales to delete: ${salesToDelete.length}`)
    console.log(`  Returns to delete: ${returnsToDelete.length}`)
    console.log(`  Sales kept: ${allSales.length - salesToDelete.length}`)
  } else {
    const fakeCredit = allSales.filter(isFakeCreditSale)

    const dayCounts = new Map()
    for (const sale of allSales) {
      const key = pktDayKey(sale.date)
      dayCounts.set(key, (dayCounts.get(key) || 0) + 1)
    }

    const bulkDays = [...dayCounts.entries()]
      .filter(([, count]) => count >= BULK_DAY_THRESHOLD)
      .sort((a, b) => a[0].localeCompare(b[0]))

    const bulkDaySet = new Set(bulkDays.map(([day]) => day))
    const bulkDaySales = allSales.filter((s) => bulkDaySet.has(pktDayKey(s.date)))

    const flaggedIds = new Set()
    for (const sale of [...fakeCredit, ...bulkDaySales]) {
      flaggedIds.add(String(sale._id))
    }
    salesToDelete = allSales.filter((s) => flaggedIds.has(String(s._id)))

    // Seeded returns had no unique marker; remove all if bulk fake sales dominate DB
    if (salesToDelete.length >= allSales.length * 0.8 && allReturns.length <= 20) {
      returnsToDelete = allReturns
    }

    console.log('Detection summary:')
    console.log(`  Fake credit sales (555-01xx phone / demo names): ${fakeCredit.length}`)
    console.log(`  High-volume seed days (>= ${BULK_DAY_THRESHOLD} sales/day): ${bulkDays.length}`)
    if (bulkDays.length > 0) {
      console.log('  Seed days:')
      for (const [day, count] of bulkDays) {
        console.log(`    ${day}: ${count} sales`)
      }
    }
    console.log(`  Sales flagged for deletion: ${salesToDelete.length}`)
    console.log(`  Returns flagged for deletion: ${returnsToDelete.length}`)
    console.log(`  Sales that will remain: ${allSales.length - salesToDelete.length}`)
  }

  if (salesToDelete.length === 0 && returnsToDelete.length === 0) {
    console.log('\nNothing to delete. Database already looks clean.')
    await mongoose.connection.close()
    return
  }

  const deletedRevenue = salesToDelete.reduce((sum, s) => sum + (s.total || 0), 0)
  console.log(`\nRevenue removed (fake): Rs ${deletedRevenue.toLocaleString()}`)

  if (opts.dryRun) {
    console.log('\nDry run only. Re-run with one of:')
    console.log('  node clean_fake_seed.cjs --delete')
    console.log('  node clean_fake_seed.cjs --purge-all')
    console.log('  node clean_fake_seed.cjs --keep-after=YYYY-MM-DD')
    await mongoose.connection.close()
    return
  }

  const stockRestore = await restoreStock(Product, salesToDelete)
  console.log(`\nRestoring stock for ${stockRestore.size} product(s)...`)

  if (salesToDelete.length > 0) {
    await Sale.deleteMany({ _id: { $in: salesToDelete.map((s) => s._id) } })
  }
  if (returnsToDelete.length > 0) {
    await ReturnRequest.deleteMany({ _id: { $in: returnsToDelete.map((r) => r._id) } })
  }

  const remainingSales = await Sale.countDocuments()
  const remainingReturns = await ReturnRequest.countDocuments()

  console.log('\nDone.')
  console.log(`  Deleted sales: ${salesToDelete.length}`)
  console.log(`  Deleted returns: ${returnsToDelete.length}`)
  console.log(`  Remaining sales: ${remainingSales}`)
  console.log(`  Remaining returns: ${remainingReturns}`)
  console.log('\nRefresh the app — it will now show only real database records.')

  await mongoose.connection.close()
}

run().catch((e) => {
  console.error(e)
  process.exit(1)
})
