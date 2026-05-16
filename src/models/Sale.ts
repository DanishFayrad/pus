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
  },
  { timestamps: true },
)

SaleSchema.set('toJSON', {
  virtuals: false,
  transform: (_doc, ret: Record<string, unknown>) => {
    ret.id = String(ret._id)
    delete ret._id
    delete ret.__v
    return ret
  },
})

export default models.Sale || model<ISale>('Sale', SaleSchema)
