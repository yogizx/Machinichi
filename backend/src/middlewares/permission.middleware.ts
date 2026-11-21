import { Response, NextFunction, Router } from 'express';
import { AuthRequest, markGuard } from './auth.middleware';
import { sendError } from '../services/apiResponse';
import { User } from '../models/User';
import { isKnownPermission } from '../services/permissionCatalog';
import {
  getCachedPermissions,
  invalidatePermissionCache,
  bumpPermissionVersion as bumpVersion,
  revokeAllSessions as revokeSessions,
  computeAssignedPermissions,
  isSubAdminUsable,
} from '../services/rbac.service';
import { recordAudit } from '../services/audit.service';

/**
 * Authorization middleware. Every decision is made on the server from the database:
 *   - super_admin / admin  -> full access (existing behaviour, unchanged)
 *   - sub_admin            -> only the permissions granted through their role + overrides, DENY BY DEFAULT
 *   - everyone else        -> 403
 *
 * A permitted sub-admin is elevated to `isAdmin` for that single request so the existing admin controllers
 * (which were written for administrators) behave as they always have. The elevation only exists after the
 * permission check passed and is never stored anywhere.
 */

export { invalidatePermissionCache };
export const invalidateAllPermissionCaches = (): void => invalidatePermissionCache();
export const bumpPermissionVersion = bumpVersion;
export const revokeAllSessions = revokeSessions;
export { computeAssignedPermissions };

export async function loadUserPermissions(userId: string): Promise<{ permissions: Set<string>; version: number }> {
  const snap = await getCachedPermissions(userId);
  return { permissions: snap.permissions, version: snap.version };
}

export async function hasPermission(userId: string, permissionKey: string): Promise<boolean> {
  return (await getCachedPermissions(userId)).permissions.has(permissionKey);
}

export async function hasAnyPermission(userId: string, permissionKeys: string[]): Promise<boolean> {
  const { permissions } = await getCachedPermissions(userId);
  return permissionKeys.some((key) => permissions.has(key));
}

export async function hasAllPermissions(userId: string, permissionKeys: string[]): Promise<boolean> {
  const { permissions } = await getCachedPermissions(userId);
  return permissionKeys.every((key) => permissions.has(key));
}

export async function getUserPermissionKeys(userId: string): Promise<string[]> {
  return Array.from((await getCachedPermissions(userId)).permissions);
}

/** Compatibility wrapper around the audit service. */
export async function logAuditEvent(
  actorId: string,
  action: string,
  module: string,
  req: AuthRequest,
  metadata?: Record<string, any>,
): Promise<void> {
  await recordAudit({
    actorId,
    targetUserId: metadata?.targetUserId,
    action,
    module,
    outcome: action.includes('unauthorized') || action.includes('denied') ? 'denied' : 'success',
    resourceId: metadata?.resourceId || req.params?.id,
    metadata: metadata ? { ...metadata, targetUserId: undefined } : undefined,
    req,
  });
}

const FORBIDDEN_MESSAGE = 'You do not have permission to perform this action.';
const forbidden = (res: Response) => res.status(403).json({ success: false, message: FORBIDDEN_MESSAGE, code: 'FORBIDDEN' });

/** Fail fast at start-up: a typo in a permission key must stop the server, not silently deny (or open) a route. */
const assertKnown = (keys: string[]): void => {
  if (keys.length === 0) throw new Error('[RBAC] A permission guard needs at least one permission key.');
  for (const key of keys) {
    if (!isKnownPermission(key)) throw new Error(`[RBAC] Unknown permission key used in a route guard: "${key}"`);
  }
};

const buildGuard = (keys: string[], mode: 'any' | 'all') => {
  assertKnown(keys);

  return markGuard(async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const user = req.user;
      if (!user?.userId) return sendError(res, 'Authentication required.', 401);

      // Full administrators (unchanged behaviour).
      if (user.isAdmin) return next();

      // Customers, vendors, guests ... are never admitted to admin functionality.
      if (user.role !== 'sub_admin') return forbidden(res);

      const { permissions } = await getCachedPermissions(user.userId);
      const allowed = mode === 'all' ? keys.every((k) => permissions.has(k)) : keys.some((k) => permissions.has(k));

      if (!allowed) {
        await recordAudit({
          actorId: user.userId,
          action: 'authz.denied',
          module: keys[0].split('.')[0],
          outcome: 'denied',
          metadata: { required: keys, mode, method: req.method, path: `${req.baseUrl || ''}${req.path}` },
          req,
        });
        return forbidden(res);
      }

      // Permission verified: behave as an administrator for THIS request only.
      user.isAdmin = true;
      next();
    } catch (err) {
      next(err);
    }
  });
};

