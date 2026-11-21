import mongoose, { ClientSession, Types } from 'mongoose';
import { User } from '../models/User';
import { RolePermission } from '../models/RolePermission';
import { UserPermissionOverride } from '../models/UserPermissionOverride';
import { RefreshToken } from '../models/RefreshToken';
import {
  PERMISSION_KEYS,
  ASSIGNABLE_KEYS,
  STAFF_MANAGEMENT_KEYS,
  isKnownPermission,
} from './permissionCatalog';

/**
 * Central RBAC engine.
 *
 *  - Permissions are ALWAYS read from the database on the server (role grants + per-user overrides).
 *    Nothing the browser sends (tokens' claims, local storage, role names, permission arrays) is trusted.
 *  - `permissionVersion` on the user is bumped whenever their effective permissions change; the short-lived
 *    cache is only reused while the version still matches, so a change applies to the very next request.
 *  - DENY BY DEFAULT: anything not explicitly granted - or granted by a permission that no longer exists in
 *    the catalog - is refused.
 */

export const FULL_ADMIN_ROLES = ['admin', 'super_admin'] as const;
export const STAFF_ROLES = ['admin', 'super_admin', 'sub_admin'] as const;
export const isFullAdminRole = (role?: string): boolean => role === 'admin' || role === 'super_admin';

export interface ActorContext {
  userId: string;
  role: string;
}

interface UserLike {
  _id: any;
  role?: string;
  roleId?: any;
  isActive?: boolean;
  isDeleted?: boolean;
  accountStatus?: string;
  accessExpiry?: Date | null;
  permissionVersion?: number;
}

// ── Account usability ──────────────────────────────────────────────────────────

export const isSubAdminUsable = (u: UserLike, now = new Date()): boolean =>
  u.role === 'sub_admin' &&
  !u.isDeleted &&
  u.isActive !== false &&
  u.accountStatus === 'active' &&
  (!u.accessExpiry || new Date(u.accessExpiry).getTime() > now.getTime());

// ── Permission resolution ──────────────────────────────────────────────────────

export async function getRolePermissionKeys(roleId: any, session?: ClientSession): Promise<Set<string>> {
  const rows = await RolePermission.find({ roleId })
    .populate<{ permissionId: { permissionKey: string } | null }>('permissionId', 'permissionKey')
    .session(session || null)
    .lean();
  const keys = new Set<string>();
  for (const row of rows) {
    const key = row.permissionId?.permissionKey;
    if (key && PERMISSION_KEYS.has(key)) keys.add(key); // retired keys grant nothing
  }
  return keys;
}

/** Role grants + per-user overrides, ignoring account status. Used for display and delegation checks. */
export async function computeAssignedPermissions(user: Pick<UserLike, '_id' | 'roleId'>): Promise<Set<string>> {
  const keys = user.roleId ? await getRolePermissionKeys(user.roleId) : new Set<string>();

  const overrides = await UserPermissionOverride.find({ userId: user._id })
    .populate<{ permissionId: { permissionKey: string } | null }>('permissionId', 'permissionKey')
    .lean();
  for (const o of overrides) {
    const key = o.permissionId?.permissionKey;
    if (!key || !PERMISSION_KEYS.has(key)) continue;
    if (o.effect === 'allow') keys.add(key);
    else keys.delete(key);
  }
  return keys;
}

export interface PermissionSnapshot {
  permissions: Set<string>;
  version: number;
  fullAdmin: boolean;
}

const EMPTY: PermissionSnapshot = { permissions: new Set(), version: 0, fullAdmin: false };

const CACHE_TTL_MS = 3000;
const cache = new Map<string, PermissionSnapshot & { at: number }>();

export const invalidatePermissionCache = (userId?: string | Types.ObjectId): void => {
  if (userId) cache.delete(String(userId));
  else cache.clear();
};

/**
 * Effective permissions of a user, evaluated against the CURRENT database state.
 * The cache is validated against the user's permissionVersion on every call (one indexed read).
 */
export async function getCachedPermissions(userId: string): Promise<PermissionSnapshot> {
  if (!/^[a-f\d]{24}$/i.test(String(userId))) return EMPTY;
  const id = String(userId);

  const user = await User.findById(id)
    .select('role roleId isActive isDeleted accountStatus accessExpiry permissionVersion')
    .lean<UserLike>();
  if (!user || user.isDeleted || user.isActive === false) return EMPTY;

  if (isFullAdminRole(user.role)) {
    return { permissions: new Set(PERMISSION_KEYS), version: user.permissionVersion ?? 0, fullAdmin: true };
  }
  if (!isSubAdminUsable(user)) return EMPTY;

  const version = user.permissionVersion ?? 0;
  const hit = cache.get(id);
  if (hit && hit.version === version && Date.now() - hit.at < CACHE_TTL_MS) return hit;

  const permissions = await computeAssignedPermissions(user);
  const snapshot = { permissions, version, fullAdmin: false };
  cache.set(id, { ...snapshot, at: Date.now() });
  return snapshot;
}

