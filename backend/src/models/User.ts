import mongoose, { Schema } from 'mongoose';
import bcrypt from 'bcrypt';

export interface ICertificate {
  name: string;
  size: number;
  uploadedAt: Date;
  url: string;
}

export interface ITwoStep {
  enabled: boolean;
  email?: string;
}

export interface IStoreInfo {
  brandName?: string;
  location?: string;
  city?: string;
  state?: string;
  storeEmail?: string;
}

export interface IProductCertification {
  name: string;
  url: string;
  size: number;
  uploadedAt: Date;
}

export interface ICompliance {
  fssai?: string;
  bis?: string;
  ce?: string;
  iso?: string;
  fda?: string;
  rohs?: string;
  msds?: string;
  msdsUrl?: string;
  productCertifications?: IProductCertification[];
  certificateUrls?: string[];
}

export interface IUser extends mongoose.Document {
  fullName: string;
  email?: string;
  phone?: string;
  password?: string;
  avatar?: string;
  provider: 'local' | 'google' | 'firebase';
  googleId?: string;
  firebaseUid?: string;
  role: 'customer' | 'admin' | 'super_admin' | 'vendor' | 'sub_admin';
  // ─ Sub-admin RBAC fields ─
  roleId?: mongoose.Types.ObjectId;
  permissionVersion?: number;
  invitedBy?: mongoose.Types.ObjectId;
  accountStatus?: 'pending_invitation' | 'active' | 'suspended' | 'revoked';
  accessExpiry?: Date;
  profileImage?: string;
  lastPermissionSync?: Date;
  tokensValidAfter?: Date;        // access tokens issued before this instant are rejected (session revocation)
  mfa?: {
    enabled: boolean;
    secretEnc?: string;           // AES-256-GCM encrypted TOTP secret (never selected by default)
    pendingSecretEnc?: string;    // secret generated during enrollment, not yet confirmed
    recoveryCodeHashes?: string[];
    enrolledAt?: Date;
    lastUsedStep?: number;        // last accepted TOTP time-step (replay protection)
  };
  // ─ Multi-vendor ─ (only set for role === 'vendor')
  vendorCode?: string;            // human friendly "user id" e.g. VND-4F7K2Q, e-mailed on approval
  businessId?: mongoose.Types.ObjectId; // the approved Business (store) this vendor owns
  mustChangePassword?: boolean;   // true while the e-mailed temporary password is still in use
  isPhoneVerified: boolean;
  isEmailVerified: boolean;
  isActive: boolean;
  isDeleted: boolean;
  isBlocked: boolean;
  lastLogin?: Date;
  lastLoginIp?: string;
  lastLoginDevice?: string;
  failedLoginAttempts: number;
  lockUntil?: Date;
  passwordResetToken?: string;
  passwordResetExpires?: Date;
  passwordResetAttempts: number;
  passwordResetLockUntil?: Date;
  isLocked: boolean;
  gstCertificate?: ICertificate;
  fssaiCertificate?: ICertificate;
  compliance?: ICompliance;
  twoStep?: ITwoStep;
  storeInfo?: IStoreInfo;
  customerTier?: string;
  totalOrders?: number;
  totalSpend?: number;
  createdAt?: Date;
  updatedAt?: Date;
  comparePassword(candidate: string): Promise<boolean>;
}