/** Requires one specific permission. */
export const requirePermission = (permissionKey: string) => buildGuard([permissionKey], 'any');
/** Requires at least one of the listed permissions. */
export const requireAnyPermission = (permissionKeys: string[]) => buildGuard(permissionKeys, 'any');
/** Requires all of the listed permissions. */
export const requireAllPermissions = (permissionKeys: string[]) => buildGuard(permissionKeys, 'all');

/**
 * For routes shared with customers (e.g. GET /orders/:id): never rejects. A sub-admin who holds one of the
 * permissions is elevated so the controller serves them like an administrator; everybody else is untouched and
 * keeps going through the controller's own ownership checks.
 */
export const elevateWhenPermitted = (permissionKeys: string[]) => {
  assertKnown(permissionKeys);
  return async (req: AuthRequest, _res: Response, next: NextFunction) => {
    try {
      const user = req.user;
      if (user?.userId && user.role === 'sub_admin' && !user.isAdmin) {
        const { permissions } = await getCachedPermissions(user.userId);
        if (permissionKeys.some((k) => permissions.has(k))) user.isAdmin = true;
      }
      next();
    } catch (err) {
      next(err);
    }
  };
};

/** Any signed-in staff member (super_admin, admin or sub_admin). Not a permission guard by itself. */
export const requireStaffAccount = (req: AuthRequest, res: Response, next: NextFunction) => {
  if (!req.user?.userId) return sendError(res, 'Authentication required.', 401);
  if (['admin', 'super_admin', 'sub_admin'].includes(req.user.role)) return next();
  return forbidden(res);
};

/** Super Admin / Admin only (marked as a guard so it can protect routes registered through enforceGuardedRoutes). */
export const requireFullAdmin = markGuard((req: AuthRequest, res: Response, next: NextFunction) => {
  if (!req.user?.userId) return sendError(res, 'Authentication required.', 401);
  if (req.user.role === 'admin' || req.user.role === 'super_admin') return next();
  return forbidden(res);
});

/**
 * Deny-by-default for routers: after calling this, registering a route (get/post/put/patch/delete) without a
 * guard (requirePermission, requireAnyPermission, requireAllPermissions, requireFullAdmin, adminMiddleware ...)
 * throws while the server starts. Forgetting a guard can therefore never silently expose an endpoint.
 */
export function enforceGuardedRoutes<T extends Router>(router: T, label = 'router'): T {
  for (const method of ['get', 'post', 'put', 'patch', 'delete'] as const) {
    const original = (router as any)[method].bind(router);
    (router as any)[method] = (path: any, ...handlers: any[]) => {
      const flat = handlers.flat(Infinity);
      if (!flat.some((h: any) => typeof h === 'function' && h.__rbacGuard === true)) {
        throw new Error(`[RBAC] ${label}: ${method.toUpperCase()} ${String(path)} is registered without an authorization guard.`);
      }
      return original(path, ...handlers);
    };
  }
  return router;
}

/** Resource ownership check - prevents IDOR for non-administrators. */
export const requireResourceOwnership = (
  resourceType: string,
  getResourceOwnerId: (req: AuthRequest) => Promise<string | null>,
) => {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) return sendError(res, 'Authentication required.', 401);
      if (req.user.role === 'super_admin' || req.user.role === 'admin') return next();

      const ownerId = await getResourceOwnerId(req);
      if (!ownerId || ownerId !== req.user.userId) {
        await recordAudit({
          actorId: req.user.userId,
          action: 'authz.idor_attempt',
          module: resourceType,
          outcome: 'denied',
          resourceId: Array.isArray(req.params?.id) ? req.params.id[0] : req.params?.id,
          req,
        });
        return forbidden(res);
      }
      next();
    } catch (err) {
      next(err);
    }
  };
};

/** Account status check middleware. */
export const checkAccountStatus = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user) return next();
    const user = await User.findById(req.user.userId)
      .select('role accountStatus isActive isDeleted accessExpiry')
      .lean();
    if (!user || user.isDeleted || !user.isActive) return sendError(res, 'Account is inactive or deleted.', 403);
    if (user.role === 'sub_admin' && !isSubAdminUsable(user as any)) {
      return sendError(res, `Account is ${user.accountStatus || 'not active'}.`, 403);
    }
    next();
  } catch (err) {
    next(err);
  }
};

export default {
  loadUserPermissions,
  getCachedPermissions,
  invalidatePermissionCache,
  invalidateAllPermissionCaches,
  hasPermission,
  hasAnyPermission,
  hasAllPermissions,
  getUserPermissionKeys,
  requirePermission,
  requireAnyPermission,
  requireAllPermissions,
  elevateWhenPermitted,
  requireStaffAccount,
  requireFullAdmin,
  enforceGuardedRoutes,
  requireResourceOwnership,
  checkAccountStatus,
  logAuditEvent,
  bumpPermissionVersion,
  revokeAllSessions,
};