// ── Change propagation ─────────────────────────────────────────────────────────

/** Call AFTER the permission data changed. The next request of each affected user re-evaluates from the database. */
export async function bumpPermissionVersion(userIds: Array<string | Types.ObjectId> | string | Types.ObjectId): Promise<void> {
  const ids = (Array.isArray(userIds) ? userIds : [userIds]).map(String);
  if (ids.length === 0) return;
  await User.updateMany({ _id: { $in: ids } }, { $inc: { permissionVersion: 1 }, $set: { lastPermissionSync: new Date() } });
  ids.forEach((id) => invalidatePermissionCache(id));
}

/**
 * Ends every session of a user immediately:
 *  - all refresh tokens are revoked (no new access tokens can be minted)
 *  - tokensValidAfter makes every access token issued up to now invalid (authMiddleware checks it on each request)
 */
export async function revokeAllSessions(userId: string | Types.ObjectId): Promise<void> {
  await Promise.all([
    RefreshToken.updateMany({ user: userId, isRevoked: false }, { isRevoked: true }),
    User.updateOne({ _id: userId }, { $set: { tokensValidAfter: new Date() }, $inc: { permissionVersion: 1 } }),
  ]);
  invalidatePermissionCache(userId);
}

// ── Delegation (separation of duties) ──────────────────────────────────────────

export async function permissionsHeldBy(actor: ActorContext): Promise<Set<string>> {
  if (isFullAdminRole(actor.role)) return new Set(PERMISSION_KEYS);
  const { permissions } = await getCachedPermissions(actor.userId);
  return permissions;
}

export type GrantCheck =
  | { ok: true }
  | { ok: false; status: 400 | 403; message: string; missing?: string[] };

/**
 * May `actor` grant these permissions (to a role or a user)?
 *  - every key must exist and be enforced (reserved keys cannot be granted)
 *  - a sub-admin can only pass on permissions they hold themselves
 *  - staff-management (admin.*) permissions can only be granted by a Super Admin / Admin
 */
export async function checkGrant(actor: ActorContext, keys: string[]): Promise<GrantCheck> {
  const unique = [...new Set(keys)];

  const unknown = unique.filter((k) => !isKnownPermission(k));
  if (unknown.length) return { ok: false, status: 400, message: `Unknown permission(s): ${unknown.join(', ')}`, missing: unknown };

  const reserved = unique.filter((k) => !ASSIGNABLE_KEYS.has(k));
  if (reserved.length) {
    return { ok: false, status: 400, message: `Permission(s) not available yet: ${reserved.join(', ')}`, missing: reserved };
  }

  if (isFullAdminRole(actor.role)) return { ok: true };

  const staffMgmt = unique.filter((k) => STAFF_MANAGEMENT_KEYS.has(k));
  if (staffMgmt.length) {
    return { ok: false, status: 403, message: 'Only a Super Admin can grant staff-management permissions.', missing: staffMgmt };
  }

  const held = await permissionsHeldBy(actor);
  const missing = unique.filter((k) => !held.has(k));
  if (missing.length) {
    return { ok: false, status: 403, message: 'You can only grant permissions that you hold yourself.', missing };
  }
  return { ok: true };
}

/** True when the actor holds every one of these permissions (full admins always do). */
export async function actorHoldsAll(actor: ActorContext, keys: Iterable<string>): Promise<boolean> {
  if (isFullAdminRole(actor.role)) return true;
  const held = await permissionsHeldBy(actor);
  for (const k of keys) if (!held.has(k)) return false;
  return true;
}

// ── Atomic multi-document work ─────────────────────────────────────────────────

let warnedNoTransactions = false;
const transactionsUnsupported = (err: any): boolean =>
  err?.code === 20 || /Transaction numbers are only allowed/i.test(String(err?.message || ''));

/**
 * Runs `work` inside a MongoDB transaction. On a standalone mongod (local development) transactions are not
 * available; the work then runs without one and a warning is printed. MongoDB Atlas / replica sets always get
 * a real transaction.
 */
export async function runAtomic<T>(work: (session?: ClientSession) => Promise<T>): Promise<T> {
  const session = await mongoose.startSession();
  try {
    let result!: T;
    await session.withTransaction(async () => {
      result = await work(session);
    });
    return result;
  } catch (err: any) {
    if (transactionsUnsupported(err)) {
      if (!warnedNoTransactions) {
        warnedNoTransactions = true;
        console.warn('[RBAC] MongoDB transactions are unavailable (standalone server) - multi-step writes are not atomic here.');
      }
      return work(undefined);
    }
    throw err;
  } finally {
    await session.endSession();
  }
}
