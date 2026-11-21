import { Response, NextFunction } from 'express';
import { Types } from 'mongoose';
import { Product } from '../models/Product';
import { Coupon } from '../models/Coupon';
import { ReturnRequest } from '../models/ReturnRequest';
import { Order } from '../models/Order';
import { Business } from '../models/Business';
import { sendSuccess, sendError, sendPaginated } from '../services/apiResponse';
import { productQuerySchema } from '../validators';
import { computeVendorRating } from '../services/vendorStats.service';
import { VendorRequest } from '../middlewares/vendor.middleware';

const vendorOid = (req: VendorRequest) => new Types.ObjectId(req.vendor!.businessId);

const PENDING_RETURN_STATUSES = ['submitted', 'under_review', 'Requested', 'pending', 'Processing', 'processing'];
const CLOSED_RETURN_STATUSES = ['completed', 'rejected', 'cancelled', 'Completed', 'Rejected', 'Cancelled'];

/* ───────────────────────── Dashboard ───────────────────────── */

export const getVendorDashboard = async (req: VendorRequest, res: Response, next: NextFunction) => {
  try {
    const vendorId = vendorOid(req);
    const base = { vendor: vendorId, isDeleted: false };

    const productIds = await Product.distinct('_id', { vendor: vendorId });
    const since30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const salesMatch = {
      paymentStatus: 'Paid',
      orderStatus: { $nin: ['Cancelled', 'Returned'] },
      'items.productId': { $in: productIds },
    };

    const [
      business, rating, totalProducts, publishedProducts, lowStock, outOfStock,
      pendingReturns, openReturns, couponTotal, couponLive, couponDraft, salesAgg, topProducts,
    ] = await Promise.all([
      Business.findById(vendorId).select('name vendorSince vendorCode').lean(),
      computeVendorRating(vendorId),
      Product.countDocuments(base),
      Product.countDocuments({ ...base, publishStatus: 'published' }),
      Product.countDocuments({ ...base, quantity: { $gt: 0 }, $expr: { $lte: ['$quantity', '$lowStockThreshold'] } }),
      Product.countDocuments({ ...base, quantity: { $lte: 0 } }),
      ReturnRequest.countDocuments({ 'items.productId': { $in: productIds }, status: { $in: PENDING_RETURN_STATUSES } }),
      ReturnRequest.countDocuments({ 'items.productId': { $in: productIds }, status: { $nin: CLOSED_RETURN_STATUSES } }),
      Coupon.countDocuments({ createdBy: req.user!.userId }),
      Coupon.countDocuments({ createdBy: req.user!.userId, isActive: true, status: 'active' }),
      Coupon.countDocuments({ createdBy: req.user!.userId, status: 'draft' }),
      // paid, non-cancelled sales of this vendor's items only (other vendors' lines in a mixed cart are excluded)
      Order.aggregate([
        { $match: salesMatch },
        { $unwind: '$items' },
        { $match: { 'items.productId': { $in: productIds } } },
        { $group: {
          _id: null,
          units: { $sum: '$items.quantity' },
          revenue: { $sum: '$items.lineTotal' },
          orders: { $addToSet: '$_id' },
          units30: { $sum: { $cond: [{ $gte: ['$createdAt', since30] }, '$items.quantity', 0] } },
          revenue30: { $sum: { $cond: [{ $gte: ['$createdAt', since30] }, '$items.lineTotal', 0] } },
        } },
      ]),
      Order.aggregate([
        { $match: salesMatch },
        { $unwind: '$items' },
        { $match: { 'items.productId': { $in: productIds } } },
        { $group: { _id: '$items.productId', name: { $first: '$items.name' }, units: { $sum: '$items.quantity' }, revenue: { $sum: '$items.lineTotal' } } },
        { $sort: { revenue: -1 } },
        { $limit: 5 },
      ]),
    ]);

    const s = salesAgg[0];
    return sendSuccess(res, {
      data: {
        store: {
          name: business?.name || req.vendor!.storeName,
          vendorCode: business?.vendorCode,
          vendorSince: business?.vendorSince,
          rating: rating.rating,
          ratingCount: rating.ratingCount,
        },
        products: { total: totalProducts, published: publishedProducts, lowStock, outOfStock },
        returns: { pending: pendingReturns, open: openReturns },
        coupons: { total: couponTotal, live: couponLive, awaitingApproval: couponDraft },
        sales: {
          units: s?.units || 0,
          revenue: Math.round((s?.revenue || 0) * 100) / 100,
          orders: s?.orders?.length || 0,
          units30: s?.units30 || 0,
          revenue30: Math.round((s?.revenue30 || 0) * 100) / 100,
        },
        topProducts,
      },
    });
  } catch (error) {
    next(error);
  }
};

