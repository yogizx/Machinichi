import crypto from 'crypto';
import { Response } from 'express';
import { ClientSession, Types } from 'mongoose';
import { z } from 'zod';
import { AuthRequest } from '../../middlewares/auth.middleware';
import { sendSuccess, sendError } from '../../services/apiResponse';
import { User } from '../../models/User';
import { Role } from '../../models/Role';
import { Permission } from '../../models/Permission';
import { RolePermission } from '../../models/RolePermission';
import { UserPermissionOverride } from '../../models/UserPermissionOverride';
import { AdminInvitation } from '../../models/AdminInvitation';
import { AdminAuditLog } from '../../models/AdminAuditLog';
import { RefreshToken } from '../../models/RefreshToken';
import { recordAudit } from '../../services/audit.service';
import { MODULES, PERMISSIONS, ASSIGNABLE_KEYS, STAFF_MANAGEMENT_KEYS, isKnownPermission } from '../../services/permissionCatalog';
import {
  ActorContext,
  isFullAdminRole,
  getCachedPermissions,
  getRolePermissionKeys,
  computeAssignedPermissions,
  bumpPermissionVersion,
  revokeAllSessions,
  checkGrant,
  actorHoldsAll,
  permissionsHeldBy,
  runAtomic,
} from '../../services/rbac.service';
import { generateTotpSecret, encryptSecret, decryptSecret, findTotpStep, buildOtpAuthUrl, generateRecoveryCodes } from '../../services/mfa.service';
import { sendStaffInvitationEmail, sendPasswordResetEmail } from '../../services/email.service';
import { validateStaffPassword } from '../../services/passwordPolicy';

// ─────────────────────────────────────────────────────────────────────────────
// Constants & helpers
// ─────────────────────────────────────────────────────────────────────────────

const INVITE_TTL_HOURS = 48;
const SETUP_TTL_MS = 15 * 60 * 1000;
const MAX_SETUP_ATTEMPTS = 5;
const MAX_SUB_ADMINS = 100;
const ID_RE = /^[a-f\d]{24}$/i;
const STATUSES = ['pending_invitation', 'active', 'suspended', 'revoked'] as const;

const sha256 = (value: string): string => crypto.createHash('sha256').update(value).digest('hex');
const newToken = (): string => crypto.randomBytes(32).toString('base64url');
const escapeRegex = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const isDuplicateKey = (err: any): boolean => err?.code === 11000;
const actorOf = (req: AuthRequest): ActorContext => ({ userId: req.user!.userId, role: req.user!.role });
const clientUrl = (): string => process.env.CLIENT_URL || 'http://localhost:5173';
const isProduction = (): boolean => process.env.NODE_ENV === 'production';

const permissionDefByKey = new Map(PERMISSIONS.map((p) => [p.key, p]));

const badRequest = (res: Response, error: z.ZodError) =>
  sendError(res, 'Validation failed', 400, error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })));

const forbidden = (res: Response, message: string, extra?: Record<string, any>) =>
  res.status(403).json({ success: false, message, ...extra });

