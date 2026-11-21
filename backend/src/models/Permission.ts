import mongoose, { Schema } from 'mongoose';

export interface IPermission extends mongoose.Document {
  permissionKey: string;      // e.g. 'product.view'
  module: string;             // e.g. 'product'
  action: string;             // e.g. 'view'
  description: string;
  isSystem: boolean;          // system-defined (cannot be deleted)
  createdAt: Date;
  updatedAt: Date;
}

const permissionSchema = new Schema<IPermission>({
  permissionKey: { type: String, required: true, unique: true, trim: true, lowercase: true },
  module: { type: String, required: true, trim: true, lowercase: true, index: true },
  action: { type: String, required: true, trim: true, lowercase: true },
  description: { type: String, trim: true },
  isSystem: { type: Boolean, default: true },
}, { timestamps: true });

permissionSchema.index({ module: 1, action: 1 }, { unique: true });

export const Permission = mongoose.model<IPermission>('Permission', permissionSchema);