/* ───────────── Products & inventory (vendor-scoped copies of the admin lists) ───────────── */

export const getVendorProducts = async (req: VendorRequest, res: Response, next: NextFunction) => {
  try {
    const validation = productQuerySchema.safeParse(req.query);
    if (!validation.success) return sendError(res, 'Validation failed', 400, validation.error.issues);

    const { page, limit, sort, order, search, category, isActive, publishStatus, inStock } = validation.data as any;
    const filter: any = { isDeleted: false, vendor: vendorOid(req) };

    if (search) {
      const searchRegex = { $regex: search, $options: 'i' };
      filter.$or = [
        { name: searchRegex }, { slug: searchRegex }, { brand: searchRegex }, { description: searchRegex },
        { shortDescription: searchRegex }, { tags: searchRegex }, { sku: searchRegex }, { hsnCode: searchRegex },
        { 'variants.name': searchRegex }, { 'variants.material': searchRegex }, { 'variants.colorName': searchRegex },
        { 'variants.size': searchRegex }, { 'variants.sku': searchRegex },
      ];
    }
    if (category) filter.category = new Types.ObjectId(category);
    if (isActive !== undefined) filter.isActive = isActive;
    if (publishStatus) filter.publishStatus = publishStatus;
    if (inStock) {
      filter.$and = [{ $or: [{ quantity: { $gt: 0 } }, { 'variants.quantity': { $gt: 0 } }] }];
    }

    const sortField = (!sort || sort === 'createdAt') ? '_id' : sort;
    const sortOption: any = { [sortField]: order === 'asc' ? 1 : -1 };
    const skip = (page - 1) * limit;

    const pipeline: any[] = [
      { $match: filter },
      { $lookup: { from: 'categories', localField: 'category', foreignField: '_id', as: '_cat', pipeline: [{ $project: { name: 1, slug: 1 } }] } },
      { $addFields: { category: { $first: '$_cat' } } },
      { $addFields: {
        _cleanVariants: {
          $map: {
            input: { $ifNull: ['$variants', []] },
            as: 'v',
            in: {
              name: '$$v.name', size: '$$v.size', sku: '$$v.sku',
              sellingPrice: '$$v.sellingPrice', mrpPrice: '$$v.mrpPrice', costPrice: '$$v.costPrice',
              quantity: '$$v.quantity', isAvailable: '$$v.isAvailable', status: '$$v.status',
              material: '$$v.material', colorName: '$$v.colorName', unit: '$$v.unit', unitQuantity: '$$v.unitQuantity',
              attributes: '$$v.attributes',
              images: {
                $filter: {
                  input: { $ifNull: ['$$v.images', []] },
                  as: 'img',
                  cond: { $not: [{ $regexMatch: { input: '$$img.url', regex: '^data:' } }] },
                },
              },
            },
          },
        },
      } },
      { $project: {
        name: 1, slug: 1, sku: 1, barcode: 1, brand: 1, subCategory: 1,
        mrpPrice: 1, sellingPrice: 1, costPrice: 1, quantity: 1, warehouseStock: 1, reservedQuantity: 1,
        publishStatus: 1, status: 1, isFeatured: 1, badges: 1, weight: 1, unitType: 1,
        variantType: 1, variantTypeImages: 1, createdAt: 1, updatedAt: 1, category: 1,
        variants: '$_cleanVariants',
      } },
      { $sort: sortOption },
      { $skip: skip },
      { $limit: limit },
    ];

    const [rawProducts, total] = await Promise.all([
      Product.aggregate(pipeline).allowDiskUse(true),
      Product.countDocuments(filter),
    ]);

    const products = rawProducts.map((p: any) => {
      if (!p.images || p.images.length === 0) {
        const variantImage = p.variants?.find((v: any) => v.images?.[0]?.url && !v.images[0].url.startsWith('data:'))?.images?.[0];
        p.images = variantImage ? [variantImage] : [];
      }
      p.variants = p.variants || [];
      return p;
    });

    return sendPaginated(res, products, total, page, limit);
  } catch (error) {
    next(error);
  }
};

