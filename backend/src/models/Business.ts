import mongoose, { Schema } from 'mongoose';

export const VENDOR_DOC_TYPES = [
  'gst_certificate',
  'pan_card',
  'id_proof',
  'address_proof',
  'fssai_license',
  'bank_proof',
  'other',
] as const;
export type VendorDocType = (typeof VENDOR_DOC_TYPES)[number];

export interface IBusinessDocument {
  _id?: mongoose.Types.ObjectId;
  type: VendorDocType;
  label?: string;
  originalName: string;
  mimeType: string;
  size: number;
  // Storage internals — never sent to the browser (see sanitizeBusiness in the controller).
  storage: 'cloudinary' | 'local';
  publicId?: string;
  resourceType?: string;
  filename?: string;
  uploadedAt: Date;
}

export interface IBusiness extends mongoose.Document {
  name: string; // store / business name (shown to shoppers as the seller name)
  tagline?: string;
  description?: string;
  category?: string;
  logo?: string;
  coverBanner?: string;
  email?: string;
  phone?: string;
  website?: string;
  ownerName?: string;
  ownerDesignation?: string;
  ownerLinkedin?: string;
  ownerWebsite?: string;
  address?: string;
  city?: string;
  state?: string;
  district?: string;
  yearsInBusiness?: string;
  pincode?: string;
  socialFacebook?: string;
  socialInstagram?: string;
  socialLinkedin?: string;
  socialTwitter?: string;
  socialWhatsapp?: string;
  socialYoutube?: string;
  images?: string[];
  // ─ Vendor application ─
  gstin?: string;
  panNumber?: string;
  fssaiNumber?: string;
  documents?: IBusinessDocument[];
  // ─ Review / approval ─
  status: 'pending' | 'approved' | 'rejected';
  rejectionReason?: string;
  submittedBy?: mongoose.Types.ObjectId;
  reviewedBy?: mongoose.Types.ObjectId;
  reviewedAt?: Date;
  // ─ Vendor account (created when the admin approves) ─
  vendorUser?: mongoose.Types.ObjectId;
  vendorCode?: string;
  vendorSince?: Date;
  credentialsSentAt?: Date;
  credentialsEmailStatus?: 'sent' | 'failed';
  createdAt: Date;
  updatedAt: Date;
}

const documentSchema = new Schema<IBusinessDocument>({
  type: { type: String, enum: VENDOR_DOC_TYPES, required: true },
  label: { type: String, trim: true },
  originalName: { type: String, required: true },
  mimeType: { type: String, required: true },
  size: { type: Number, required: true },
  storage: { type: String, enum: ['cloudinary', 'local'], required: true },
  publicId: { type: String },
  resourceType: { type: String },
  filename: { type: String },
  uploadedAt: { type: Date, default: Date.now },
});

const businessSchema = new Schema<IBusiness>({
  name: { type: String, required: true, trim: true },
  tagline: { type: String, trim: true },
  description: { type: String, trim: true },
  category: { type: String, trim: true },
  logo: { type: String },
  coverBanner: { type: String },
  email: { type: String, lowercase: true, trim: true },
  phone: { type: String, trim: true },
  website: { type: String, trim: true },
  ownerName: { type: String, trim: true },
  ownerDesignation: { type: String, trim: true },
  ownerLinkedin: { type: String, trim: true },
  ownerWebsite: { type: String, trim: true },
  address: { type: String, trim: true },
  city: { type: String, trim: true },
  state: { type: String, trim: true },
  district: { type: String, trim: true },
  yearsInBusiness: { type: String, trim: true },
  pincode: { type: String, trim: true },
  socialFacebook: { type: String, trim: true },
  socialInstagram: { type: String, trim: true },
  socialLinkedin: { type: String, trim: true },
  socialTwitter: { type: String, trim: true },
  socialWhatsapp: { type: String, trim: true },
  socialYoutube: { type: String, trim: true },
  images: [{ type: String }],
  gstin: { type: String, uppercase: true, trim: true },
  panNumber: { type: String, uppercase: true, trim: true },
  fssaiNumber: { type: String, trim: true },
  documents: { type: [documentSchema], default: [] },
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  rejectionReason: { type: String },
  submittedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  reviewedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  reviewedAt: { type: Date },
  vendorUser: { type: Schema.Types.ObjectId, ref: 'User' },
  vendorCode: { type: String, uppercase: true, trim: true },
  vendorSince: { type: Date },
  credentialsSentAt: { type: Date },
  credentialsEmailStatus: { type: String, enum: ['sent', 'failed'] },
}, { timestamps: true });

businessSchema.index({ status: 1, createdAt: -1 });
businessSchema.index({ name: 'text', tagline: 'text', description: 'text' });

export const Business = mongoose.model<IBusiness>('Business', businessSchema);
