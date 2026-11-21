import { Types } from 'mongoose';
import { Product } from '../models/Product';

/**
 * Seller rating = review-weighted average of the rating of every product the vendor sells.
 * Returns rating = null when none of the vendor's products has been reviewed yet.
 */
export async function computeVendorRating(vendorId: string | Types.ObjectId): Promise<{ rating: number | null; ratingCount: number }> {
  const rows = await Product.aggregate([
    { $match: { vendor: new Types.ObjectId(String(vendorId)), isDeleted: false, reviewCount: { $gt: 0 } } },
    { $group: { _id: null, weighted: { $sum: { $multiply: ['$averageRating', '$reviewCount'] } }, count: { $sum: '$reviewCount' } } },
  ]);
  if (!rows.length || !rows[0].count) return { rating: null, ratingCount: 0 };
  return {
    rating: Math.round((rows[0].weighted / rows[0].count) * 10) / 10,
    ratingCount: rows[0].count,
  };
}
