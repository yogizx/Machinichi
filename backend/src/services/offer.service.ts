import { Coupon } from '../models/Coupon';
import { Product } from '../models/Product';
import { User } from '../models/User';

export type ScratchRuleBasis = 'quantity' | 'order_amount';
export type ScratchRuleDiscountType = 'Percentage' | 'Fixed';

export interface ScratchRuleLike {
  basis: ScratchRuleBasis;
  threshold: number;
  discountType: ScratchRuleDiscountType;
  discountValue: number;
  label?: string;
}

export interface ScratchReward {
  couponId: string;
  code: string;
  name: string;
  description: string;
  label: string;
  discountType: ScratchRuleDiscountType;
  discountValue: number;
  discountAmount: number;
  matchedRule: ScratchRuleLike;
  isDefault?: boolean;
}

export interface FreeDeliveryOffer {
  couponId: string;
  code: string;
  name: string;
  description: string;
  districts: string[];
  districtMatched: boolean;
  unrestricted: boolean;
}

const roundMoney = (value: number) => Math.round(Number(value) * 100) / 100;

export const normalizeDistrict = (value?: string | null): string =>
  String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');

export const dedupeDistricts = (values?: string[] | null): string[] => {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values ?? []) {
    const trimmed = String(value ?? '').trim().replace(/\s+/g, ' ');
    const key = normalizeDistrict(trimmed);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(trimmed);
  }
  return result;
};

export const isDistrictEligible = (districts?: string[] | null, district?: string | null): boolean => {
  const configured = dedupeDistricts(districts);
  if (configured.length === 0) return true;
  return configured.some((item) => normalizeDistrict(item) === normalizeDistrict(district));
};

export const mapScratchRuleInput = (rule: {
  basis: string;
  threshold: number;
  discountType: string;
  discountValue: number;
  label?: string;
}): ScratchRuleLike => ({
  basis: rule.basis === 'order_amount' ? 'order_amount' : 'quantity',
  threshold: Math.max(Number(rule.threshold) || 0, 0),
  discountType: rule.discountType === 'fixed' ? 'Fixed' : 'Percentage',
  discountValue: Math.max(Number(rule.discountValue) || 0, 0),
  ...(rule.label ? { label: rule.label.trim() } : {}),
});

export const isScratchRuleMatch = (rule: ScratchRuleLike, totalQuantity: number, orderAmount: number): boolean => {
  if (rule.basis === 'quantity') return totalQuantity >= rule.threshold;
  return orderAmount >= rule.threshold;
};

export const getScratchRuleDiscount = (rule: ScratchRuleLike, orderAmount: number): number => {
  if (orderAmount <= 0 || rule.discountValue <= 0) return 0;
  const raw = rule.discountType === 'Fixed'
    ? rule.discountValue
    : (orderAmount * Math.min(rule.discountValue, 100)) / 100;
  return roundMoney(Math.min(raw, orderAmount));
};

export const buildScratchRuleLabel = (rule: ScratchRuleLike): string => {
  if (rule.label) return rule.label;
  const value = rule.discountType === 'Fixed'
    ? `₹${Math.round(rule.discountValue).toLocaleString('en-IN')} OFF`
    : `${Math.round(rule.discountValue * 100) / 100}% OFF`;
  return rule.basis === 'quantity'
    ? `${value} for ${rule.threshold}+ item${rule.threshold === 1 ? '' : 's'}`
    : `${value} on orders above ₹${Math.round(rule.threshold).toLocaleString('en-IN')}`;
};

const isCouponLive = (coupon: any, now: Date): boolean => {
  if (!coupon) return false;
  if (coupon.isActive === false) return false;
  if (coupon.status && coupon.status !== 'active') return false;
  if (coupon.startsAt && new Date(coupon.startsAt) > now) return false;
  if (coupon.expiresAt && new Date(coupon.expiresAt) < now) return false;
  if (coupon.usageLimit > 0 && coupon.usedCount >= coupon.usageLimit) return false;
  return true;
};

