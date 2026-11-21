import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { authMiddleware } from '../middlewares/auth.middleware';
import {
  requirePermission,
  requireAnyPermission,
  requireAllPermissions,
  requireStaffAccount,
  enforceGuardedRoutes,
} from '../middlewares/permission.middleware';
import {
  getMyPermissions,
  getPermissionCatalog,
  getSubAdmins,
  getSubAdminById,
  inviteSubAdmin,
  resendInvitation,
  updateSubAdmin,
  setSubAdminStatus,
  deleteSubAdmin,
  revokeSubAdminSessions,
  getSubAdminSessions,
  requestSubAdminPasswordReset,
  updateUserPermissions,
  getRoles,
  getRoleById,
  createRole,
  updateRole,
  updateRolePermissions,
  duplicateRole,
  deleteRole,
  getAuditLogs,
  validateInvitation,
  startActivation,
  completeActivation,
} from '../controllers/admin/staff.controller';

const router = Router();

// ── PUBLIC: invitation activation (single-use token + rate limited) ────────────
const activationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many attempts. Please try again later.' },
});
router.post('/invitations/validate', activationLimiter, validateInvitation);
router.post('/invitations/start', activationLimiter, startActivation);
router.post('/invitations/complete', activationLimiter, completeActivation);

// ── Everything below requires a signed-in staff account ───────────────────────
router.use(authMiddleware, requireStaffAccount);

// Any staff member may read their OWN effective permissions (the UI uses this to draw the navigation).
router.get('/my-permissions', getMyPermissions);

// ── Permission-guarded management API (an unguarded route here throws at start-up) ──
const guarded = enforceGuardedRoutes(Router(), 'staff.routes');

guarded.get('/permissions', requireAnyPermission(['admin.role.view', 'admin.role.create', 'admin.role.edit', 'admin.permission.assign', 'admin.create', 'admin.edit']), getPermissionCatalog);

// Sub-admins
guarded.get('/sub-admins', requirePermission('admin.view'), getSubAdmins);
guarded.post('/sub-admins', requirePermission('admin.create'), inviteSubAdmin);
guarded.get('/sub-admins/:id', requirePermission('admin.view'), getSubAdminById);
guarded.put('/sub-admins/:id', requirePermission('admin.edit'), updateSubAdmin);
guarded.delete('/sub-admins/:id', requirePermission('admin.delete'), deleteSubAdmin);
guarded.post('/sub-admins/:id/status', requirePermission('admin.suspend'), setSubAdminStatus);
guarded.post('/sub-admins/:id/resend-invitation', requirePermission('admin.create'), resendInvitation);
guarded.post('/sub-admins/:id/password-reset', requirePermission('admin.edit'), requestSubAdminPasswordReset);
guarded.get('/sub-admins/:id/sessions', requireAnyPermission(['admin.session.revoke', 'admin.view']), getSubAdminSessions);
guarded.post('/sub-admins/:id/sessions/revoke', requirePermission('admin.session.revoke'), revokeSubAdminSessions);
guarded.put('/sub-admins/:id/permissions', requirePermission('admin.permission.assign'), updateUserPermissions);

// Roles
guarded.get('/roles', requireAnyPermission(['admin.role.view', 'admin.create', 'admin.edit']), getRoles);
guarded.get('/roles/:id', requirePermission('admin.role.view'), getRoleById);
guarded.post('/roles', requirePermission('admin.role.create'), createRole);
guarded.put('/roles/:id', requirePermission('admin.role.edit'), updateRole);
guarded.put('/roles/:id/permissions', requireAllPermissions(['admin.role.edit', 'admin.permission.assign']), updateRolePermissions);
guarded.post('/roles/:id/duplicate', requirePermission('admin.role.create'), duplicateRole);
guarded.delete('/roles/:id', requirePermission('admin.role.delete'), deleteRole);

// Audit trail (read-only: there is deliberately no write/delete endpoint)
guarded.get('/audit-logs', requirePermission('admin.audit.view'), getAuditLogs);

router.use(guarded);

export default router;
