import mongoose, { Schema, models, model } from 'mongoose'

export interface IRestaurantOrderItem {
  productId: string
  name: string
  category: string
  price: number
  quantity: number
  notes?: string
  round: number
  addedAt: Date
}

export interface ISplitBillItem {
  name: string
  price: number
  quantity: number
}

export interface ISplitBill {
  splitNumber: number
  label: string
  items: ISplitBillItem[]
  subtotal: number
  discount: number
  total: number
  status: 'unpaid' | 'paid'
  paymentMethod?: string
  paidAt?: Date
}

export interface IRestaurantOrder {
  _id: mongoose.Types.ObjectId
  orderNumber: string
  tableId: mongoose.Types.ObjectId
  tableName: string
  section: 'A' | 'B' | 'C'
  waiterId?: string
  waiterName?: string
  cashierId?: string
  cashierName?: string
  status: 'open' | 'billing' | 'paid' | 'cancelled'
  items: IRestaurantOrderItem[]
  notes?: string
  subtotal: number
  discount: number
  discountType: 'fixed' | 'percent'
  tax: number
  total: number
  paymentMethod?: string
  splitBills?: ISplitBill[]
  paidAt?: Date
  createdAt: Date
  updatedAt: Date
}

const RestaurantOrderItemSchema = new Schema<IRestaurantOrderItem>(
  {
    productId: { type: String, required: true },
    name: { type: String, required: true },
    category: { type: String, default: 'General' },
    price: { type: Number, required: true, min: 0 },
    quantity: { type: Number, required: true, min: 1 },
    notes: { type: String, default: '' },
    round: { type: Number, default: 1 },
    addedAt: { type: Date, default: Date.now },
  },
  { _id: false },
)

const SplitBillSchema = new Schema<ISplitBill>(
  {
    splitNumber: { type: Number, required: true },
    label: { type: String, required: true },
    items: [
      {
        name: { type: String, required: true },
        price: { type: Number, required: true },
        quantity: { type: Number, required: true },
      },
    ],
    subtotal: { type: Number, required: true, default: 0 },
    discount: { type: Number, default: 0 },
    total: { type: Number, required: true, default: 0 },
    status: { type: String, enum: ['unpaid', 'paid'], default: 'unpaid' },
    paymentMethod: { type: String, default: 'cash' },
    paidAt: { type: Date },
  },
  { _id: false },
)

const RestaurantOrderSchema = new Schema<IRestaurantOrder>(
  {
    orderNumber: { type: String, required: true, unique: true, index: true },
    tableId: { type: Schema.Types.ObjectId, ref: 'RestaurantTable', required: true, index: true },
    tableName: { type: String, required: true },
    section: { type: String, required: true, enum: ['A', 'B', 'C'] },
    waiterId: { type: String, default: '' },
    waiterName: { type: String, default: '' },
    cashierId: { type: String, default: '' },
    cashierName: { type: String, default: '' },
    status: {
      type: String,
      required: true,
      enum: ['open', 'billing', 'paid', 'cancelled'],
      default: 'open',
      index: true,
    },
    items: { type: [RestaurantOrderItemSchema], default: [] },
    notes: { type: String, default: '' },
    subtotal: { type: Number, required: true, default: 0 },
    discount: { type: Number, default: 0 },
    discountType: { type: String, enum: ['fixed', 'percent'], default: 'fixed' },
    tax: { type: Number, default: 0 },
    total: { type: Number, required: true, default: 0 },
    paymentMethod: { type: String, default: 'cash' },
    splitBills: { type: [SplitBillSchema], default: [] },
    paidAt: { type: Date },
  },
  { timestamps: true },
)

RestaurantOrderSchema.index({ tableId: 1, status: 1 })
RestaurantOrderSchema.index({ createdAt: -1 })

RestaurantOrderSchema.set('toJSON', {
  virtuals: false,
  transform: (_doc, ret) => {
    const r = ret as unknown as Record<string, unknown>
    r.id = String(r._id)
    r.tableId = String(r.tableId)
    delete r._id
    delete r.__v
    return r
  },
})

export default models.RestaurantOrder || model<IRestaurantOrder>('RestaurantOrder', RestaurantOrderSchema)