export const resolveScratchReward = (
  coupon: any,
  context: { totalQuantity: number; orderAmount: number }
): ScratchReward | null => {
  if (!isCouponLive(coupon, new Date())) return null;
  if (coupon.offerType !== 'scratch_card') return null;

  const rules: ScratchRuleLike[] = Array.isArray(coupon.scratchRules) ? coupon.scratchRules : [];
  if (rules.length === 0) return null;

  const matches = rules
    .filter((rule) => isScratchRuleMatch(rule, context.totalQuantity, context.orderAmount))
    .map((rule, index) => ({ rule, index, discountAmount: getScratchRuleDiscount(rule, context.orderAmount) }))
    .filter((entry) => entry.discountAmount > 0);

  if (matches.length === 0) return null;

  matches.sort((a, b) => {
    if (b.discountAmount !== a.discountAmount) return b.discountAmount - a.discountAmount;
    if (b.rule.threshold !== a.rule.threshold) return b.rule.threshold - a.rule.threshold;
    return a.index - b.index;
  });

  const best = matches[0];
  let discountAmount = best.discountAmount;
  if (coupon.maxDiscountAmount && coupon.maxDiscountAmount > 0) {
    discountAmount = Math.min(discountAmount, coupon.maxDiscountAmount);
  }
  discountAmount = roundMoney(Math.min(discountAmount, context.orderAmount));

  return {
    couponId: String(coupon._id),
    code: coupon.code,
    name: coupon.name,
    description: coupon.description || '',
    label: buildScratchRuleLabel(best.rule),
    discountType: best.rule.discountType,
    discountValue: best.rule.discountValue,
    discountAmount,
    matchedRule: best.rule,
  };
};

export const pickBestScratchReward = (
  coupons: any[],
  context: { totalQuantity: number; orderAmount: number }
): ScratchReward | null => {
  const rewards = (coupons || [])
    .filter((coupon) => coupon.offerType === 'scratch_card')
    .map((coupon) => resolveScratchReward(coupon, context))
    .filter((reward): reward is ScratchReward => reward !== null);

  if (rewards.length === 0) return null;

  rewards.sort((a, b) => {
    if (b.discountAmount !== a.discountAmount) return b.discountAmount - a.discountAmount;
    if (b.discountValue !== a.discountValue) return b.discountValue - a.discountValue;
    return String(a.couponId).localeCompare(String(b.couponId));
  });

  return rewards[0];
};

// Default scratch card used on /checkout when the admin has NOT created any live scratch card offer.
export const DEFAULT_SCRATCH_PERCENT = 3;

export const hasLiveScratchOffer = (coupons: any[]): boolean =>
  (coupons || []).some((coupon) => coupon.offerType === 'scratch_card' && isCouponLive(coupon, new Date()));

export const buildDefaultScratchReward = (orderAmount: number): ScratchReward | null => {
  if (!(orderAmount > 0)) return null;
  const discountAmount = Math.min(roundMoney((orderAmount * DEFAULT_SCRATCH_PERCENT) / 100), orderAmount);
  if (discountAmount <= 0) return null;
  return {
    couponId: '',
    code: 'DEFAULT3',
    name: 'Default Scratch Offer',
    description: `${DEFAULT_SCRATCH_PERCENT}% off your order`,
    label: `${DEFAULT_SCRATCH_PERCENT}% OFF on your order`,
    discountType: 'Percentage',
    discountValue: DEFAULT_SCRATCH_PERCENT,
    discountAmount,
    matchedRule: { basis: 'order_amount', threshold: 0, discountType: 'Percentage', discountValue: DEFAULT_SCRATCH_PERCENT },
    isDefault: true,
  };
};

// Admin scratch card offers drive the reward. Only when the admin has none live does the 3% default apply.
export const resolveScratchRewardWithDefault = (
  coupons: any[],
  context: { totalQuantity: number; orderAmount: number }
): ScratchReward | null => {
  const reward = pickBestScratchReward(coupons, context);
  if (reward) return reward;
  return hasLiveScratchOffer(coupons) ? null : buildDefaultScratchReward(context.orderAmount);
};