const objectIdStr = z.string().regex(ID_RE, 'Invalid id');
const httpUrl = z.string().trim().max(500).refine((u) => /^https?:\/\//i.test(u), 'Must be an http(s) URL');
const mobileSchema = z.string().trim().regex(/^\+?[0-9 ()-]{7,20}$/, 'Invalid mobile number');
const futureDate = z.coerce.date().refine((d) => d.getTime() > Date.now(), 'Access expiry must be in the future');

// Strict schemas: unknown properties (role, isActive, permissionVersion, accountStatus ...) are REJECTED,
// which closes mass-assignment.
const inviteSchema = z.object({
  fullName: z.string().trim().min(2).max(80),
  email: z.string().trim().toLowerCase().email().max(254),
  mobile: mobileSchema.optional(),
  profileImage: httpUrl.optional(),
  roleId: objectIdStr,
  accessExpiry: futureDate.optional(),
  accountStatus: z.literal('pending_invitation').optional(), // new accounts are always created as pending
}).strict();

const updateSchema = z.object({
  fullName: z.string().trim().min(2).max(80).optional(),
  mobile: z.union([mobileSchema, z.null()]).optional(),
  profileImage: z.union([httpUrl, z.null()]).optional(),
  roleId: objectIdStr.optional(),
  accessExpiry: z.union([futureDate, z.null()]).optional(),
}).strict();

const statusSchema = z.object({
  status: z.enum(['active', 'suspended', 'revoked']),
  reason: z.string().trim().max(200).optional(),
}).strict();

const listSchema = z.object({
  search: z.string().trim().max(80).optional(),
  status: z.enum(STATUSES).optional(),
  role: objectIdStr.optional(),
  page: z.coerce.number().int().min(1).max(10000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const roleNameSchema = z.string().trim().min(2).max(60).regex(/^[\p{L}\p{N} &().,'/-]+$/u, 'Role name contains unsupported characters');
const permissionKeysSchema = z.array(z.string().trim().max(80)).max(300);
const createRoleSchema = z.object({
  roleName: roleNameSchema,
  description: z.string().trim().max(200).optional(),
  permissions: permissionKeysSchema.default([]),
}).strict();
const updateRoleSchema = z.object({
  roleName: roleNameSchema.optional(),
  description: z.string().trim().max(200).optional(),
}).strict();
const rolePermissionsSchema = z.object({ permissions: permissionKeysSchema }).strict();
const duplicateRoleSchema = z.object({ roleName: roleNameSchema }).strict();
const overridesSchema = z.object({
  overrides: z.array(z.object({
    permissionKey: z.string().trim().max(80),
    effect: z.enum(['allow', 'deny']),
  }).strict()).max(300),
}).strict();

const auditQuerySchema = z.object({
  module: z.string().trim().max(40).optional(),
  action: z.string().trim().max(80).optional(),
  outcome: z.enum(['success', 'denied', 'failure']).optional(),
  actorId: objectIdStr.optional(),
  targetUserId: objectIdStr.optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  page: z.coerce.number().int().min(1).max(10000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

const invitationTokenSchema = z.object({ token: z.string().min(20).max(200) }).strict();
const startActivationSchema = z.object({ token: z.string().min(20).max(200), password: z.string().min(1).max(200) }).strict();
const completeActivationSchema = z.object({
  setupToken: z.string().min(20).max(200),
  code: z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code'),
}).strict();

const STAFF_LIST_FIELDS =
  'fullName email phone profileImage role roleId accountStatus accessExpiry invitedBy lastLogin isActive createdAt updatedAt mfa.enabled mfa.enrolledAt';

function serializeStaff(u: any) {
  const role = u.roleId && typeof u.roleId === 'object' && u.roleId.roleName ? u.roleId : null;
  return {
    _id: String(u._id),
    fullName: u.fullName,
    email: u.email,
    mobile: u.phone,
    profileImage: u.profileImage,
    role: role ? { _id: String(role._id), roleName: role.roleName } : null,
    roleId: role ? String(role._id) : u.roleId ? String(u.roleId) : null,
    accountStatus: u.accountStatus,
    accessExpiry: u.accessExpiry || null,
    lastLogin: u.lastLogin || null,
    mfaEnabled: !!u.mfa?.enabled,
    createdAt: u.createdAt,
    updatedAt: u.updatedAt,
  };
}

async function loadSubAdmin(id: string) {
  if (!ID_RE.test(id)) return null;
  return User.findOne({ _id: id, role: 'sub_admin', isDeleted: false });
}

/**
 * Authorization for acting ON another administrator. Throws a response-shaped error object when refused.
 *  - never yourself (nobody changes their own role, status or permissions)
 *  - you must hold every permission that account holds (full admins always do) - nobody manages a more powerful account
 */
async function guardTarget(req: AuthRequest, res: Response, target: any, action: string): Promise<boolean> {
  const actor = actorOf(req);
  if (String(target._id) === actor.userId) {
    await recordAudit({ actorId: actor.userId, targetUserId: target._id, action: 'authz.self_modification_blocked', module: 'admin', outcome: 'denied', metadata: { attempted: action }, req });
    forbidden(res, 'You cannot modify your own account, role or permissions.');
    return false;
  }
  const targetPermissions = await computeAssignedPermissions({ _id: target._id, roleId: target.roleId });
  if (!(await actorHoldsAll(actor, targetPermissions))) {
    await recordAudit({ actorId: actor.userId, targetUserId: target._id, action: 'authz.escalation_blocked', module: 'admin', outcome: 'denied', metadata: { attempted: action }, req });
    forbidden(res, 'This account holds permissions that you do not have, so you cannot manage it.');
    return false;
  }
  return true;
}

/** Can the actor hand this role to somebody? (role must exist, not be the super-admin role, and not exceed the actor) */
async function resolveAssignableRole(roleId: string, actor: ActorContext): Promise<{ ok: true; role: any; keys: Set<string> } | { ok: false; status: number; message: string }> {
  const role = await Role.findById(roleId).lean();
  if (!role) return { ok: false, status: 400, message: 'Selected role does not exist.' };
  if (role.isSuperAdminRole) return { ok: false, status: 403, message: 'The Super Admin role cannot be assigned to a sub-admin.' };

  const keys = await getRolePermissionKeys(role._id);
  if (!isFullAdminRole(actor.role)) {
    const staffMgmt = [...keys].filter((k) => STAFF_MANAGEMENT_KEYS.has(k));
    if (staffMgmt.length) return { ok: false, status: 403, message: 'Only a Super Admin can assign roles that contain staff-management permissions.' };
    if (!(await actorHoldsAll(actor, keys))) {
      return { ok: false, status: 403, message: 'You can only assign roles whose permissions you hold yourself.' };
    }
  }
  return { ok: true, role, keys };
}

async function ensurePermissionIds(keys: string[], session?: ClientSession): Promise<Map<string, Types.ObjectId>> {
  const unique = [...new Set(keys)];
  if (unique.length === 0) return new Map();
  await Permission.bulkWrite(
    unique.map((key) => {
      const d = permissionDefByKey.get(key)!;
      return {
        updateOne: {
          filter: { permissionKey: d.key },
          update: { $setOnInsert: { permissionKey: d.key, module: d.module, action: d.action, description: d.description, isSystem: true } },
          upsert: true,
        },
      };
    }),
    { session },
  );
  const docs = await Permission.find({ permissionKey: { $in: unique } }).select('_id permissionKey').session(session || null).lean();
  return new Map(docs.map((d: any) => [d.permissionKey, d._id as Types.ObjectId]));
}

async function createInvitation(opts: {
  user: any; roleId: any; invitedBy: string; session?: ClientSession;
}): Promise<{ rawToken: string; expiresAt: Date }> {
  const rawToken = newToken();
  const expiresAt = new Date(Date.now() + INVITE_TTL_HOURS * 3600 * 1000);
  await AdminInvitation.updateMany(
    { userId: opts.user._id, status: { $in: ['pending', 'in_progress'] } },
    { $set: { status: 'revoked' } },
    { session: opts.session },
  );
  await AdminInvitation.create(
    [{
      email: opts.user.email,
      userId: opts.user._id,
      tokenHash: sha256(rawToken),
      roleId: opts.roleId,
      status: 'pending',
      invitedBy: opts.invitedBy,
      expiresAt,
    }],
    { session: opts.session },
  );
  return { rawToken, expiresAt };
}

async function deliverInvitation(opts: {
  req: AuthRequest; user: any; roleName: string; rawToken: string; expiresAt: Date;
}): Promise<{ emailSent: boolean; inviteUrl?: string }> {
  // The token travels in the URL fragment: browsers never send it to a server, proxy or log.
  const inviteUrl = `${clientUrl()}/admin/activate-invitation#token=${opts.rawToken}`;
  const inviter = await User.findById(opts.req.user!.userId).select('fullName').lean();
  let emailSent = false;
  try {
    await sendStaffInvitationEmail(opts.user.email, {
      fullName: opts.user.fullName,
      roleName: opts.roleName,
      inviteUrl,
      invitedByName: inviter?.fullName,
      expiresAt: opts.expiresAt,
    });
    emailSent = true;
  } catch (err: any) {
    console.error('[STAFF] Invitation e-mail could not be sent:', err?.message || err);
  }
  if (!isProduction()) {
    console.log(`[STAFF][dev only] Invitation link for ${opts.user.email}: ${inviteUrl}`);
  }
  return { emailSent, ...(isProduction() ? {} : { inviteUrl }) };
}

// ─────────────────────────────────────────────────────────────────────────────
// Who am I / catalog
// ─────────────────────────────────────────────────────────────────────────────

export const getMyPermissions = async (req: AuthRequest, res: Response) => {
  const snapshot = await getCachedPermissions(req.user!.userId);
  const me = await User.findById(req.user!.userId).select('fullName email role roleId accountStatus accessExpiry').populate('roleId', 'roleName').lean();
  return sendSuccess(res, {
    data: {
      permissions: [...snapshot.permissions].sort(),
      permissionVersion: snapshot.version,
      isFullAdmin: snapshot.fullAdmin,
      role: req.user!.role,
      roleName: (me?.roleId as any)?.roleName || null,
      fullName: me?.fullName,
      email: me?.email,
      accountStatus: me?.accountStatus,
      accessExpiry: me?.accessExpiry || null,
    },
  });
};

export const getPermissionCatalog = async (req: AuthRequest, res: Response) => {
  const actor = actorOf(req);
  const held = await permissionsHeldBy(actor);
  const grantable = PERMISSIONS
    .filter((p) => ASSIGNABLE_KEYS.has(p.key))
    .filter((p) => isFullAdminRole(actor.role) || (held.has(p.key) && !STAFF_MANAGEMENT_KEYS.has(p.key)))
    .map((p) => p.key);
  return sendSuccess(res, { data: PERMISSIONS, modules: MODULES, grantable });
};

// ─────────────────────────────────────────────────────────────────────────────
// Sub-admins
// ─────────────────────────────────────────────────────────────────────────────

export const getSubAdmins = async (req: AuthRequest, res: Response) => {
  const parsed = listSchema.safeParse(req.query);
  if (!parsed.success) return badRequest(res, parsed.error);
  const { search, status, role, page, limit } = parsed.data;

  const filter: Record<string, any> = { role: 'sub_admin', isDeleted: false };
  if (status) filter.accountStatus = status;
  if (role) filter.roleId = new Types.ObjectId(role);
  if (search) {
    const rx = new RegExp(escapeRegex(search), 'i'); // escaped: user input is never a regular expression
    filter.$or = [{ fullName: rx }, { email: rx }];
  }

  const [rows, total, statRows] = await Promise.all([
    User.find(filter).select(STAFF_LIST_FIELDS).populate('roleId', 'roleName').sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    User.countDocuments(filter),
    User.aggregate([{ $match: { role: 'sub_admin', isDeleted: false } }, { $group: { _id: '$accountStatus', count: { $sum: 1 } } }]),
  ]);

  const stats: Record<string, number> = { total: 0, active: 0, pending_invitation: 0, suspended: 0, revoked: 0 };
  for (const s of statRows) {
    stats[s._id as string] = s.count;
    stats.total += s.count;
  }

  const pendingIds = rows.filter((r: any) => r.accountStatus === 'pending_invitation').map((r: any) => r._id);
  const invitations = pendingIds.length
    ? await AdminInvitation.find({ userId: { $in: pendingIds }, status: { $in: ['pending', 'in_progress'] } }).select('userId status expiresAt').lean()
    : [];
  const inviteByUser = new Map(invitations.map((i: any) => [String(i.userId), i]));

  const data = rows.map((r: any) => {
    const base = serializeStaff(r);
    const inv: any = inviteByUser.get(String(r._id));
    return {
      ...base,
      invitationExpiresAt: inv?.expiresAt || null,
      invitationExpired: r.accountStatus === 'pending_invitation' && (!inv || new Date(inv.expiresAt) < new Date()),
    };
  });

  return sendSuccess(res, {
    data,
    stats,
    pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
  });
};

export const getSubAdminById = async (req: AuthRequest, res: Response) => {
  const id = String(req.params.id);
  if (!ID_RE.test(id)) return sendError(res, 'Invalid id', 400);
  const user = await User.findOne({ _id: id, role: 'sub_admin', isDeleted: false })
    .select(STAFF_LIST_FIELDS).populate('roleId', 'roleName').lean();
  if (!user) return sendError(res, 'Sub-admin not found', 404);

  const [permissions, overrides, activeSessions] = await Promise.all([
    computeAssignedPermissions({ _id: user._id, roleId: (user.roleId as any)?._id }),
    UserPermissionOverride.find({ userId: user._id }).populate<{ permissionId: { permissionKey: string } | null }>('permissionId', 'permissionKey').lean(),
    RefreshToken.countDocuments({ user: user._id, isRevoked: false, expiresAt: { $gt: new Date() } }),
  ]);

  return sendSuccess(res, {
    data: {
      ...serializeStaff(user),
      permissions: [...permissions].sort(),
      overrides: overrides
        .filter((o) => o.permissionId?.permissionKey)
        .map((o) => ({ permissionKey: o.permissionId!.permissionKey, effect: o.effect })),
      activeSessions,
    },
  });
};

export const inviteSubAdmin = async (req: AuthRequest, res: Response) => {
  const parsed = inviteSchema.safeParse(req.body);
  if (!parsed.success) return badRequest(res, parsed.error);
  const body = parsed.data;
  const actor = actorOf(req);

  if ((await User.countDocuments({ role: 'sub_admin', isDeleted: false })) >= MAX_SUB_ADMINS) {
    return sendError(res, `Maximum of ${MAX_SUB_ADMINS} sub-admins reached.`, 400);
  }

  const roleCheck = await resolveAssignableRole(body.roleId, actor);
  if (!roleCheck.ok) {
    await recordAudit({ actorId: actor.userId, action: 'sub_admin.invite_blocked', module: 'admin', outcome: 'denied', metadata: { roleId: body.roleId, reason: roleCheck.message }, req });
    return res.status(roleCheck.status).json({ success: false, message: roleCheck.message });
  }

  // Administrative e-mail addresses are unique across ALL accounts.
  const existing = await User.findOne({ email: body.email }).select('_id role isDeleted').lean();
  let reuseId: string | null = null;
  if (existing) {
    if (existing.role === 'sub_admin' && existing.isDeleted) reuseId = String(existing._id); // re-invite a removed sub-admin
    else return sendError(res, 'An account with this e-mail address already exists.', 409);
  }
  if (body.mobile) {
    const phoneTaken = await User.findOne({ phone: body.mobile, ...(reuseId ? { _id: { $ne: reuseId } } : {}) }).select('_id').lean();
    if (phoneTaken) return sendError(res, 'This mobile number is already in use.', 409);
  }

  let created: { user: any; rawToken: string; expiresAt: Date };
  try {
    created = await runAtomic(async (session) => {
      const common = {
        fullName: body.fullName,
        email: body.email,
        phone: body.mobile,
        profileImage: body.profileImage,
        role: 'sub_admin' as const,
        roleId: roleCheck.role._id,
        accountStatus: 'pending_invitation' as const,
        accessExpiry: body.accessExpiry,
        invitedBy: actor.userId,
        isActive: false,
        isEmailVerified: false,
      };

      let user: any;
      if (reuseId) {
        user = await User.findById(reuseId).session(session || null);
        Object.assign(user, common, { isDeleted: false, failedLoginAttempts: 0 });
        user.password = undefined;
        user.mfa = { enabled: false };
        await user.save({ session });
        await UserPermissionOverride.deleteMany({ userId: user._id }, { session });
      } else {
        [user] = await User.create([{ ...common, provider: 'local', permissionVersion: 0 }], { session });
      }
      const { rawToken, expiresAt } = await createInvitation({ user, roleId: roleCheck.role._id, invitedBy: actor.userId, session });
      return { user, rawToken, expiresAt };
    });
  } catch (err: any) {
    if (isDuplicateKey(err)) return sendError(res, 'An account with this e-mail address or mobile number already exists.', 409);
    throw err;
  }

  if (reuseId) await revokeAllSessions(reuseId);

  const delivery = await deliverInvitation({ req, user: created.user, roleName: roleCheck.role.roleName, rawToken: created.rawToken, expiresAt: created.expiresAt });
  await recordAudit({
    actorId: actor.userId, targetUserId: created.user._id, action: 'sub_admin.invited', module: 'admin', resourceId: String(created.user._id),
    metadata: { roleId: String(roleCheck.role._id), roleName: roleCheck.role.roleName, emailSent: delivery.emailSent, hasExpiry: !!body.accessExpiry }, req,
  });

  const fresh = await User.findById(created.user._id).select(STAFF_LIST_FIELDS).populate('roleId', 'roleName').lean();
  return sendSuccess(res, {
    message: delivery.emailSent ? 'Invitation sent.' : 'Sub-admin created, but the invitation e-mail could not be sent. Use "Resend invitation".',
    data: serializeStaff(fresh),
    emailSent: delivery.emailSent,
    ...(delivery.inviteUrl ? { inviteUrl: delivery.inviteUrl } : {}),
  }, 201);
};

export const resendInvitation = async (req: AuthRequest, res: Response) => {
  const target = await loadSubAdmin(String(req.params.id));
  if (!target) return sendError(res, 'Sub-admin not found', 404);
  if (!(await guardTarget(req, res, target, 'resend_invitation'))) return;
  if (target.accountStatus !== 'pending_invitation') return sendError(res, 'Only pending invitations can be re-sent.', 400);
  if (!target.roleId) return sendError(res, 'This account has no role assigned.', 400);

  const roleCheck = await resolveAssignableRole(String(target.roleId), actorOf(req));
  if (!roleCheck.ok) return res.status(roleCheck.status).json({ success: false, message: roleCheck.message });

  const { rawToken, expiresAt } = await runAtomic((session) => createInvitation({ user: target, roleId: target.roleId, invitedBy: req.user!.userId, session }));
  const delivery = await deliverInvitation({ req, user: target, roleName: roleCheck.role.roleName, rawToken, expiresAt });
  await recordAudit({ actorId: req.user!.userId, targetUserId: target._id, action: 'sub_admin.invitation_resent', module: 'admin', resourceId: String(target._id), metadata: { emailSent: delivery.emailSent }, req });
  return sendSuccess(res, {
    message: delivery.emailSent ? 'Invitation re-sent.' : 'The invitation e-mail could not be sent.',
    emailSent: delivery.emailSent,
    ...(delivery.inviteUrl ? { inviteUrl: delivery.inviteUrl } : {}),
  });
};

export const updateSubAdmin = async (req: AuthRequest, res: Response) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return badRequest(res, parsed.error);
  const body = parsed.data;
  const actor = actorOf(req);

  const target = await loadSubAdmin(String(req.params.id));
  if (!target) return sendError(res, 'Sub-admin not found', 404);
  if (!(await guardTarget(req, res, target, 'update'))) return;

  const previousRoleId = target.roleId ? String(target.roleId) : null;
  const roleChanged = !!body.roleId && body.roleId !== previousRoleId;
  let newRole: any = null;
  if (roleChanged) {
    const roleCheck = await resolveAssignableRole(body.roleId!, actor);
    if (!roleCheck.ok) {
      await recordAudit({ actorId: actor.userId, targetUserId: target._id, action: 'sub_admin.role_change_blocked', module: 'admin', outcome: 'denied', metadata: { roleId: body.roleId, reason: roleCheck.message }, req });
      return res.status(roleCheck.status).json({ success: false, message: roleCheck.message });
    }
    newRole = roleCheck.role;
  }

  if (body.fullName !== undefined) target.fullName = body.fullName;
  if (body.mobile !== undefined) target.phone = body.mobile === null ? undefined : body.mobile;
  if (body.profileImage !== undefined) target.profileImage = body.profileImage === null ? undefined : body.profileImage;
  if (body.accessExpiry !== undefined) target.accessExpiry = body.accessExpiry === null ? undefined : body.accessExpiry;
  if (roleChanged) target.roleId = newRole._id;

  let clearedOverrides = 0;
  try {
    await runAtomic(async (session) => {
      await target.save({ session });
      if (roleChanged) {
        // A new role starts from a clean slate: grants left over from the previous role would be silent privilege creep.
        const r = await UserPermissionOverride.deleteMany({ userId: target._id }, { session });
        clearedOverrides = r.deletedCount || 0;
      }
    });
  } catch (err: any) {
    if (isDuplicateKey(err)) return sendError(res, 'This mobile number is already in use.', 409);
    throw err;
  }

  if (roleChanged) await bumpPermissionVersion(String(target._id)); // takes effect on the user's very next request

  await recordAudit({
    actorId: actor.userId, targetUserId: target._id, resourceId: String(target._id), module: 'admin',
    action: roleChanged ? 'sub_admin.role_changed' : 'sub_admin.updated',
    metadata: { fields: Object.keys(body), ...(roleChanged ? { fromRoleId: previousRoleId, toRoleId: String(newRole._id), toRoleName: newRole.roleName, overridesCleared: clearedOverrides } : {}) },
    req,
  });

  const fresh = await User.findById(target._id).select(STAFF_LIST_FIELDS).populate('roleId', 'roleName').lean();
  return sendSuccess(res, { message: 'Sub-admin updated.', data: serializeStaff(fresh) });
};

const TRANSITIONS: Record<string, string[]> = {
  pending_invitation: ['revoked'],
  active: ['suspended', 'revoked'],
  suspended: ['active', 'revoked'],
  revoked: [],
};

export const setSubAdminStatus = async (req: AuthRequest, res: Response) => {
  const parsed = statusSchema.safeParse(req.body);
  if (!parsed.success) return badRequest(res, parsed.error);
  const { status, reason } = parsed.data;

  const target = await loadSubAdmin(String(req.params.id));
  if (!target) return sendError(res, 'Sub-admin not found', 404);
  if (!(await guardTarget(req, res, target, `status:${status}`))) return;

  const from = target.accountStatus || 'active';
  if (!(TRANSITIONS[from] || []).includes(status)) {
    return sendError(res, `An account that is "${from.replace('_', ' ')}" cannot be changed to "${status}".`, 400);
  }
  if (status === 'active') {
    if (!target.mfa?.enabled) return sendError(res, 'This account has not completed activation.', 400);
    if (target.accessExpiry && target.accessExpiry.getTime() <= Date.now()) {
      return sendError(res, 'Access has expired. Set a new access expiry first.', 400);
    }
  }

  target.accountStatus = status;
  target.isActive = status === 'active';
  await target.save();

  if (status !== 'active') {
    await AdminInvitation.updateMany({ userId: target._id, status: { $in: ['pending', 'in_progress'] } }, { $set: { status: 'revoked' } });
    await revokeAllSessions(String(target._id)); // immediate: existing sessions stop working on their next request
  } else {
    await bumpPermissionVersion(String(target._id));
  }

  await recordAudit({
    actorId: req.user!.userId, targetUserId: target._id, resourceId: String(target._id), module: 'admin',
    action: status === 'active' ? 'sub_admin.reactivated' : status === 'suspended' ? 'sub_admin.suspended' : 'sub_admin.revoked',
    metadata: { from, to: status, reason }, req,
  });

  const fresh = await User.findById(target._id).select(STAFF_LIST_FIELDS).populate('roleId', 'roleName').lean();
  return sendSuccess(res, { message: `Account ${status === 'active' ? 'reactivated' : status}.`, data: serializeStaff(fresh) });
};

export const revokeSubAdminSessions = async (req: AuthRequest, res: Response) => {
  const target = await loadSubAdmin(String(req.params.id));
  if (!target) return sendError(res, 'Sub-admin not found', 404);
  if (!(await guardTarget(req, res, target, 'revoke_sessions'))) return;

  await revokeAllSessions(String(target._id));
  await recordAudit({ actorId: req.user!.userId, targetUserId: target._id, resourceId: String(target._id), action: 'session.revoked', module: 'admin', req });
  return sendSuccess(res, { message: 'All sessions revoked.' });
};

export const getSubAdminSessions = async (req: AuthRequest, res: Response) => {
  const id = String(req.params.id);
  if (!ID_RE.test(id)) return sendError(res, 'Invalid id', 400);
  const target = await User.findOne({ _id: id, role: 'sub_admin', isDeleted: false }).select('_id').lean();
  if (!target) return sendError(res, 'Sub-admin not found', 404);

  // Only metadata: the stored (hashed) token values are never selected.
  const sessions = await RefreshToken.find({ user: target._id, isRevoked: false, expiresAt: { $gt: new Date() } })
    .select('userIp userAgent createdAt expiresAt mfaVerified').sort({ createdAt: -1 }).limit(50).lean();
  return sendSuccess(res, {
    data: sessions.map((s: any) => ({
      id: String(s._id), ip: s.userIp, userAgent: s.userAgent, startedAt: s.createdAt, expiresAt: s.expiresAt, mfaVerified: !!s.mfaVerified,
    })),
  });
};

export const requestSubAdminPasswordReset = async (req: AuthRequest, res: Response) => {
  const target = await loadSubAdmin(String(req.params.id));
  if (!target) return sendError(res, 'Sub-admin not found', 404);
  if (!(await guardTarget(req, res, target, 'password_reset'))) return;
  if (target.accountStatus !== 'active') return sendError(res, 'Password recovery is only available for active accounts.', 400);

  const token = crypto.randomBytes(32).toString('hex');
  await User.updateOne({ _id: target._id }, {
    $set: { passwordResetToken: sha256(token), passwordResetExpires: new Date(Date.now() + 30 * 60 * 1000) },
  });
  let emailSent = false;
  try {
    await sendPasswordResetEmail(target.email!, `${clientUrl()}/forgot-password?token=${token}&admin=1`, target.fullName);
    emailSent = true;
  } catch (err: any) {
    console.error('[STAFF] Password reset e-mail failed:', err?.message || err);
  }
  await revokeAllSessions(String(target._id));
  await recordAudit({ actorId: req.user!.userId, targetUserId: target._id, resourceId: String(target._id), action: 'sub_admin.password_reset_initiated', module: 'admin', metadata: { emailSent }, req });
  return sendSuccess(res, { message: emailSent ? 'Password recovery e-mail sent. Existing sessions were ended.' : 'Sessions ended, but the recovery e-mail could not be sent.', emailSent });
};

export const deleteSubAdmin = async (req: AuthRequest, res: Response) => {
  const target = await loadSubAdmin(String(req.params.id));
  if (!target) return sendError(res, 'Sub-admin not found', 404);
  if (!(await guardTarget(req, res, target, 'delete'))) return;

  target.isDeleted = true;
  target.isActive = false;
  target.accountStatus = 'revoked';
  await target.save();
  await AdminInvitation.updateMany({ userId: target._id, status: { $in: ['pending', 'in_progress'] } }, { $set: { status: 'revoked' } });
  await revokeAllSessions(String(target._id));

  await recordAudit({ actorId: req.user!.userId, targetUserId: target._id, resourceId: String(target._id), action: 'sub_admin.deleted', module: 'admin', req });
  return sendSuccess(res, { message: 'Sub-admin deleted.' });
};

// ─────────────────────────────────────────────────────────────────────────────
// Per-user permission overrides
// ─────────────────────────────────────────────────────────────────────────────

export const updateUserPermissions = async (req: AuthRequest, res: Response) => {
  const parsed = overridesSchema.safeParse(req.body);
  if (!parsed.success) return badRequest(res, parsed.error);
  const { overrides } = parsed.data;
  const actor = actorOf(req);

  const keys = overrides.map((o) => o.permissionKey);
  if (new Set(keys).size !== keys.length) return sendError(res, 'A permission can only appear once.', 400);
  const unknown = keys.filter((k) => !isKnownPermission(k));
  if (unknown.length) return sendError(res, `Unknown permission(s): ${unknown.join(', ')}`, 400);

  const target = await loadSubAdmin(String(req.params.id));
  if (!target) return sendError(res, 'Sub-admin not found', 404);
  if (!(await guardTarget(req, res, target, 'override_permissions'))) return;

  // Granting needs the same delegation rights as editing a role; denying is always allowed.
  const allowKeys = overrides.filter((o) => o.effect === 'allow').map((o) => o.permissionKey);
  const grant = await checkGrant(actor, allowKeys);
  if (!grant.ok) {
    await recordAudit({ actorId: actor.userId, targetUserId: target._id, action: 'authz.escalation_blocked', module: 'admin', outcome: 'denied', metadata: { attempted: 'override_permissions', missing: grant.missing }, req });
    return res.status(grant.status).json({ success: false, message: grant.message, missing: grant.missing });
  }

  const previous = await UserPermissionOverride.find({ userId: target._id }).populate<{ permissionId: { permissionKey: string } | null }>('permissionId', 'permissionKey').lean();
  const before = new Map(previous.filter((p) => p.permissionId?.permissionKey).map((p) => [p.permissionId!.permissionKey, p.effect]));

  await runAtomic(async (session) => {
    await UserPermissionOverride.deleteMany({ userId: target._id }, { session });
    if (overrides.length) {
      const ids = await ensurePermissionIds(keys, session);
      await UserPermissionOverride.insertMany(
        overrides.map((o) => ({ userId: target._id, permissionId: ids.get(o.permissionKey)!, effect: o.effect, assignedBy: actor.userId })),
        { session },
      );
    }
  });
  await bumpPermissionVersion(String(target._id));

  const after = new Map(overrides.map((o) => [o.permissionKey, o.effect]));
  const added = [...after].filter(([k, e]) => before.get(k) !== e).map(([k, e]) => `${e}:${k}`);
  const removed = [...before].filter(([k]) => !after.has(k)).map(([k, e]) => `${e}:${k}`);
  await recordAudit({ actorId: actor.userId, targetUserId: target._id, resourceId: String(target._id), action: 'permission.override_changed', module: 'admin', metadata: { added, removed }, req });

  return sendSuccess(res, { message: 'Permission overrides saved.' });
};

// ─────────────────────────────────────────────────────────────────────────────
// Roles
// ─────────────────────────────────────────────────────────────────────────────

const moduleOf = (key: string): string => key.split('.')[0];

async function roleSummaries(filter: Record<string, any> = {}) {
  const roles = await Role.find(filter).sort({ isSuperAdminRole: -1, isSystemRole: -1, roleName: 1 }).lean();
  const roleIds = roles.map((r) => r._id);
  const [counts, rows] = await Promise.all([
    User.aggregate([
      { $match: { role: 'sub_admin', isDeleted: false, roleId: { $in: roleIds } } },
      { $group: { _id: '$roleId', count: { $sum: 1 } } },
    ]),
    RolePermission.find({ roleId: { $in: roleIds } }).populate<{ permissionId: { permissionKey: string } | null }>('permissionId', 'permissionKey').lean(),
  ]);
  const countMap = new Map(counts.map((c) => [String(c._id), c.count as number]));
  const keysMap = new Map<string, string[]>();
  for (const row of rows) {
    const key = row.permissionId?.permissionKey;
    if (!key || !permissionDefByKey.has(key)) continue;
    const list = keysMap.get(String(row.roleId)) || [];
    list.push(key);
    keysMap.set(String(row.roleId), list);
  }
  return roles.map((r) => {
    const permissions = (keysMap.get(String(r._id)) || []).sort();
    return {
      _id: String(r._id),
      roleName: r.roleName,
      description: r.description || '',
      isSystemRole: !!r.isSystemRole,
      isSuperAdminRole: !!r.isSuperAdminRole,
      userCount: countMap.get(String(r._id)) || 0,
      permissions,
      modules: [...new Set(permissions.map(moduleOf))],
      permissionCount: permissions.length,
      createdAt: r.createdAt,
    };
  });
}

export const getRoles = async (_req: AuthRequest, res: Response) => {
  return sendSuccess(res, { data: await roleSummaries() });
};

export const getRoleById = async (req: AuthRequest, res: Response) => {
  const id = String(req.params.id);
  if (!ID_RE.test(id)) return sendError(res, 'Invalid id', 400);
  const [role] = await roleSummaries({ _id: new Types.ObjectId(id) });
  if (!role) return sendError(res, 'Role not found', 404);
  return sendSuccess(res, { data: role });
};

const roleNameTaken = async (roleName: string, exceptId?: any): Promise<boolean> => {
  const rx = new RegExp(`^${escapeRegex(roleName)}$`, 'i');
  return !!(await Role.findOne({ roleName: rx, ...(exceptId ? { _id: { $ne: exceptId } } : {}) }).select('_id').lean());
};

/** Common rules for changing or deleting an existing role. Returns the role, or sends the refusal. */
async function guardRoleMutation(req: AuthRequest, res: Response, action: string, opts: { allowRename?: boolean } = {}) {
  const id = String(req.params.id);
  if (!ID_RE.test(id)) { sendError(res, 'Invalid id', 400); return null; }
  const role = await Role.findById(id);
  if (!role) { sendError(res, 'Role not found', 404); return null; }
  const actor = actorOf(req);

  const deny = async (message: string, auditAction = 'authz.role_modification_blocked') => {
    await recordAudit({ actorId: actor.userId, action: auditAction, module: 'admin', outcome: 'denied', resourceId: String(role._id), metadata: { attempted: action, reason: message }, req });
    forbidden(res, message);
    return null;
  };

  if (role.isSuperAdminRole) return deny('The Super Admin role is protected and cannot be changed.');
  if (!isFullAdminRole(actor.role)) {
    if (role.isSystemRole) return deny('System roles can only be changed by a Super Admin.');
    const me = await User.findById(actor.userId).select('roleId').lean();
    if (me?.roleId && String(me.roleId) === String(role._id)) {
      return deny('You cannot change the role that is assigned to you.', 'authz.self_modification_blocked');
    }
    const keys = await getRolePermissionKeys(role._id);
    if (!(await actorHoldsAll(actor, keys))) return deny('This role contains permissions that you do not have, so you cannot change it.', 'authz.escalation_blocked');
  }
  return role;
}

export const createRole = async (req: AuthRequest, res: Response) => {
  const parsed = createRoleSchema.safeParse(req.body);
  if (!parsed.success) return badRequest(res, parsed.error);
  const { roleName, description, permissions } = parsed.data;
  const actor = actorOf(req);

  if (await roleNameTaken(roleName)) return sendError(res, 'A role with this name already exists.', 409);

  const keys = [...new Set(permissions)];
  const grant = await checkGrant(actor, keys);
  if (!grant.ok) {
    await recordAudit({ actorId: actor.userId, action: 'authz.escalation_blocked', module: 'admin', outcome: 'denied', metadata: { attempted: 'create_role', missing: grant.missing }, req });
    return res.status(grant.status).json({ success: false, message: grant.message, missing: grant.missing });
  }

  let roleId: any;
  try {
    roleId = await runAtomic(async (session) => {
      const [role] = await Role.create([{ roleName, description, isSystemRole: false, isSuperAdminRole: false, createdBy: actor.userId }], { session });
      if (keys.length) {
        const ids = await ensurePermissionIds(keys, session);
        await RolePermission.insertMany(keys.map((k) => ({ roleId: role._id, permissionId: ids.get(k)! })), { session });
      }
      return role._id;
    });
  } catch (err: any) {
    if (isDuplicateKey(err)) return sendError(res, 'A role with this name already exists.', 409);
    throw err;
  }

  await recordAudit({ actorId: actor.userId, resourceId: String(roleId), action: 'role.created', module: 'admin', metadata: { roleName, permissions: keys }, req });
  const [created] = await roleSummaries({ _id: roleId });
  return sendSuccess(res, { message: 'Role created.', data: created }, 201);
};

export const updateRole = async (req: AuthRequest, res: Response) => {
  const parsed = updateRoleSchema.safeParse(req.body);
  if (!parsed.success) return badRequest(res, parsed.error);
  const body = parsed.data;

  const role = await guardRoleMutation(req, res, 'update');
  if (!role) return;

  if (body.roleName !== undefined && body.roleName !== role.roleName) {
    if (role.isSystemRole) return forbidden(res, 'System roles cannot be renamed.');
    if (await roleNameTaken(body.roleName, role._id)) return sendError(res, 'A role with this name already exists.', 409);
    role.roleName = body.roleName;
  }
  if (body.description !== undefined) role.description = body.description;

  try {
    await role.save();
  } catch (err: any) {
    if (isDuplicateKey(err)) return sendError(res, 'A role with this name already exists.', 409);
    throw err;
  }
  await recordAudit({ actorId: req.user!.userId, resourceId: String(role._id), action: 'role.updated', module: 'admin', metadata: { fields: Object.keys(body) }, req });
  const [updated] = await roleSummaries({ _id: role._id });
  return sendSuccess(res, { message: 'Role updated.', data: updated });
};

export const updateRolePermissions = async (req: AuthRequest, res: Response) => {
  const parsed = rolePermissionsSchema.safeParse(req.body);
  if (!parsed.success) return badRequest(res, parsed.error);
  const actor = actorOf(req);

  const role = await guardRoleMutation(req, res, 'update_permissions');
  if (!role) return;

  const keys = [...new Set(parsed.data.permissions)];
  const grant = await checkGrant(actor, keys);
  if (!grant.ok) {
    await recordAudit({ actorId: actor.userId, resourceId: String(role._id), action: 'authz.escalation_blocked', module: 'admin', outcome: 'denied', metadata: { attempted: 'update_role_permissions', missing: grant.missing }, req });
    return res.status(grant.status).json({ success: false, message: grant.message, missing: grant.missing });
  }

  const before = await getRolePermissionKeys(role._id);
  await runAtomic(async (session) => {
    await RolePermission.deleteMany({ roleId: role._id }, { session });
    if (keys.length) {
      const ids = await ensurePermissionIds(keys, session);
      await RolePermission.insertMany(keys.map((k) => ({ roleId: role._id, permissionId: ids.get(k)! })), { session });
    }
  });

  // Data first, version second: the next request of every affected user re-reads the new permissions.
  const holders = await User.find({ roleId: role._id }).distinct('_id');
  await bumpPermissionVersion(holders as any[]);

  const after = new Set(keys);
  const added = keys.filter((k) => !before.has(k));
  const removed = [...before].filter((k) => !after.has(k));
  if (added.length) await recordAudit({ actorId: actor.userId, resourceId: String(role._id), action: 'permission.added', module: 'admin', metadata: { roleName: role.roleName, permissions: added, affectedUsers: holders.length }, req });
  if (removed.length) await recordAudit({ actorId: actor.userId, resourceId: String(role._id), action: 'permission.removed', module: 'admin', metadata: { roleName: role.roleName, permissions: removed, affectedUsers: holders.length }, req });

  const [updated] = await roleSummaries({ _id: role._id });
  return sendSuccess(res, { message: 'Role permissions updated.', data: updated });
};

export const duplicateRole = async (req: AuthRequest, res: Response) => {
  const parsed = duplicateRoleSchema.safeParse(req.body);
  if (!parsed.success) return badRequest(res, parsed.error);
  const actor = actorOf(req);

  const id = String(req.params.id);
  if (!ID_RE.test(id)) return sendError(res, 'Invalid id', 400);
  const source = await Role.findById(id).lean();
  if (!source) return sendError(res, 'Role not found', 404);
  if (source.isSuperAdminRole) return forbidden(res, 'The Super Admin role cannot be duplicated.');
  if (await roleNameTaken(parsed.data.roleName)) return sendError(res, 'A role with this name already exists.', 409);

  const keys = [...(await getRolePermissionKeys(source._id))].filter((k) => ASSIGNABLE_KEYS.has(k));
  const grant = await checkGrant(actor, keys); // you can only copy what you could grant
  if (!grant.ok) return res.status(grant.status).json({ success: false, message: grant.message, missing: grant.missing });

  const newId = await runAtomic(async (session) => {
    const [role] = await Role.create([{ roleName: parsed.data.roleName, description: source.description, isSystemRole: false, isSuperAdminRole: false, createdBy: actor.userId }], { session });
    if (keys.length) {
      const ids = await ensurePermissionIds(keys, session);
      await RolePermission.insertMany(keys.map((k) => ({ roleId: role._id, permissionId: ids.get(k)! })), { session });
    }
    return role._id;
  });
  await recordAudit({ actorId: actor.userId, resourceId: String(newId), action: 'role.duplicated', module: 'admin', metadata: { from: String(source._id), roleName: parsed.data.roleName }, req });
  const [created] = await roleSummaries({ _id: newId });
  return sendSuccess(res, { message: 'Role duplicated.', data: created }, 201);
};

export const deleteRole = async (req: AuthRequest, res: Response) => {
  const role = await guardRoleMutation(req, res, 'delete');
  if (!role) return;
  if (role.isSystemRole) return forbidden(res, 'System roles cannot be deleted.');

  const [users, invites] = await Promise.all([
    User.countDocuments({ roleId: role._id, isDeleted: false }),
    AdminInvitation.countDocuments({ roleId: role._id, status: { $in: ['pending', 'in_progress'] } }),
  ]);
  if (users > 0 || invites > 0) {
    return sendError(res, `This role is still in use (${users} account(s), ${invites} open invitation(s)). Reassign them first.`, 409);
  }

  await runAtomic(async (session) => {
    await RolePermission.deleteMany({ roleId: role._id }, { session });
    await Role.deleteOne({ _id: role._id }, { session });
  });
  await recordAudit({ actorId: req.user!.userId, resourceId: String(role._id), action: 'role.deleted', module: 'admin', metadata: { roleName: role.roleName }, req });
  return sendSuccess(res, { message: 'Role deleted.' });
};

// ─────────────────────────────────────────────────────────────────────────────
// Audit log (read-only)
// ─────────────────────────────────────────────────────────────────────────────

export const getAuditLogs = async (req: AuthRequest, res: Response) => {
  const parsed = auditQuerySchema.safeParse(req.query);
  if (!parsed.success) return badRequest(res, parsed.error);
  const q = parsed.data;

  const filter: Record<string, any> = {};
  if (q.module) filter.module = q.module.toLowerCase();
  if (q.outcome) filter.outcome = q.outcome;
  if (q.action) filter.action = new RegExp(`^${escapeRegex(q.action)}`, 'i');
  if (q.actorId) filter.actorId = new Types.ObjectId(q.actorId);
  if (q.targetUserId) filter.targetUserId = new Types.ObjectId(q.targetUserId);
  if (q.from || q.to) filter.createdAt = { ...(q.from ? { $gte: q.from } : {}), ...(q.to ? { $lte: q.to } : {}) };

  const [rows, total] = await Promise.all([
    AdminAuditLog.find(filter)
      .populate('actorId', 'fullName email role')
      .populate('targetUserId', 'fullName email')
      .sort({ createdAt: -1 }).skip((q.page - 1) * q.limit).limit(q.limit).lean(),
    AdminAuditLog.countDocuments(filter),
  ]);

  return sendSuccess(res, {
    data: rows,
    pagination: { total, page: q.page, limit: q.limit, totalPages: Math.ceil(total / q.limit) },
  });
};

// ─────────────────────────────────────────────────────────────────────────────
// Invitation acceptance (PUBLIC endpoints - protected by single-use tokens, MFA enrolment and rate limits)
// ─────────────────────────────────────────────────────────────────────────────

const INVALID_INVITE = 'This invitation is invalid or has expired. Ask your administrator to send a new one.';

export const validateInvitation = async (req: AuthRequest, res: Response) => {
  const parsed = invitationTokenSchema.safeParse(req.body);
  if (!parsed.success) return sendError(res, INVALID_INVITE, 400);

  const inv = await AdminInvitation.findOne({ tokenHash: sha256(parsed.data.token), status: 'pending', expiresAt: { $gt: new Date() } }).lean();
  if (!inv) return sendError(res, INVALID_INVITE, 400);
  const [user, role] = await Promise.all([
    User.findOne({ _id: inv.userId, role: 'sub_admin', accountStatus: 'pending_invitation', isDeleted: false }).select('fullName email').lean(),
    Role.findById(inv.roleId).select('roleName').lean(),
  ]);
  if (!user) return sendError(res, INVALID_INVITE, 400);

  return sendSuccess(res, { data: { fullName: user.fullName, email: user.email, roleName: role?.roleName, expiresAt: inv.expiresAt } });
};

/** Step 1: choose a password. Consumes the invitation token (single use) and starts authenticator enrolment. */
export const startActivation = async (req: AuthRequest, res: Response) => {
  const parsed = startActivationSchema.safeParse(req.body);
  if (!parsed.success) return sendError(res, INVALID_INVITE, 400);
  const { token, password } = parsed.data;
  const now = new Date();

  const pending = await AdminInvitation.findOne({ tokenHash: sha256(token), status: 'pending', expiresAt: { $gt: now } });
  if (!pending) return sendError(res, INVALID_INVITE, 400);
  const user = await User.findOne({ _id: pending.userId, role: 'sub_admin', accountStatus: 'pending_invitation', isDeleted: false });
  if (!user) return sendError(res, INVALID_INVITE, 400);

  // Policy is checked BEFORE the token is consumed, so a weak password does not burn the single-use link.
  const problem = validateStaffPassword(password, { email: user.email, fullName: user.fullName });
  if (problem) return sendError(res, problem, 400);

  // Atomic claim: of any number of concurrent / replayed requests, exactly one wins.
  const setupToken = newToken();
  const claimed = await AdminInvitation.findOneAndUpdate(
    { _id: pending._id, status: 'pending', expiresAt: { $gt: now } },
    { $set: { status: 'in_progress', setupTokenHash: sha256(setupToken), setupExpiresAt: new Date(now.getTime() + SETUP_TTL_MS), setupAttempts: 0 } },
    { new: true },
  );
  if (!claimed) {
    await recordAudit({ targetUserId: user._id, action: 'invitation.replay_blocked', module: 'admin', outcome: 'denied', req });
    return sendError(res, INVALID_INVITE, 400);
  }

  user.password = password; // hashed by the model's pre-save hook
  await user.save();

  const secret = generateTotpSecret();
  await User.updateOne({ _id: user._id }, { $set: { 'mfa.pendingSecretEnc': encryptSecret(secret) } });
  await recordAudit({ actorId: user._id as any, targetUserId: user._id, resourceId: String(claimed._id), action: 'invitation.started', module: 'admin', req });

  return sendSuccess(res, {
    data: {
      setupToken,
      manualKey: secret,
      otpauthUrl: buildOtpAuthUrl(secret, user.email!),
      issuer: 'Machinichi',
      expiresInSeconds: SETUP_TTL_MS / 1000,
    },
  });
};

/** Step 2: prove the authenticator works. Activates the account, then returns one-time recovery codes. */
export const completeActivation = async (req: AuthRequest, res: Response) => {
  const parsed = completeActivationSchema.safeParse(req.body);
  if (!parsed.success) return badRequest(res, parsed.error);
  const { setupToken, code } = parsed.data;
  const now = new Date();
  const setupHash = sha256(setupToken);
  const EXPIRED = 'This setup session has expired. Ask your administrator to send a new invitation.';

  const inv = await AdminInvitation.findOne({ setupTokenHash: setupHash, status: 'in_progress', setupExpiresAt: { $gt: now } });
  if (!inv) return sendError(res, EXPIRED, 400);
  if ((inv.setupAttempts || 0) >= MAX_SETUP_ATTEMPTS) {
    await AdminInvitation.updateOne({ _id: inv._id, status: 'in_progress' }, { $set: { status: 'expired' } });
    return sendError(res, EXPIRED, 400);
  }

  const user = await User.findOne({ _id: inv.userId, role: 'sub_admin', accountStatus: 'pending_invitation', isDeleted: false }).select('+mfa.pendingSecretEnc');
  if (!user || !user.mfa?.pendingSecretEnc) return sendError(res, EXPIRED, 400);
  if (user.accessExpiry && user.accessExpiry.getTime() <= now.getTime()) return sendError(res, 'Access for this account has already expired.', 400);

  const step = findTotpStep(decryptSecret(user.mfa.pendingSecretEnc), code);
  if (step === null) {
    const after = await AdminInvitation.findOneAndUpdate({ _id: inv._id, status: 'in_progress' }, { $inc: { setupAttempts: 1 } }, { new: true });
    if (after && (after.setupAttempts || 0) >= MAX_SETUP_ATTEMPTS) {
      await AdminInvitation.updateOne({ _id: inv._id }, { $set: { status: 'expired' } });
    }
    await recordAudit({ actorId: user._id as any, action: 'mfa.enrollment_failed', module: 'admin', outcome: 'failure', req });
    return sendError(res, 'That code is not correct. Check your authenticator app and try again.', 400);
  }

  const { codes, hashes } = generateRecoveryCodes();
  const pendingSecretEnc = user.mfa.pendingSecretEnc;
  class ActivationRace extends Error {}
  try {
    await runAtomic(async (session) => {
      const claimed = await AdminInvitation.findOneAndUpdate(
        { _id: inv._id, status: 'in_progress', setupTokenHash: setupHash },
        { $set: { status: 'accepted', acceptedAt: now, acceptedBy: user._id }, $unset: { setupTokenHash: '', setupExpiresAt: '' } },
        { session },
      );
      if (!claimed) throw new ActivationRace();
      const result = await User.updateOne(
        { _id: user._id, accountStatus: 'pending_invitation' },
        {
          $set: {
            accountStatus: 'active', isActive: true, isEmailVerified: true, failedLoginAttempts: 0, lastPermissionSync: now,
            'mfa.enabled': true, 'mfa.secretEnc': pendingSecretEnc, 'mfa.enrolledAt': now, 'mfa.lastUsedStep': step, 'mfa.recoveryCodeHashes': hashes,
          },
          $unset: { 'mfa.pendingSecretEnc': '' },
          $inc: { permissionVersion: 1 },
        },
        { session },
      );
      if (result.modifiedCount !== 1) throw new ActivationRace();
    });
  } catch (err) {
    if (err instanceof ActivationRace) return sendError(res, EXPIRED, 400);
    throw err;
  }

  const uid = String(user._id);
  await recordAudit({ actorId: uid, targetUserId: uid, resourceId: String(inv._id), action: 'invitation.accepted', module: 'admin', req });
  await recordAudit({ actorId: uid, targetUserId: uid, action: 'mfa.enrolled', module: 'admin', req });
  await recordAudit({ actorId: uid, targetUserId: uid, action: 'sub_admin.activated', module: 'admin', req });

  return sendSuccess(res, {
    message: 'Your account is active. Save your recovery codes - they are shown only once.',
    data: { email: user.email },
    recoveryCodes: codes,
  });
};
