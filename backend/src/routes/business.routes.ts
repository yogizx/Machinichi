import { Router } from 'express';
import { authMiddleware, adminMiddleware } from '../middlewares/auth.middleware';
import { requirePermission, requireStaffAccount, enforceGuardedRoutes } from '../middlewares/permission.middleware';
import {
  getBusinesses, getBusinessById,
  approveBusiness, rejectBusiness, deleteBusiness,
  resendVendorCredentials, getBusinessDocument,
} from '../controllers/business.controller';

const router = Router();

// authMiddleware identifies the caller; every route then carries its own permission guard (deny by default).
router.use(authMiddleware, requireStaffAccount);
enforceGuardedRoutes(router, 'business.routes');

router.get('/', requirePermission('vendor.view'), getBusinesses);
router.get('/:id', requirePermission('vendor.view'), getBusinessById);
router.get('/:id/documents/:docId', requirePermission('vendor.verify'), getBusinessDocument);
router.post('/:id/approve', requirePermission('vendor.approve'), approveBusiness);
router.post('/:id/resend-credentials', requirePermission('vendor.approve'), resendVendorCredentials);
router.post('/:id/reject', requirePermission('vendor.approve'), rejectBusiness);
// Permanently deleting a vendor business is not delegable: full administrators only.
router.delete('/:id', adminMiddleware, deleteBusiness);

export default router;
