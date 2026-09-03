import mongoose, { Schema, models, model } from 'mongoose'

interface ISaleItem {
  productId: string
  name: string
  barcode: string
  price: number
  cost: number
  quantity: number
}

export interface ISale {
  _id: mongoose.Types.ObjectId
  date: Date
  cashierId: string
  cashierName: string
  items: ISaleItem[]
  total: number
  cost: number
  profit: number
  paymentMethod: 'cash' | 'credit'
  customerName?: string
  customerPhone?: string
  creditStatus?: 'unpaid' | 'paid'
}

const SaleItemSchema = new Schema<ISaleItem>(
  {
    productId: { type: String, required: true },
    name: { type: String, required: true },
    barcode: { type: String, required: true },
    price: { type: Number, required: true },
    cost: { type: Number, required: true },
    quantity: { type: Number, required: true, min: 1 },
  },
  { _id: false },
)

const SaleSchema = new Schema<ISale>(
  {
    date: { type: Date, required: true, default: Date.now, index: true },
    cashierId: { type: String, required: true },
    cashierName: { type: String, required: true },
    items: { type: [SaleItemSchema], required: true },
    total: { type: Number, required: true },
    cost: { type: Number, required: true },
    profit: { type: Number, required: true },
    paymentMethod: { type: String, enum: ['cash', 'credit'], default: 'cash', required: true },
    customerName: { type: String, default: '' },
    customerPhone: { type: String, default: '', index: true },
    creditStatus: { type: String, enum: ['unpaid', 'paid'], default: 'unpaid', index: true },
  },
  { timestamps: true },
)

SaleSchema.index({ paymentMethod: 1, date: -1 })
SaleSchema.index({ date: -1 })
SaleSchema.index({ paymentMethod: 1, creditStatus: 1 })

SaleSchema.set('toJSON', {
  virtuals: false,
  transform: (_doc, ret) => {
    const r = ret as unknown as Record<string, unknown>
    r.id = String(r._id)
    delete r._id
    delete r.__v
    return r
  },
})

export default models.Sale || model<ISale>('Sale', SaleSchema)
