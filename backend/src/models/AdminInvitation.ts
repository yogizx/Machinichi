import mongoose, { Schema } from 'mongoose';

/**
 * Staff invitation.
 *
 * Lifecycle (every transition is an atomic findOneAndUpdate, so a token can never be used twice):
 *   pending      -> invitation e-mailed, token unused
 *   in_progress  -> token consumed, password set, waiting for the MFA code (setup token valid ~15 min)
 *   accepted     -> MFA confirmed, account activated
 *   expired / revoked -> dead
 *
 * Only SHA-256 hashes of the tokens are stored. The raw tokens exist only in the e-mail link / API response.
 */
export interface IAdminInvitation extends mongoose.Document {
  email: string;
  userId?: mongoose.Types.ObjectId;
  tokenHash: string;
  roleId: mongoose.Types.ObjectId;
  status: 'pending' | 'in_progress' | 'accepted' | 'expired' | 'revoked';
  invitedBy: mongoose.Types.ObjectId;
  expiresAt: Date;
  setupTokenHash?: string;
  setupExpiresAt?: Date;
  setupAttempts?: number;
  acceptedAt?: Date;
  acceptedBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const adminInvitationSchema = new Schema<IAdminInvitation>({
  email: { type: String, required: true, lowercase: true, trim: true },
  userId: { type: Schema.Types.ObjectId, ref: 'User', index: true },
  tokenHash: { type: String, required: true, unique: true },
  roleId: { type: Schema.Types.ObjectId, ref: 'Role', required: true },
  status: { type: String, enum: ['pending', 'in_progress', 'accepted', 'expired', 'revoked'], default: 'pending' },
  invitedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  expiresAt: { type: Date, required: true },
  setupTokenHash: { type: String, index: true, sparse: true },
  setupExpiresAt: { type: Date },
  setupAttempts: { type: Number, default: 0 },
  acceptedAt: { type: Date },
  acceptedBy: { type: Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

adminInvitationSchema.index({ email: 1, status: 1 });
adminInvitationSchema.index({ expiresAt: 1 });

export const AdminInvitation = mongoose.model<IAdminInvitation>('AdminInvitation', adminInvitationSchema);
