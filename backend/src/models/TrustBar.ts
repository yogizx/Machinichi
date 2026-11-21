import mongoose, { Schema } from 'mongoose';

/**
 * Home page banner "highlights" bar (a single document).
 * The row of short selling points shown at the bottom of the hero banner, e.g.
 * "100% Natural - No Additives". The admin edits the icon, title and subtitle
 * of every item from /admin/banner-images.
 */

// Icon keys the admin may choose from. Keep in sync with src/utils/trustBarIcons.js.
export const TRUST_BAR_ICON_KEYS = [
  'leaf', 'flask', 'tractor', 'truck', 'shield-check', 'sprout', 'wheat',
  'award', 'badge-check', 'heart', 'star', 'package', 'clock', 'thumbs-up',
  'gift', 'percent', 'recycle', 'droplets', 'sun',
] as const;

export const MAX_TRUST_BAR_ITEMS = 6;

export interface ITrustBarItem {
  icon: string;
  title: string;
  subtitle: string;
}

export interface ITrustBar extends mongoose.Document {
  items: ITrustBarItem[];
  isActive: boolean;
  updatedBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const trustBarSchema = new Schema<ITrustBar>({
  items: [{
    _id: false,
    icon: { type: String, required: true },
    title: { type: String, required: true },
    subtitle: { type: String, default: '' },
  }],
  isActive: { type: Boolean, default: true },
  updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

export const TrustBar = mongoose.model<ITrustBar>('TrustBar', trustBarSchema);