const userSchema = new Schema<IUser>({
  fullName:  { type: String, required: true, trim: true },
  email:     { type: String, lowercase: true, trim: true, sparse: true, index: true },
  phone:     { type: String, sparse: true, index: true },
  password:  { type: String, select: false, minlength: 8 },
  avatar:    { type: String },
  provider:  { type: String, enum: ['local', 'google', 'firebase'], default: 'local' },
  googleId:  { type: String, sparse: true, unique: true, index: true },
  firebaseUid: { type: String, sparse: true, unique: true, index: true },
  role:      { type: String, enum: ['customer', 'admin', 'super_admin', 'vendor', 'sub_admin'], default: 'customer' },
  // ─ Sub-admin RBAC fields ─
  roleId: { type: Schema.Types.ObjectId, ref: 'Role', index: true },
  permissionVersion: { type: Number, default: 0 },
  invitedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  accountStatus: { type: String, enum: ['pending_invitation', 'active', 'suspended', 'revoked'], default: 'active' },
  accessExpiry: { type: Date },
  profileImage: { type: String },
  lastPermissionSync: { type: Date },
  tokensValidAfter: { type: Date },
  mfa: {
    enabled: { type: Boolean, default: false },
    secretEnc: { type: String, select: false },
    pendingSecretEnc: { type: String, select: false },
    recoveryCodeHashes: { type: [String], select: false, default: undefined },
    enrolledAt: { type: Date },
    lastUsedStep: { type: Number, select: false },
  },
  vendorCode: { type: String, uppercase: true, trim: true, sparse: true, index: true },
  businessId: { type: Schema.Types.ObjectId, ref: 'Business', index: true },
  mustChangePassword: { type: Boolean, default: false },
  isPhoneVerified: { type: Boolean, default: false },
  isEmailVerified: { type: Boolean, default: false },
  isActive:        { type: Boolean, default: true },
  isDeleted:       { type: Boolean, default: false },
  isBlocked:       { type: Boolean, default: false },
  lastLogin:       { type: Date },
  lastLoginIp:     { type: String },
  lastLoginDevice: { type: String },
  failedLoginAttempts: { type: Number, default: 0 },
  lockUntil:           { type: Date },
  passwordResetToken:   { type: String },
  passwordResetExpires: { type: Date },
  passwordResetAttempts: { type: Number, default: 0 },
  passwordResetLockUntil: { type: Date },
  gstCertificate: {
    name: { type: String },
    size: { type: Number },
    uploadedAt: { type: Date },
    url: { type: String },
  },
  fssaiCertificate: {
    name: { type: String },
    size: { type: Number },
    uploadedAt: { type: Date },
    url: { type: String },
  },
  compliance: {
    fssai: { type: String, trim: true },
    bis: { type: String, trim: true },
    ce: { type: String, trim: true },
    iso: { type: String, trim: true },
    fda: { type: String, trim: true },
    rohs: { type: String, trim: true },
    msds: { type: String, trim: true },
    msdsUrl: { type: String },
    productCertifications: [{
      name: { type: String, required: true, trim: true },
      url: { type: String, required: true },
      size: { type: Number },
      uploadedAt: { type: Date, default: Date.now },
    }],
    certificateUrls: [{ type: String }],
  },
  twoStep: {
    enabled: { type: Boolean, default: false },
    email: { type: String, lowercase: true, trim: true },
  },
  storeInfo: {
    brandName: { type: String, trim: true },
    location: { type: String, trim: true },
    city: { type: String, trim: true },
    state: { type: String, trim: true },
    storeEmail: { type: String, lowercase: true, trim: true },
  },
  customerTier: { type: String, default: 'Regular' },
  totalOrders: { type: Number, default: 0 },
  totalSpend: { type: Number, default: 0 },
}, { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } });

userSchema.pre('save', async function (this: IUser) {
  if (!this.isModified('password') || !this.password) return;
  this.password = await bcrypt.hash(this.password, 12);
});

// SECURITY: the platform must always keep at least one active Super Admin. Any save() that would demote,
// deactivate, soft-delete or suspend the last one is refused (protects against accidental lock-out).
userSchema.pre('save', async function (this: IUser) {
  if (this.isNew) return;
  const touchesPrivilege =
    this.isModified('role') || this.isModified('isDeleted') || this.isModified('isActive') || this.isModified('accountStatus');
  if (!touchesPrivilege) return;

  const UserModel = mongoose.model<IUser>('User');
  const before = await UserModel.findById(this._id).select('role').lean();
  if (!before || before.role !== 'super_admin') return;

  const staysSuperAdmin =
    this.role === 'super_admin' && !this.isDeleted && this.isActive !== false &&
    (!this.accountStatus || this.accountStatus === 'active');
  if (staysSuperAdmin) return;

  const others = await UserModel.countDocuments({
    _id: { $ne: this._id },
    role: 'super_admin',
    isDeleted: false,
    isActive: true,
  });
  if (others === 0) {
    throw new Error('The last active Super Admin cannot be demoted, suspended, deactivated or deleted.');
  }
});

userSchema.methods.comparePassword = async function (candidate: string): Promise<boolean> {
  if (!this.password) return false;
  return bcrypt.compare(candidate, this.password);
};

userSchema.virtual('isLocked').get(function () {
  return !!(this.lockUntil && this.lockUntil > new Date());
});

export const User = mongoose.model<IUser>('User', userSchema);
