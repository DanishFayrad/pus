import mongoose, { Schema, models, model } from 'mongoose'

export interface IUser {
  _id: mongoose.Types.ObjectId
  username: string
  password: string
  name: string
  role: 'admin' | 'cashier'
}

const UserSchema = new Schema<IUser>(
  {
    username: { type: String, required: true, unique: true, trim: true, lowercase: true, index: true },
    password: { type: String, required: true },
    name: { type: String, required: true, trim: true },
    role: { type: String, required: true, enum: ['admin', 'cashier'] },
  },
  { timestamps: true },
)

UserSchema.set('toJSON', {
  virtuals: false,
  transform: (_doc, ret: Record<string, unknown>) => {
    ret.id = String(ret._id)
    delete ret._id
    delete ret.__v
    delete ret.password
    return ret
  },
})

export default models.User || model<IUser>('User', UserSchema)
