import mongoose, { Schema } from 'mongoose';

export interface IUserPermissionOverride extends mongoose.Document {
  userId: mongoose.Types.ObjectId;
  permissionId: mongoose.Types.ObjectId;
  effect: 'allow' | 'deny';
  assignedBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const userPermissionOverrideSchema = new Schema<IUserPermissionOverride>({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  permissionId: { type: Schema.Types.ObjectId, ref: 'Permission', required: true, index: true },
  effect: { type: String, enum: ['allow', 'deny'], required: true },
  assignedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true });

userPermissionOverrideSchema.index({ userId: 1, permissionId: 1 }, { unique: true });

export const UserPermissionOverride = mongoose.model<IUserPermissionOverride>('UserPermissionOverride', userPermissionOverrideSchema);