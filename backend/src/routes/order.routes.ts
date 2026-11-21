import { Router, Request } from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { authMiddleware, optionalAuth } from '../middlewares/auth.middleware';
import { requirePermission, elevateWhenPermitted } from '../middlewares/permission.middleware';
import {
  getMyOrders,
  getOrderById,
  cancelOrder,
  updateOrderStatus,
  delayOrder,
  getAllOrders,
  getOrderStatusCounts,
  addTracking,
  getMyOrderStats,
} from '../controllers/order.controller';
import { downloadInvoice, downloadShippingLabel } from '../controllers/orderPdf.controller';

const router = Router();

// Public order tracking is a look-up by a guessable order number, so it is rate limited per IP:
// scanning MAC-40000, MAC-40001, ... must not be practical.
const trackLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { message: 'Too many tracking requests. Please try again later.' },
  keyGenerator: (req: Request) => ipKeyGenerator(req.ip || ''),
});

// Some of these routes are shared with customers (their controllers check ownership). For those,
// elevateWhenPermitted() lets a sub-admin who holds the permission be served like an administrator, and leaves
// everybody else untouched. Pure admin routes use requirePermission() and reject without it.
const staffCanViewOrders = elevateWhenPermitted(['order.view']);

router.get('/my-orders', authMiddleware, getMyOrders);
router.get('/stats', authMiddleware, getMyOrderStats);
router.get('/admin/all', authMiddleware, requirePermission('order.view'), getAllOrders);
router.get('/admin/status-counts', authMiddleware, requirePermission('order.view'), getOrderStatusCounts);
// Public tracking by order number. Logged-in owners/admins get full details, everybody else a masked view.
router.get('/track/:orderId', trackLimiter, optionalAuth, staffCanViewOrders, getOrderById);
router.get('/:id/invoice', authMiddleware, staffCanViewOrders, downloadInvoice);
router.get('/:id/label', authMiddleware, requirePermission('order.view'), downloadShippingLabel);
router.get('/:id', authMiddleware, staffCanViewOrders, getOrderById);
router.put('/cancel/:id', authMiddleware, elevateWhenPermitted(['order.cancel']), cancelOrder);
router.put('/status/:id', authMiddleware, requirePermission('order.update'), updateOrderStatus);
router.post('/delay/:id', authMiddleware, requirePermission('order.update'), delayOrder);
router.put('/tracking/:id', authMiddleware, requirePermission('order.update'), addTracking);

export default router;
