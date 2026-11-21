import { Router, Request, Response } from 'express';
import {
  authenticateVendor, vendorActsAsAdmin,
  requireOwnProduct, requireOwnProductsInBody, requireOwnCoupon, requireOwnReturn,
} from '../middlewares/vendor.middleware';
import {
  getVendorDashboard, getVendorProducts, getVendorInventory, prepareVendorProduct, getVendorSuppliers,
  listVendorCoupons, forceVendorCouponDraft, guardVendorCouponChange,
  getVendorReturns, getVendorReturnStats, refundsAreAdminOnly,
} from '../controllers/vendor.controller';
// Existing admin handlers, reused as-is. Every route below checks ownership first, and product
// creation is stamped with the vendor by the tenant context, so a vendor only ever touches their own data.
import {
  createProduct, updateProduct, deleteProduct, getAdminProductById,
  bulkUpdateStock, getInventoryLogs, updateInventory, listProduct, unlistProduct, updateListing,
} from '../controllers/admin/product.controller';
import { generateAIContent } from '../controllers/admin/ai.controller';
import { getCouponById, createCoupon, updateCoupon, deleteCoupon } from '../controllers/coupon.controller';
import {
  getReturnById, addReturnNote, moveToReview, approveReturn, rejectReturn, schedulePickup,
  markPickupFailed, confirmReceipt, inspectReturn, completeReturn,
} from '../controllers/return.controller';
import upload from '../middlewares/upload.middleware';
import pdfUpload from '../middlewares/pdfUpload.middleware';
import { isCloudinaryConfigured, CLOUDINARY_FOLDERS } from '../config/cloudinary';

const router = Router();

router.use(...authenticateVendor);

/* Dashboard */
router.get('/dashboard', getVendorDashboard);

/* Product listing */
router.get('/products', getVendorProducts);
router.post('/products', prepareVendorProduct, createProduct);
router.post('/products/bulk-stock', requireOwnProductsInBody, bulkUpdateStock);
router.get('/products/:id', requireOwnProduct(), getAdminProductById);
router.put('/products/:id', requireOwnProduct(), updateProduct);
router.delete('/products/:id', requireOwnProduct(), deleteProduct);
router.post('/products/:id/list', requireOwnProduct(), listProduct);
router.post('/products/:id/unlist', requireOwnProduct(), unlistProduct);
router.patch('/products/:id/listing', requireOwnProduct(), updateListing);

/* Inventory */
router.get('/inventory', getVendorInventory);
router.patch('/products/:id/inventory', requireOwnProduct(), updateInventory);
router.get('/products/:productId/inventory-logs', requireOwnProduct('productId'), getInventoryLogs);
router.get('/suppliers', getVendorSuppliers);

/* AI product-copy helper used by the listing form */
router.post('/ai/generate', generateAIContent);

/* Offers & coupons (own coupons only; created as drafts that admin switches on) */
router.get('/coupons', listVendorCoupons);
router.get('/coupons/:id', requireOwnCoupon, getCouponById);
router.post('/coupons', forceVendorCouponDraft, vendorActsAsAdmin, createCoupon);
router.put('/coupons/:id', requireOwnCoupon, guardVendorCouponChange, vendorActsAsAdmin, updateCoupon);
router.delete('/coupons/:id', requireOwnCoupon, guardVendorCouponChange, vendorActsAsAdmin, deleteCoupon);

/* Return requests (only returns that contain this vendor's products) */
router.get('/returns/admin/stats', getVendorReturnStats);
router.get('/returns/admin/all', getVendorReturns);
router.get('/returns/:id', requireOwnReturn, vendorActsAsAdmin, getReturnById);
router.post('/returns/:id/notes', requireOwnReturn, vendorActsAsAdmin, addReturnNote);
router.post('/returns/:id/review', requireOwnReturn, vendorActsAsAdmin, moveToReview);
router.post('/returns/:id/approve', requireOwnReturn, vendorActsAsAdmin, approveReturn);
router.post('/returns/:id/reject', requireOwnReturn, vendorActsAsAdmin, rejectReturn);
router.post('/returns/:id/schedule-pickup', requireOwnReturn, vendorActsAsAdmin, schedulePickup);
router.post('/returns/:id/pickup-failed', requireOwnReturn, vendorActsAsAdmin, markPickupFailed);
router.post('/returns/:id/confirm-receipt', requireOwnReturn, vendorActsAsAdmin, confirmReceipt);
router.post('/returns/:id/inspect', requireOwnReturn, vendorActsAsAdmin, inspectReturn);
router.post('/returns/:id/complete', requireOwnReturn, vendorActsAsAdmin, completeReturn);
router.post('/returns/:id/process-refund', refundsAreAdminOnly);
router.post('/returns/:id/refund', refundsAreAdminOnly);
router.post('/returns/:id/refund-failed', refundsAreAdminOnly);

/* Image / PDF upload for the product form (same behaviour as the admin upload route) */
const PUBLIC_UPLOAD_ORIGIN = (process.env.API_URL || process.env.PUBLIC_URL || 'http://localhost:3000').replace(/\/$/, '');

router.post('/upload', upload.single('file'), (req: Request, res: Response) => {
  if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });
  const file: any = req.file;
  const url = file.path && /^https?:\/\//i.test(file.path) ? file.path : `${PUBLIC_UPLOAD_ORIGIN}/uploads/${file.filename}`;
  return res.json({
    success: true,
    url,
    ...(isCloudinaryConfigured
      ? { publicId: file.filename, provider: 'cloudinary', folder: CLOUDINARY_FOLDERS.products }
      : { provider: 'local' }),
  });
});

router.post('/upload/pdf', pdfUpload.single('file'), (req: Request, res: Response) => {
  if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });
  return res.json({
    success: true,
    name: req.file.originalname,
    size: req.file.size,
    url: `${PUBLIC_UPLOAD_ORIGIN}/uploads/${req.file.filename}`,
    uploadedAt: new Date().toISOString(),
  });
});

export default router;
