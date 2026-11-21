import mongoose, { Schema } from 'mongoose';

export interface IAdminSession extends mongoose.Document {
  userId: mongoose.Types.ObjectId;
  sessionToken: string;
  ipAddress?: string;
  userAgent?: string;
  createdAt: Date;
  expiresAt: Date;
  revokedAt?: Date;
  revokedBy?: mongoose.Types.ObjectId;
  isActive: boolean;
  permissionVersion: number;  // increments when permissions change
}

const adminSessionSchema = new Schema<IAdminSession>({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  sessionToken: { type: String, required: true, unique: true },
  ipAddress: { type: String },
  userAgent: { type: String },
  expiresAt: { type: Date, required: true },
  revokedAt: { type: Date },
  revokedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  isActive: { type: Boolean, default: true },
  permissionVersion: { type: Number, default: 0 },
}, { timestamps: true });

adminSessionSchema.index({ userId: 1, isActive: 1 });
adminSessionSchema.index({ expiresAt: 1 });

export const AdminSession = mongoose.model<IAdminSession>('AdminSession', adminSessionSchema);