export const resolveFreeDeliveryOffer = (coupons: any[], district?: string | null): FreeDeliveryOffer | null => {
  const live = (coupons || []).filter((coupon) => isCouponLive(coupon, new Date()));

  const freeDeliveryCoupons = live.filter(
    (coupon) => coupon.discountType === 'Free Delivery' && coupon.offerType !== 'scratch_card'
  );
  if (freeDeliveryCoupons.length === 0) return null;

  const districtMatched = freeDeliveryCoupons.find((coupon) => isDistrictEligible(coupon.freeDeliveryDistricts, district));
  if (districtMatched) {
    return {
      couponId: String(districtMatched._id),
      code: districtMatched.code,
      name: districtMatched.name,
      description: districtMatched.description || '',
      districts: dedupeDistricts(districtMatched.freeDeliveryDistricts),
      districtMatched: true,
      unrestricted: dedupeDistricts(districtMatched.freeDeliveryDistricts).length === 0,
    };
  }

  return {
    couponId: String(freeDeliveryCoupons[0]._id),
    code: freeDeliveryCoupons[0].code,
    name: freeDeliveryCoupons[0].name,
    description: freeDeliveryCoupons[0].description || '',
    districts: dedupeDistricts(freeDeliveryCoupons[0].freeDeliveryDistricts),
    districtMatched: false,
    unrestricted: dedupeDistricts(freeDeliveryCoupons[0].freeDeliveryDistricts).length === 0,
  };
};

export const isOfferLive = (coupon: any, now = new Date()): boolean => isCouponLive(coupon, now);

/* ───────────── Vendor-scoped offers ─────────────
 * An offer created from the vendor dashboard belongs to that vendor's store: it only discounts the vendor's own
 * products in the cart. Offers without a vendor (created by admin) apply to the whole cart as before.
 */

export interface OfferCartItem {
  productId: string;
  vendor?: string | null; // the store (Business) that owns the product
  quantity: number;
  lineTotal: number;
}

export const VENDOR_OFFER_ONLY_MESSAGE =
  'This offer is valid only on products from the store that created it, and your cart has none of them.';
export const VENDOR_FREE_DELIVERY_MESSAGE =
  'This free delivery offer is valid only when every item in your cart is from the store that created it.';

// The store an offer belongs to. Offers made before the vendor field existed are traced through their creator.
export const getCouponVendorId = async (coupon: any): Promise<string | null> => {
  if (!coupon) return null;
  if (coupon.vendor) return String(coupon.vendor);
  if (coupon.createdBy) {
    const creator: any = await User.findById(coupon.createdBy).select('role businessId').lean();
    if (creator?.role === 'vendor' && creator.businessId) return String(creator.businessId);
  }
  return null;
};

export interface VendorOfferScope {
  scoped: boolean;        // true when the offer is limited to its owner's products (a vendor's store, or the admin's own products)
  orderAmount: number;    // amount the offer may discount (only the owner's own items when scoped)
  totalQuantity: number;  // quantity the offer may count (only the owner's own items when scoped)
  eligibleCount: number;  // how many cart lines belong to the offer's owner
  allEligible: boolean;   // every cart line belongs to the offer's owner
}

// An offer applies only to products of whoever created it: a vendor's offer to that vendor's products, an admin's
// offer to the admin's own products (products that have no vendor).
export const scopeOfferToCart = async (
  coupon: any,
  items: OfferCartItem[] | undefined,
  totals: { orderAmount: number; totalQuantity: number },
): Promise<VendorOfferScope> => {
  const vendorId = await getCouponVendorId(coupon);
  // Admin offer while the cart lines are unknown (older client): nothing to scope by, totals are used as given.
  if (!vendorId && !items) {
    return { scoped: false, orderAmount: totals.orderAmount, totalQuantity: totals.totalQuantity, eligibleCount: 0, allEligible: true };
  }
  // Vendor offers fail closed: when the cart lines are unknown, a vendor offer matches nothing.
  const own = (items ?? []).filter((item) => (item.vendor ? String(item.vendor) : null) === vendorId);
  return {
    scoped: true,
    orderAmount: roundMoney(own.reduce((sum, item) => sum + (Number(item.lineTotal) || 0), 0)),
    totalQuantity: own.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0),
    eligibleCount: own.length,
    allEligible: !!items && items.length > 0 && own.length === items.length,
  };
};

