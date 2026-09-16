import mongoose, { Schema, models, model } from 'mongoose'

export interface IRestaurantTable {
  _id: mongoose.Types.ObjectId
  tableNumber: string
  section: 'A' | 'B' | 'C'
  capacity: number
  status: 'available' | 'occupied' | 'billing' | 'cleaning'
  activeOrderId?: mongoose.Types.ObjectId | null
  activeOrderTotal: number
  activeItemsCount: number
  openedAt?: Date | null
  createdAt: Date
  updatedAt: Date
}

const RestaurantTableSchema = new Schema<IRestaurantTable>(
  {
    tableNumber: { type: String, required: true, unique: true, uppercase: true, trim: true, index: true },
    section: { type: String, required: true, enum: ['A', 'B', 'C'], index: true },
    capacity: { type: Number, required: true, default: 4 },
    status: {
      type: String,
      required: true,
      enum: ['available', 'occupied', 'billing', 'cleaning'],
      default: 'available',
      index: true,
    },
    activeOrderId: { type: Schema.Types.ObjectId, ref: 'RestaurantOrder', default: null },
    activeOrderTotal: { type: Number, default: 0 },
    activeItemsCount: { type: Number, default: 0 },
    openedAt: { type: Date, default: null },
  },
  { timestamps: true },
)

RestaurantTableSchema.set('toJSON', {
  virtuals: false,
  transform: (_doc, ret) => {
    const r = ret as unknown as Record<string, unknown>
    r.id = String(r._id)
    if (r.activeOrderId) {
      r.activeOrderId = String(r.activeOrderId)
    }
    delete r._id
    delete r.__v
    return r
  },
})

export default models.RestaurantTable || model<IRestaurantTable>('RestaurantTable', RestaurantTableSchema)
