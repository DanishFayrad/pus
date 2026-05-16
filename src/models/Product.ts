import mongoose, { Schema, models, model } from 'mongoose'

export interface IProduct {
  _id: mongoose.Types.ObjectId
  barcode: string
  name: string
  price: number
  cost: number
  stock: number
}

const ProductSchema = new Schema<IProduct>(
  {
    barcode: { type: String, required: true, unique: true, trim: true, index: true },
    name: { type: String, required: true, trim: true },
    price: { type: Number, required: true, min: 0 },
    cost: { type: Number, required: true, min: 0 },
    stock: { type: Number, required: true, min: 0, default: 0 },
  },
  { timestamps: true },
)

ProductSchema.set('toJSON', {
  virtuals: false,
  transform: (_doc, ret: Record<string, unknown>) => {
    ret.id = String(ret._id)
    delete ret._id
    delete ret.__v
    return ret
  },
})

export default models.Product || model<IProduct>('Product', ProductSchema)
