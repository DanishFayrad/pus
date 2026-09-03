import mongoose, { Schema, models, model } from 'mongoose'

export interface IProduct {
  _id: mongoose.Types.ObjectId
  barcode: string
  name: string
  price: number
  cost: number
  stock: number
  category: string
}

const ProductSchema = new Schema<IProduct>(
  {
    barcode: { type: String, required: true, unique: true, trim: true, index: true },
    name: { type: String, required: true, trim: true, index: true },
    price: { type: Number, required: true, min: 0 },
    cost: { type: Number, required: true, min: 0 },
    stock: { type: Number, required: true, min: 0, default: 0 },
    category: { type: String, required: true, default: 'General', index: true },
  },
  { timestamps: true },
)

ProductSchema.set('toJSON', {
  virtuals: false,
  transform: (_doc, ret) => {
    const r = ret as unknown as Record<string, unknown>
    r.id = String(r._id)
    delete r._id
    delete r.__v
    return r
  },
})

export default models.Product || model<IProduct>('Product', ProductSchema)
