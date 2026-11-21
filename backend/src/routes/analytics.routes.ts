import { Router } from 'express';
import { authMiddleware, adminMiddleware } from '../middlewares/auth.middleware';
import { requirePermission, requireStaffAccount, enforceGuardedRoutes } from '../middlewares/permission.middleware';
import {
  getProductStats,
  getBulkStats,
  getDashboardOverview,
  getProductViewHistory,
  resetCartAnalytics,
} from '../controllers/analytics.controller';

const router = Router();

router.use(authMiddleware, requireStaffAccount);
enforceGuardedRoutes(router, 'analytics.routes');

router.get('/overview', requirePermission('report.analytics'), getDashboardOverview);
router.get('/products/:productId', requirePermission('report.analytics'), getProductStats);
router.get('/products', requirePermission('report.analytics'), getBulkStats);
router.get('/products/:productId/history', requirePermission('report.analytics'), getProductViewHistory);
// Destructive resets are not delegable: full administrators only.
router.delete('/products/:productId/reset-cart', adminMiddleware, resetCartAnalytics);
router.delete('/products/reset-all-carts', adminMiddleware, resetCartAnalytics);

export default router;
