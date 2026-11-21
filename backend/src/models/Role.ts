import mongoose, { Schema } from 'mongoose';

export interface IRole extends mongoose.Document {
  roleName: string;
  description: string;
  isSystemRole: boolean;       // system-defined (cannot be deleted)
  isSuperAdminRole: boolean;   // only one role can be super admin
  createdBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const roleSchema = new Schema<IRole>({
  roleName: { type: String, required: true, unique: true, trim: true },
  description: { type: String, trim: true },
  isSystemRole: { type: Boolean, default: false },
  isSuperAdminRole: { type: Boolean, default: false },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

export const Role = mongoose.model<IRole>('Role', roleSchema);