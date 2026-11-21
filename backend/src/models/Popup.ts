import mongoose, { Schema } from 'mongoose';

/**
 * Home page popup (a single document).
 * The admin uploads an image + a redirect URL; the storefront shows it on the
 * home page and redirects to `linkUrl` when the visitor clicks / taps it.
 */
export interface IPopup extends mongoose.Document {
  imageUrl: string;
  linkUrl?: string;
  isActive: boolean;
  updatedBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const popupSchema = new Schema<IPopup>({
  imageUrl: { type: String, required: true },
  linkUrl: { type: String, default: '' },
  isActive: { type: Boolean, default: true },
  updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

export const Popup = mongoose.model<IPopup>('Popup', popupSchema);
