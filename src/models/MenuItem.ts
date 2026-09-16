import mongoose, { Schema, models, model } from 'mongoose'

export interface IMenuItem {
  _id: mongoose.Types.ObjectId
  name: string
  category: string
  price: number
  emoji?: string
  enabled: boolean
  createdAt: Date
  updatedAt: Date
}

const MenuItemSchema = new Schema<IMenuItem>(
  {
    name: { type: String, required: true, trim: true, index: true },
    category: { type: String, required: true, trim: true, index: true },
    price: { type: Number, required: true, min: 0 },
    emoji: { type: String, default: '🍽️' },
    enabled: { type: Boolean, default: true, index: true },
  },
  { timestamps: true, collection: 'menuitems' },
)

MenuItemSchema.set('toJSON', {
  virtuals: false,
  transform: (_doc, ret) => {
    const r = ret as unknown as Record<string, unknown>
    r.id = String(r._id)
    delete r._id
    delete r.__v
    return r
  },
})

export default models.MenuItem || model<IMenuItem>('MenuItem', MenuItemSchema)
