import { Response, NextFunction } from 'express';
import { Types } from 'mongoose';
import { AuthRequest, authMiddleware } from './auth.middleware';
import { User } from '../models/User';
import { Business } from '../models/Business';
import { Product } from '../models/Product';
import { Coupon } from '../models/Coupon';
import { ReturnRequest } from '../models/ReturnRequest';
import { sendError } from '../services/apiResponse';
import { tenantContext } from '../utils/tenantContext';

export interface VendorRequest extends AuthRequest {
  vendor?: {
    businessId: string;
    storeName: string;
  };
}

// Step 2 of authenticateVendor: must be a vendor, with an approved store and no pending password change.
const requireVendor = async (req: VendorRequest, res: Response, next: NextFunction) => {
  try {
    if (req.user?.role !== 'vendor') {
      return sendError(res, 'Access denied. Vendor account required.', 403);
    }
    const user = await User.findById(req.user.userId).select('businessId mustChangePassword isBlocked');
    if (!user || user.isBlocked || !user.businessId) {
      return sendError(res, 'Vendor account is not active.', 403);
    }
    const business = await Business.findById(user.businessId).select('name status');
    if (!business || business.status !== 'approved') {
      return sendError(res, 'Your vendor store is not approved.', 403);
    }
    if (user.mustChangePassword) {
      return res.status(403).json({ success: false, code: 'PASSWORD_CHANGE_REQUIRED', message: 'Please change your temporary password first.' });
    }

    req.vendor = { businessId: String(business._id), storeName: business.name };
    // everything after this point (including controllers) runs inside the vendor context
    tenantContext.run({ vendorId: String(business._id), userId: String(user._id) }, () => next());
  } catch (err) {
    next(err);
  }
};

export const authenticateVendor = [authMiddleware, requireVendor];

// The reused admin controllers check req.user.isAdmin. Used ONLY on the specific vendor routes that are
// ownership-checked first, so a vendor never reaches an admin endpoint that is not on the vendor router.
export const vendorActsAsAdmin = (req: VendorRequest, _res: Response, next: NextFunction) => {
  if (req.user) req.user.isAdmin = true;
  next();
};

const validId = (id: unknown): id is string => typeof id === 'string' && Types.ObjectId.isValid(id);

export const requireOwnProduct = (param = 'id') =>
  async (req: VendorRequest, res: Response, next: NextFunction) => {
    try {
      const id = req.params[param];
      if (!validId(id)) return sendError(res, 'Invalid product id', 400);
      const owned = await Product.exists({ _id: id, vendor: req.vendor!.businessId });
      if (!owned) return sendError(res, 'Product not found', 404);
      next();
    } catch (err) { next(err); }
  };

// bulk stock update: every product in the payload must belong to this vendor
export const requireOwnProductsInBody = async (req: VendorRequest, res: Response, next: NextFunction) => {
  try {
    const updates: any[] = Array.isArray(req.body?.updates) ? req.body.updates : [];
    const ids = updates.map((u) => u?.productId).filter(Boolean);
    if (!ids.length || !ids.every(validId)) return sendError(res, 'Invalid product ids', 400);
    const count = await Product.countDocuments({ _id: { $in: ids }, vendor: req.vendor!.businessId });
    if (count !== new Set(ids).size) return sendError(res, 'One or more products were not found', 404);
    next();
  } catch (err) { next(err); }
};

export const requireOwnCoupon = async (req: VendorRequest, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id;
    if (!validId(id)) return sendError(res, 'Invalid coupon id', 400);
    const owned = await Coupon.exists({ _id: id, createdBy: req.user!.userId });
    if (!owned) return sendError(res, 'Coupon not found', 404);
    next();
  } catch (err) { next(err); }
};

// A return is the vendor's when at least one of its items is one of the vendor's products.
export const requireOwnReturn = async (req: VendorRequest, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id;
    if (!validId(id)) return sendError(res, 'Invalid return id', 400);
    const ret: any = await ReturnRequest.findById(id).select('items.productId').lean();
    if (!ret) return sendError(res, 'Return request not found', 404);
    const productIds = (ret.items || []).map((i: any) => i.productId).filter(Boolean);
    const owned = productIds.length
      ? await Product.exists({ _id: { $in: productIds }, vendor: req.vendor!.businessId })
      : null;
    if (!owned) return sendError(res, 'Return request not found', 404);
    next();
  } catch (err) { next(err); }
};
