import mongoose, { Schema } from 'mongoose';

/**
 * E-mail ownership check for the public "become a vendor" form.
 * One document per e-mail address. Neither the OTP nor the verification token is stored in plain text.
 */
export interface IVendorEmailVerification extends mongoose.Document {
  email: string;
  otpHash?: string;
  otpExpiresAt?: Date;
  attempts: number;          // wrong OTP guesses for the current OTP
  sendCount: number;         // OTPs sent in the current hour
  sendWindowStart?: Date;
  lastSentAt?: Date;
  verified: boolean;
  tokenHash?: string;        // hash of the proof the apply endpoint requires
  tokenExpiresAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<IVendorEmailVerification>({
  email: { type: String, required: true, lowercase: true, trim: true, unique: true, index: true },
  otpHash: { type: String },
  otpExpiresAt: { type: Date },
  attempts: { type: Number, default: 0 },
  sendCount: { type: Number, default: 0 },
  sendWindowStart: { type: Date },
  lastSentAt: { type: Date },
  verified: { type: Boolean, default: false },
  tokenHash: { type: String },
  tokenExpiresAt: { type: Date },
}, { timestamps: true });

export const VendorEmailVerification = mongoose.model<IVendorEmailVerification>('VendorEmailVerification', schema);