// Cart lines (productId + quantity + price) -> offer lines, with the owning store read from the product itself,
// never from anything the browser sent.
export const buildOfferCartItems = async (
  rows: Array<{ productId: any; quantity: number; sellingPrice?: number; lineTotal?: number }>,
): Promise<OfferCartItem[]> => {
  const ids = Array.from(new Set(rows.map((row) => String(row.productId))));
  const products = ids.length ? await Product.find({ _id: { $in: ids } }).select('vendor').lean() : [];
  const vendorById = new Map<string, string | null>(
    products.map((product: any) => [String(product._id), product.vendor ? String(product.vendor) : null]),
  );
  return rows.map((row) => {
    const quantity = Number(row.quantity) || 0;
    return {
      productId: String(row.productId),
      vendor: vendorById.get(String(row.productId)) ?? null,
      quantity,
      lineTotal: row.lineTotal != null ? Number(row.lineTotal) : (Number(row.sellingPrice) || 0) * quantity,
    };
  });
};

// Keeps only the offers that can apply to this cart: vendor offers need at least one of that vendor's products
// (a vendor free-delivery offer needs the whole cart to be that vendor's).
export const filterOffersForCart = async (coupons: any[], items: OfferCartItem[] | undefined): Promise<any[]> => {
  const result: any[] = [];
  for (const coupon of coupons || []) {
    const scope = await scopeOfferToCart(coupon, items, { orderAmount: 0, totalQuantity: 0 });
    if (!scope.scoped) { result.push(coupon); continue; }
    if (scope.eligibleCount === 0) continue;
    if (coupon.discountType === 'Free Delivery' && !scope.allEligible) continue;
    result.push(coupon);
  }
  return result;
};

// Same ranking as pickBestScratchReward, but a vendor's scratch card is worked out on that vendor's items only.
export const pickBestScratchRewardForCart = async (
  coupons: any[],
  items: OfferCartItem[] | undefined,
  totals: { totalQuantity: number; orderAmount: number },
): Promise<ScratchReward | null> => {
  const rewards: ScratchReward[] = [];
  for (const coupon of coupons || []) {
    if (coupon.offerType !== 'scratch_card') continue;
    const scope = await scopeOfferToCart(coupon, items, totals);
    if (scope.scoped && scope.eligibleCount === 0) continue;
    const reward = resolveScratchReward(coupon, { totalQuantity: scope.totalQuantity, orderAmount: scope.orderAmount });
    if (reward) rewards.push(reward);
  }
  if (rewards.length === 0) return null;
  rewards.sort((a, b) => {
    if (b.discountAmount !== a.discountAmount) return b.discountAmount - a.discountAmount;
    if (b.discountValue !== a.discountValue) return b.discountValue - a.discountValue;
    return String(a.couponId).localeCompare(String(b.couponId));
  });
  return rewards[0];
};

// Only admin scratch cards switch the 3% default off; a single vendor's scratch card must not do that for everyone.
export const hasLiveAdminScratchOffer = async (coupons: any[]): Promise<boolean> => {
  for (const coupon of coupons || []) {
    if (coupon.offerType === 'scratch_card' && isCouponLive(coupon, new Date()) && !(await getCouponVendorId(coupon))) return true;
  }
  return false;
};

export const resolveScratchRewardWithDefaultForCart = async (
  coupons: any[],
  items: OfferCartItem[] | undefined,
  totals: { totalQuantity: number; orderAmount: number },
): Promise<ScratchReward | null> => {
  const reward = await pickBestScratchRewardForCart(coupons, items, totals);
  if (reward) return reward;
  return (await hasLiveAdminScratchOffer(coupons)) ? null : buildDefaultScratchReward(totals.orderAmount);
};

export interface AppliedOfferResolution {
  coupon: any | null;
  scratchReward: ScratchReward | null;
  freeDelivery: boolean;
  discountAmount: number;
  error: string | null;
}

