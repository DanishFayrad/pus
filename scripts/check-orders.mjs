import mongoose from 'mongoose'
import dbConnect from '../src/lib/mongodb.js'
import RestaurantOrder from '../src/models/RestaurantOrder.js'

async function check() {
  await dbConnect()
  const orders = await RestaurantOrder.find({ status: { $in: ['open', 'billing'] } }).sort({ createdAt: -1 }).lean()
  console.log('Active Orders count in DB:', orders.length)
  orders.forEach((o) => {
    console.log(`- Table ${o.tableName} (${o.orderNumber}) - Status: ${o.status} - Total: Rs ${o.total}`)
    o.items.forEach((it) => {
      console.log(`   • ${it.quantity}x ${it.name} (Round ${it.round || 1}) ${it.notes ? `[Note: ${it.notes}]` : ''}`)
    })
  })
  process.exit(0)
}

check().catch(console.error)
