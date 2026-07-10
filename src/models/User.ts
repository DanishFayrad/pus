import mongoose, { Schema, models, model } from 'mongoose'
import bcrypt from 'bcryptjs'

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

// Hash plaintext passwords before save. Idempotent — already-hashed values pass through.
// NOTE: async pre-hooks in Mongoose resolve via the returned promise — do NOT call next()
// (Mongoose does not pass a next callback to async hooks, so calling it throws).
UserSchema.pre('save', async function () {
  if (this.isModified('password') && !this.password.startsWith('$2')) {
    this.password = await bcrypt.hash(this.password, 10)
  }
})

UserSchema.set('toJSON', {
  virtuals: false,
  transform: (_doc, ret) => {
    const r = ret as unknown as Record<string, unknown>
    r.id = String(r._id)
    delete r._id
    delete r.__v
    delete r.password
    return r
  },
})

export default models.User || model<IUser>('User', UserSchema)
