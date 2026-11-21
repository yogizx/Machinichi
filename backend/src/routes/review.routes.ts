import { Router } from 'express';
import { authMiddleware } from '../middlewares/auth.middleware';
import { requirePermission } from '../middlewares/permission.middleware';
import {
  getProductReviews,
  getMyReviews,
  createReview,
  updateReview,
  deleteReview,
  approveReview,
  getPendingReviews,
} from '../controllers/review.controller';

const router = Router();

router.get('/my', authMiddleware, getMyReviews);
router.get('/product/:productId', getProductReviews);
router.get('/pending', authMiddleware, requirePermission('customer.support'), getPendingReviews);
router.post('/', authMiddleware, createReview);
router.put('/:id', authMiddleware, updateReview);
router.put('/approve/:id', authMiddleware, requirePermission('customer.support'), approveReview);
router.delete('/:id', authMiddleware, deleteReview);

export default router;
