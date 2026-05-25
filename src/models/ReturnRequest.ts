import mongoose, { Schema, models, model } from 'mongoose'

export interface IReturnRequest {
  _id: mongoose.Types.ObjectId
  productId: string
  productName: string
  quantity: number
  cashierId: string
  cashierName: string
  status: 'pending' | 'approved' | 'rejected'
  createdAt: Date
  updatedAt: Date
}

const ReturnRequestSchema = new Schema<IReturnRequest>(
  {
    productId: { type: String, required: true },
    productName: { type: String, required: true },
    quantity: { type: Number, required: true, min: 1 },
    cashierId: { type: String, required: true },
    cashierName: { type: String, required: true },
    status: { type: String, required: true, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  },
  { timestamps: true },
)

ReturnRequestSchema.set('toJSON', {
  virtuals: false,
  transform: (_doc, ret: Record<string, unknown>) => {
    ret.id = String(ret._id)
    delete ret._id
    delete ret.__v
    return ret
  },
})

export default models.ReturnRequest || model<IReturnRequest>('ReturnRequest', ReturnRequestSchema)