export const getVendorInventory = async (req: VendorRequest, res: Response, next: NextFunction) => {
  try {
    const { page = '1', limit = '50', lowStockOnly, search } = req.query as Record<string, string>;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(200, Math.max(1, parseInt(limit, 10) || 50));
    const filter: any = { isDeleted: false, vendor: vendorOid(req) };

    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { sku: { $regex: search, $options: 'i' } },
        { barcode: { $regex: search, $options: 'i' } },
      ];
    }
    if (lowStockOnly === 'true') filter.$expr = { $lte: ['$quantity', '$lowStockThreshold'] };

    const [products, total] = await Promise.all([
      Product.find(filter)
        .select('name slug sku barcode brand manufacturerName category subCategory quantity warehouseStock reservedQuantity openingStock minStock maxStock lowStockThreshold reorderLevel warehouse rackLocation batchNumber lotNumber serialNumber expiryDate manufacturingDate inventoryType trackInventory publishStatus thumbnail costPrice mrpPrice sellingPrice')
        .sort({ _id: -1 })
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum)
        .populate('category', 'name slug')
        .populate('subCategory', 'name slug')
        .lean(),
      Product.countDocuments(filter),
    ]);

    const withFlags = products.map((obj: any) => {
      obj.images = obj.thumbnail ? [{ url: obj.thumbnail }] : [];
      obj.isLowStock = (obj.quantity || 0) <= (obj.lowStockThreshold || 10);
      obj.isOutOfStock = (obj.quantity || 0) <= 0;
      obj.availableStock = Math.max(0, (obj.quantity || 0) - (obj.reservedQuantity || 0));
      return obj;
    });

    return sendPaginated(res, withFlags, total, pageNum, limitNum);
  } catch (error) {
    next(error);
  }
};

// A vendor's products default to their store name as brand, so two vendors selling a product with the
// same name do not collide on the unique (name, brand) index.
export const prepareVendorProduct = (req: VendorRequest, _res: Response, next: NextFunction) => {
  if (!req.body || typeof req.body !== 'object') return next();
  if (!req.body.brand || !String(req.body.brand).trim()) req.body.brand = req.vendor!.storeName;
  next();
};

// Suppliers are a store-wide admin concept; the vendor inventory page just gets an empty list.
export const getVendorSuppliers = (_req: VendorRequest, res: Response) => sendPaginated(res, [], 0, 1, 200);

/* ───────────────────────── Coupons ───────────────────────── */

export const listVendorCoupons = async (req: VendorRequest, res: Response, next: NextFunction) => {
  try {
    const coupons = await Coupon.find({ createdBy: req.user!.userId }).sort({ createdAt: -1 });
    return sendSuccess(res, { data: coupons });
  } catch (error) {
    next(error);
  }
};

