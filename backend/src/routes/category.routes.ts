import { Router } from 'express';
import { authMiddleware } from '../middlewares/auth.middleware';
import { requirePermission } from '../middlewares/permission.middleware';
import {
  getCategories,
  getAllCategories,
  getCategoryBySlug,
  getCategoryProducts,
  createCategory,
  updateCategory,
  deleteCategory,
} from '../controllers/category.controller';

const router = Router();

router.get('/', getCategories);
router.get('/all', getAllCategories);
router.get('/slug/:slug', getCategoryBySlug);
router.get('/:id/products', authMiddleware, requirePermission('content.category.view'), getCategoryProducts);

router.post('/', authMiddleware, requirePermission('content.category.create'), createCategory);
router.put('/:id', authMiddleware, requirePermission('content.category.edit'), updateCategory);
router.delete('/:id', authMiddleware, requirePermission('content.category.delete'), deleteCategory);

export default router;
