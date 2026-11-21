import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { User } from '../models/User';
import { sendError } from '../services/apiResponse';
import { JWT_CONFIG } from '../config/jwt';
import { isSubAdminUsable } from '../services/rbac.service';

export interface AuthRequest extends Request {
  user?: {
    userId: string;
    sessionId?: string;
    role: string;
    isAdmin: boolean;       // super_admin / admin ONLY (a permitted sub-admin is elevated per request, see permission.middleware)
    isSuperAdmin: boolean;
    isSubAdmin?: boolean;
  };
}

/** Marks a middleware as an authorization guard. enforceGuardedRoutes() refuses routes that have none. */
export const markGuard = <T extends (...args: any[]) => any>(fn: T): T => {
  (fn as any).__rbacGuard = true;
  return fn;
};

const GUEST = { userId: '', role: 'guest', isAdmin: false, isSuperAdmin: false } as const;

type Resolved =
  | { ok: true; user: NonNullable<AuthRequest['user']> }
  | { ok: false; message: string; code: string };

/**
 * Turns a verified access token into a request identity.
 * The role and account state ALWAYS come from the database - the token only identifies the user.
 */
async function resolveIdentity(decoded: any): Promise<Resolved> {
  // Older refresh flows embedded the whole user document; always reduce to the plain id.
  const userId = String(decoded?.userId?._id ?? decoded?.userId ?? '');
  if (!/^[a-f\d]{24}$/i.test(userId)) return { ok: false, message: 'Invalid token.', code: 'INVALID_TOKEN' };

  const user = await User.findById(userId)
    .select('_id role isDeleted isActive accountStatus accessExpiry tokensValidAfter')
    .lean();
  if (!user || user.isDeleted || !user.isActive) {
    return { ok: false, message: 'User not found or inactive.', code: 'USER_INACTIVE' };
  }

  // Session revocation: every access token issued up to the revocation instant is dead.
  if (user.tokensValidAfter && typeof decoded.iat === 'number' && decoded.iat * 1000 <= new Date(user.tokensValidAfter).getTime()) {
    return { ok: false, message: 'Session has been revoked. Please sign in again.', code: 'SESSION_REVOKED' };
  }

  if (user.role === 'sub_admin') {
    if (!isSubAdminUsable(user as any)) {
      return { ok: false, message: 'This account is not active.', code: 'ACCOUNT_NOT_ACTIVE' };
    }
    // A sub-admin token is only valid when it was issued by the admin login WITH a verified second factor.
    // This closes every other token-issuing path (customer login, Google sign-in, ...) in one place.
    if (decoded.mfa !== true) {
      return { ok: false, message: 'Multi-factor authentication required.', code: 'MFA_REQUIRED' };
    }
  }

  return {
    ok: true,
    user: {
      userId,
      sessionId: decoded.sessionId,
      role: user.role,
      isAdmin: ['admin', 'super_admin'].includes(user.role),
      isSuperAdmin: user.role === 'super_admin',
      isSubAdmin: user.role === 'sub_admin',
    },
  };
}

const extractToken = (req: Request): string | undefined => {
  let token = req.cookies?.accessToken;
  if (!token) {
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) token = authHeader.split(' ')[1];
  }
  return token;
};

export const authMiddleware = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const token = extractToken(req);
    if (!token) {
      return sendError(res, 'Access denied. No token provided.', 401);
    }

    const decoded = jwt.verify(token, JWT_CONFIG.ACCESS_SECRET) as any;
    const resolved = await resolveIdentity(decoded);
    if (!resolved.ok) {
      return res.status(401).json({ success: false, message: resolved.message, code: resolved.code });
    }

    req.user = resolved.user;
    next();
  } catch (error: any) {
    if (error.name === 'TokenExpiredError') {
      return sendError(res, 'Token expired. Please refresh your token.', 401);
    }
    return sendError(res, 'Invalid token.', 401);
  }
};

export const optionalAuth = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const token = extractToken(req);
    if (!token) {
      req.user = { ...GUEST };
      return next();
    }

    const decoded = jwt.verify(token, JWT_CONFIG.ACCESS_SECRET) as any;
    const resolved = await resolveIdentity(decoded);
    req.user = resolved.ok ? resolved.user : { ...GUEST };
    next();
  } catch {
    req.user = { ...GUEST };
    next();
  }
};

/** Full administrators only (role admin / super_admin). Sub-admins are always refused here. */
export const adminMiddleware = markGuard((req: AuthRequest, res: Response, next: NextFunction) => {
  if (!req.user?.isAdmin) {
    return sendError(res, 'Access denied. Admin privileges required.', 403);
  }
  next();
});

export const superAdminMiddleware = markGuard((req: AuthRequest, res: Response, next: NextFunction) => {
  if (!req.user?.isSuperAdmin) {
    return sendError(res, 'Access denied. Super admin privileges required.', 403);
  }
  next();
});

export { authMiddleware as authenticateUser, adminMiddleware as authenticateAdmin };

export const refreshTokenMiddleware = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const refreshToken = req.cookies?.refreshToken;
    if (!refreshToken) {
      return sendError(res, 'Refresh token not found.', 401);
    }

    const decoded = jwt.verify(refreshToken, JWT_CONFIG.REFRESH_SECRET) as any;
    req.user = {
      userId: decoded.userId,
      sessionId: decoded.sessionId,
      role: decoded.role || 'user',
      isAdmin: ['admin', 'super_admin'].includes(decoded.role || ''),
      isSuperAdmin: decoded.role === 'super_admin',
    };
    next();
  } catch {
    return sendError(res, 'Invalid or expired refresh token.', 401);
  }
};
