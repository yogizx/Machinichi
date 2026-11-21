import { Router } from 'express';
import authRoutes from './auth.routes';
import cartRoutes from './cart.routes';
import wishlistRoutes from './wishlist.routes';
import savedForLaterRoutes from './savedForLater.routes';
import productRoutes from './product.routes';
import categoryRoutes from './category.routes';
import orderRoutes from './order.routes';
import checkoutRoutes from './checkout.routes';
import paymentRoutes from './payment.routes';
import reviewRoutes from './review.routes';
import couponRoutes from './coupon.routes';
import bannerRoutes from './banner.routes';
import notificationRoutes from './notification.routes';
import returnRoutes from './return.routes';
import adminRoutes from './admin.routes';
import staffRoutes from './staff.routes';
import trackingRoutes from './tracking.routes';
import analyticsRoutes from './analytics.routes';
import realtimeRoutes from './realtime.routes';
import vendorPublicRoutes from './vendorPublic.routes';
import vendorAuthRoutes from './vendorAuth.routes';
import vendorRoutes from './vendor.routes';

const router = Router();

router.use('/auth', authRoutes);
router.use('/cart', cartRoutes);
router.use('/wishlist', wishlistRoutes);
router.use('/saved-for-later', savedForLaterRoutes);
router.use('/products', productRoutes);
router.use('/categories', categoryRoutes);
router.use('/orders', orderRoutes);
router.use('/checkout', checkoutRoutes);
console.log('[API ROUTES] Mounting /payments → paymentRoutes (includes POST /create-direct)');
router.use('/payments', paymentRoutes);
router.use('/reviews', reviewRoutes);
router.use('/coupons', couponRoutes);
router.use('/banners', bannerRoutes);
router.use('/notifications', notificationRoutes);
router.use('/returns', returnRoutes);
// Staff routes first: they contain the PUBLIC invitation-activation endpoints, which must not sit behind the
// admin router's authentication. Every other staff route authenticates inside staff.routes.ts.
router.use('/admin/staff', staffRoutes);
router.use('/admin', adminRoutes);
router.use('/tracking', trackingRoutes);
router.use('/analytics', analyticsRoutes);
router.use('/realtime', realtimeRoutes);

// ── Multi-vendor ──
router.use('/vendors', vendorPublicRoutes);   // public: apply to become a vendor, seller card info
router.use('/vendor/auth', vendorAuthRoutes); // vendor login / refresh / change password (must stay above /vendor)
router.use('/vendor', vendorRoutes);          // vendor dashboard, inventory, listings, returns, coupons

export default router;
