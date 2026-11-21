import { Router } from 'express';
import { authMiddleware } from '../middlewares/auth.middleware';
import { requirePermission, elevateWhenPermitted } from '../middlewares/permission.middleware';
import {
  createPaymentOrder,
  createDirectPaymentOrder,
  verifyPayment,
  initiateRefund,
  getPaymentById,
  getPaymentByOrder,
  handleWebhook,
} from '../controllers/payment.controller';

const router = Router();

console.log('[PAYMENT ROUTES] Registering payment routes...');
// Shared with customers (the controller checks ownership). A sub-admin with payment.view is served like an admin.
const staffCanViewPayments = elevateWhenPermitted(['payment.view']);
router.get('/order/:orderId', authMiddleware, staffCanViewPayments, getPaymentByOrder);
router.get('/:id', authMiddleware, staffCanViewPayments, getPaymentById);
router.post('/create-order', authMiddleware, createPaymentOrder);
router.post('/create-direct', authMiddleware, createDirectPaymentOrder);
router.post('/verify', authMiddleware, verifyPayment);
router.post('/refund', authMiddleware, requirePermission('payment.refund'), initiateRefund);
router.post('/webhook', handleWebhook);
console.log('[PAYMENT ROUTES] Registered: POST /create-direct');

export default router;
