import { Router } from 'express';
import { authMiddleware } from '../middlewares/auth.middleware';
import { requirePermission } from '../middlewares/permission.middleware';
import {
  getCoupons,
  getActiveCoupons,
  getCouponById,
  createCoupon,
  updateCoupon,
  deleteCoupon,
} from '../controllers/coupon.controller';

const router = Router();

router.get('/active', getActiveCoupons);
router.get('/', authMiddleware, requirePermission('marketing.coupon.view'), getCoupons);
router.get('/:id', authMiddleware, requirePermission('marketing.coupon.view'), getCouponById);
router.post('/', authMiddleware, requirePermission('marketing.coupon.create'), createCoupon);
router.put('/:id', authMiddleware, requirePermission('marketing.coupon.edit'), updateCoupon);
router.delete('/:id', authMiddleware, requirePermission('marketing.coupon.delete'), deleteCoupon);

export default router;
