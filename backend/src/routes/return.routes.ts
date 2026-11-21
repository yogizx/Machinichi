import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middlewares/auth.middleware';
import { requirePermission, elevateWhenPermitted } from '../middlewares/permission.middleware';
import {
  createReturnRequest,
  checkEligibility,
  getEligibleOrders,
  getMyReturnRequests,
  getAllReturnRequests,
  getReturnStats,
  getReturnById,
  updateReturnStatus,
  cancelReturnRequest,
  moveToReview,
  approveReturn,
  rejectReturn,
  schedulePickup,
  markPickupFailed,
  confirmReceipt,
  inspectReturn,
  processRefund,
  markRefundFailed,
  completeReturn,
  refundReturnRequest,
  addReturnNote,
} from '../controllers/return.controller';
import upload from '../middlewares/upload.middleware';

const router = Router();

/* Customer evidence upload — authenticated users only (any role).
 * Works with both Cloudinary and local-disk storage engines. */
router.post('/evidence', authMiddleware, upload.array('files', 5), (req: Request, res: Response) => {
  const files = (req.files as Express.Multer.File[]) || [];
  if (!files.length) {
    return res.status(400).json({ success: false, message: 'No files uploaded' });
  }
  const base = `${req.protocol}://${req.get('host')}`;
  const urls = files.map((f: any) => {
    if (typeof f.path === 'string' && f.path.startsWith('http')) return f.path; // Cloudinary URL
    return `${base}/uploads/${f.filename}`;
  });
  return res.json({ success: true, urls });
});

/* Customer */
router.get('/eligible-orders', authMiddleware, getEligibleOrders);
router.post('/eligibility', authMiddleware, checkEligibility);
router.get('/my-requests', authMiddleware, getMyReturnRequests);

/* Admin — viewing */
router.get('/admin/stats', authMiddleware, requirePermission('order.return.view'), getReturnStats);
router.get('/admin/all', authMiddleware, requirePermission('order.return.view'), getAllReturnRequests);

/* Admin — handling a return (review → approve/reject → pickup → inspect → complete) */
router.post('/:id/review', authMiddleware, requirePermission('order.return.manage'), moveToReview);
router.post('/:id/approve', authMiddleware, requirePermission('order.return.manage'), approveReturn);
router.post('/:id/reject', authMiddleware, requirePermission('order.return.manage'), rejectReturn);
router.post('/:id/schedule-pickup', authMiddleware, requirePermission('order.return.manage'), schedulePickup);
router.post('/:id/pickup-failed', authMiddleware, requirePermission('order.return.manage'), markPickupFailed);
router.post('/:id/confirm-receipt', authMiddleware, requirePermission('order.return.manage'), confirmReceipt);
router.post('/:id/inspect', authMiddleware, requirePermission('order.return.manage'), inspectReturn);
router.post('/:id/complete', authMiddleware, requirePermission('order.return.manage'), completeReturn);
router.post('/:id/notes', authMiddleware, requirePermission('order.return.manage'), addReturnNote);

/* Admin — money going back to the customer needs its own permission */
router.post('/:id/process-refund', authMiddleware, requirePermission('order.refund'), processRefund);
router.post('/:id/refund', authMiddleware, requirePermission('order.refund'), refundReturnRequest);
router.post('/:id/refund-failed', authMiddleware, requirePermission('order.refund'), markRefundFailed);

/* Shared (auth-checked inside controller) */
router.get('/:id', authMiddleware, elevateWhenPermitted(['order.return.view']), getReturnById);
router.post('/', authMiddleware, createReturnRequest);
router.put('/status/:id', authMiddleware, requirePermission('order.return.manage'), updateReturnStatus);
router.put('/cancel/:id', authMiddleware, cancelReturnRequest);

export default router;
