import mongoose, { Schema } from 'mongoose';

export interface IRolePermission extends mongoose.Document {
  roleId: mongoose.Types.ObjectId;
  permissionId: mongoose.Types.ObjectId;
  createdAt: Date;
}

const rolePermissionSchema = new Schema<IRolePermission>({
  roleId: { type: Schema.Types.ObjectId, ref: 'Role', required: true, index: true },
  permissionId: { type: Schema.Types.ObjectId, ref: 'Permission', required: true, index: true },
}, { timestamps: true });

rolePermissionSchema.index({ roleId: 1, permissionId: 1 }, { unique: true });

export const RolePermission = mongoose.model<IRolePermission>('RolePermission', rolePermissionSchema);