// Vendor coupons are saved as drafts: an admin has to switch them on, because checkout applies a coupon
// to the whole cart and would otherwise let a vendor create store-wide discounts on their own.
export const forceVendorCouponDraft = (req: VendorRequest, _res: Response, next: NextFunction) => {
  req.body = { ...(req.body || {}), status: 'draft', isActive: false };
  next();
};

export const guardVendorCouponChange = async (req: VendorRequest, res: Response, next: NextFunction) => {
  try {
    const coupon = await Coupon.findById(req.params.id).select('status isActive').lean();
    if (!coupon) return sendError(res, 'Coupon not found', 404);
    if (coupon.isActive && coupon.status === 'active') {
      return sendError(res, 'This coupon is live. Ask Machinichi admin to change or remove it.', 403);
    }
    if (req.method === 'PUT' && req.body) {
      // a vendor cannot switch a coupon on; admin approval does that
      const body = { ...req.body };
      if (body.isActive === true) delete body.isActive;
      if (body.status === 'active') delete body.status;
      req.body = body;
    }
    next();
  } catch (error) {
    next(error);
  }
};

/* ───────────────────────── Returns ───────────────────────── */

export const getVendorReturns = async (req: VendorRequest, res: Response, next: NextFunction) => {
  try {
    const { page = '1', limit = '20', status, search } = req.query;
    const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit as string, 10) || 20));

    const productIds = await Product.distinct('_id', { vendor: vendorOid(req) });
    const filter: Record<string, unknown> = { 'items.productId': { $in: productIds } };
    if (status && typeof status === 'string') filter.status = status;
    if (search && typeof search === 'string' && search.trim()) {
      const rx = new RegExp(search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [{ returnId: rx }, { rmaNumber: rx }, { reason: rx }];
    }

    const [returns, total] = await Promise.all([
      ReturnRequest.find(filter)
        .sort({ createdAt: -1 })
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum)
        .populate('userId', 'name email phone')
        .populate('orderId', 'orderId orderTotal paymentMethod paymentStatus'),
      ReturnRequest.countDocuments(filter),
    ]);
    return sendPaginated(res, returns, total, pageNum, limitNum);
  } catch (error) {
    next(error);
  }
};

export const getVendorReturnStats = async (req: VendorRequest, res: Response, next: NextFunction) => {
  try {
    const productIds = await Product.distinct('_id', { vendor: vendorOid(req) });
    const scope = { 'items.productId': { $in: productIds } };

    const agg = await ReturnRequest.aggregate([
      { $match: scope },
      { $group: { _id: '$status', count: { $sum: 1 }, refundTotal: { $sum: '$refundAmount' } } },
    ]);
    const byStatus: Record<string, { count: number; refundTotal: number }> = {};
    let total = 0;
    for (const row of agg) {
      byStatus[row._id || 'unknown'] = { count: row.count, refundTotal: row.refundTotal || 0 };
      total += row.count;
    }

    const completed = await ReturnRequest.find({ ...scope, status: 'completed', refundedAt: { $ne: null }, completedAt: { $ne: null } })
      .select('completedAt createdAt').lean();
    let avgTurnaroundHours = 0;
    if (completed.length > 0) {
      const sum = completed.reduce((s, r: any) => s + Math.max(0, new Date(r.completedAt).getTime() - new Date(r.createdAt).getTime()), 0);
      avgTurnaroundHours = Math.round((sum / completed.length / 3600000) * 10) / 10;
    }
    const slaBreaches = await ReturnRequest.countDocuments({
      ...scope,
      slaDueAt: { $lt: new Date() },
      status: { $nin: CLOSED_RETURN_STATUSES },
    });

    return sendSuccess(res, { data: { total, byStatus, avgTurnaroundHours, slaBreaches } });
  } catch (error) {
    next(error);
  }
};

// Refunds move money, so they stay with Machinichi admin.
export const refundsAreAdminOnly = (_req: VendorRequest, res: Response) =>
  sendError(res, 'Refunds are processed by Machinichi admin.', 403);