export const resolveAppliedOffer = async (input: {
  couponId?: string | null;
  district?: string | null;
  totalQuantity: number;
  orderAmount: number;
  // The cart lines (with their owning store). Needed for vendor offers, which only discount that vendor's items.
  items?: OfferCartItem[];
}): Promise<AppliedOfferResolution> => {
  const empty: AppliedOfferResolution = {
    coupon: null,
    scratchReward: null,
    freeDelivery: false,
    discountAmount: 0,
    error: null,
  };

  const couponId = input.couponId ? String(input.couponId) : '';
  if (!couponId) return empty;

  const coupon = await Coupon.findById(couponId).lean();
  if (!coupon) return { ...empty, error: 'This offer could not be found' };
  if (!isOfferLive(coupon)) return { ...empty, coupon, error: 'This offer is no longer active' };

  // A vendor's offer only counts that vendor's own items (and needs at least one of them in the cart).
  const scope = await scopeOfferToCart(coupon, input.items, {
    orderAmount: input.orderAmount,
    totalQuantity: input.totalQuantity,
  });
  if (scope.scoped && scope.eligibleCount === 0) {
    return { ...empty, coupon, error: VENDOR_OFFER_ONLY_MESSAGE };
  }
  const orderAmount = scope.orderAmount;
  const totalQuantity = scope.totalQuantity;

  if (coupon.offerType === 'scratch_card') {
    const reward = resolveScratchReward(coupon, { totalQuantity, orderAmount });
    if (!reward) {
      return { ...empty, coupon, error: 'This scratch card offer does not match your cart' };
    }
    return { coupon, scratchReward: reward, freeDelivery: false, discountAmount: reward.discountAmount, error: null };
  }

  if (coupon.discountType === 'Free Delivery') {
    // Free delivery waives shipping for the whole order, so a vendor's offer needs the whole cart to be theirs.
    if (scope.scoped && !scope.allEligible) {
      return { ...empty, coupon, error: VENDOR_FREE_DELIVERY_MESSAGE };
    }
    if (!isDistrictEligible(coupon.freeDeliveryDistricts, input.district)) {
      return {
        coupon,
        scratchReward: null,
        freeDelivery: false,
        discountAmount: 0,
        error: buildFreeDeliveryRejectionMessage(coupon, input.district),
      };
    }
    return { coupon, scratchReward: null, freeDelivery: true, discountAmount: 0, error: null };
  }

  if (coupon.minOrderAmount > 0 && orderAmount < coupon.minOrderAmount) {
    return {
      ...empty,
      coupon,
      error: `Minimum order amount of ₹${coupon.minOrderAmount} required`,
    };
  }

  if (coupon.minQuantity > 0 && totalQuantity < coupon.minQuantity) {
    return {
      ...empty,
      coupon,
      error: `Minimum ${coupon.minQuantity} items required for this offer`,
    };
  }

  const raw = (orderAmount * Math.min(Number(coupon.discountValue) || 0, 100)) / 100;
  const capped = coupon.maxDiscountAmount ? Math.min(raw, coupon.maxDiscountAmount) : raw;

  return {
    coupon,
    scratchReward: null,
    freeDelivery: false,
    discountAmount: roundMoney(Math.min(capped, orderAmount)),
    error: null,
  };
};

export const buildFreeDeliveryRejectionMessage = (coupon: any, district?: string | null): string => {
  const districts = dedupeDistricts(coupon?.freeDeliveryDistricts);
  if (districts.length === 0) {
    return 'This free delivery offer is not available right now.';
  }
  const target = String(district ?? '').trim();
  if (!target) {
    return `Free delivery is only available in: ${districts.slice(0, 5).join(', ')}. Add your delivery district to continue.`;
  }
  return `Free delivery for this offer is limited to: ${districts.slice(0, 5).join(', ')}.`;
};

export const getActiveOfferCoupons = async (): Promise<any[]> => {
  return Coupon.find({
    isActive: true,
    status: 'active',
    startsAt: { $lte: new Date() },
    expiresAt: { $gte: new Date() },
    $expr: { $or: [{ $lte: [{ $ifNull: ['$usageLimit', 0] }, 0] }, { $lt: ['$usedCount', '$usageLimit'] }] }, // usageLimit 0 / empty / missing = unlimited
  }).lean();
};
