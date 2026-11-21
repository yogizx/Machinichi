import mongoose from 'mongoose';
import { Permission } from '../models/Permission';
import { Role } from '../models/Role';
import { RolePermission } from '../models/RolePermission';
import { UserPermissionOverride } from '../models/UserPermissionOverride';
import { AdminInvitation } from '../models/AdminInvitation';
import { AdminAuditLog } from '../models/AdminAuditLog';
import { User } from '../models/User';
import { PERMISSIONS, PERMISSION_KEYS, PREDEFINED_ROLES } from '../services/permissionCatalog';

/**
 * RBAC setup / migration. Idempotent and NON-DESTRUCTIVE - safe to run on every deployment.
 *
 *   npm run rbac:setup                       sync the permission catalog, create missing roles, create indexes
 *   npm run rbac:setup -- --reset-system-roles   additionally restore the default permissions of the predefined roles
 *
 * What it does:
 *   1. Upserts every permission of services/permissionCatalog.ts and removes permissions that no longer exist there
 *      (together with the role / override rows that pointed to them - they granted nothing anyway).
 *   2. Creates the protected "Super Admin" role and the predefined roles when they are missing. Existing roles keep
 *      their permissions (a Super Admin may have tailored them) unless --reset-system-roles is given.
 *   3. Creates the database indexes of the RBAC collections. The server runs with autoIndex disabled, so unique
 *      constraints (role name, permission key, role/permission pairs, invitation token hash) only exist after this.
 *      Only the RBAC collections are touched - never users / products / orders.
 *   4. Warns when the platform has no Super Admin. It never promotes anybody automatically.
 */

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

async function syncPermissions(): Promise<Map<string, mongoose.Types.ObjectId>> {
  await Permission.bulkWrite(
    PERMISSIONS.map((p) => ({
      updateOne: {
        filter: { permissionKey: p.key },
        update: {
          $set: { module: p.module, action: p.action, description: p.description },
          $setOnInsert: { permissionKey: p.key, isSystem: true },
        },
        upsert: true,
      },
    })),
  );

  const retired = await Permission.find({ permissionKey: { $nin: [...PERMISSION_KEYS] } }).select('_id permissionKey').lean();
  if (retired.length) {
    const ids = retired.map((r) => r._id);
    const [rp, ov] = await Promise.all([
      RolePermission.deleteMany({ permissionId: { $in: ids } }),
      UserPermissionOverride.deleteMany({ permissionId: { $in: ids } }),
    ]);
    await Permission.deleteMany({ _id: { $in: ids } });
    console.log(`[RBAC SETUP] Removed ${retired.length} retired permission(s) (${rp.deletedCount} role links, ${ov.deletedCount} overrides): ${retired.map((r) => r.permissionKey).join(', ')}`);
  }

  const docs = await Permission.find({ permissionKey: { $in: [...PERMISSION_KEYS] } }).select('_id permissionKey').lean();
  return new Map(docs.map((d) => [d.permissionKey, d._id as mongoose.Types.ObjectId]));
}

async function setRolePermissions(roleId: mongoose.Types.ObjectId, keys: string[], ids: Map<string, mongoose.Types.ObjectId>) {
  await RolePermission.deleteMany({ roleId });
  const rows = keys.filter((k) => ids.has(k)).map((k) => ({ roleId, permissionId: ids.get(k)! }));
  if (rows.length) await RolePermission.insertMany(rows);
}

async function ensureRoles(ids: Map<string, mongoose.Types.ObjectId>, resetSystemRoles: boolean) {
  // Protected Super Admin role (holds every permission; the code treats it as full access regardless).
  let superRole = await Role.findOne({ isSuperAdminRole: true });
  if (!superRole) {
    superRole = await Role.create({ roleName: 'Super Admin', description: 'Full, unrestricted access', isSystemRole: true, isSuperAdminRole: true });
    console.log('[RBAC SETUP] Created role: Super Admin');
  }
  await setRolePermissions(superRole._id as any, [...PERMISSION_KEYS], ids);

  for (const def of PREDEFINED_ROLES) {
    const existing = await Role.findOne({ roleName: new RegExp(`^${escapeRegex(def.name)}$`, 'i') });
    if (!existing) {
      const role = await Role.create({ roleName: def.name, description: def.description, isSystemRole: true, isSuperAdminRole: false });
      await setRolePermissions(role._id as any, def.permissions, ids);
      console.log(`[RBAC SETUP] Created role: ${def.name} (${def.permissions.length} permissions)`);
      continue;
    }
    if (!existing.isSystemRole) {
      existing.isSystemRole = true;
      await existing.save();
    }
    if (resetSystemRoles) {
      await setRolePermissions(existing._id as any, def.permissions, ids);
      console.log(`[RBAC SETUP] Reset permissions of role: ${def.name}`);
      // Users holding this role pick the change up on their next request.
      await User.updateMany({ roleId: existing._id }, { $inc: { permissionVersion: 1 } });
    }
  }
}

async function ensureIndexes() {
  const models: Array<[string, mongoose.Model<any>]> = [
    ['Permission', Permission],
    ['Role', Role],
    ['RolePermission', RolePermission],
    ['UserPermissionOverride', UserPermissionOverride],
    ['AdminInvitation', AdminInvitation],
    ['AdminAuditLog', AdminAuditLog],
  ];
  for (const [name, model] of models) {
    try {
      await model.createIndexes(); // adds missing indexes only; never drops anything
      console.log(`[RBAC SETUP] Indexes ready: ${name}`);
    } catch (err: any) {
      console.error(`[RBAC SETUP] Could not create indexes for ${name}: ${err?.message}`);
      console.error('             (an older index with the same name but different options may exist - drop it manually and re-run)');
    }
  }
}

export async function seedRBAC(options: { resetSystemRoles?: boolean } = {}): Promise<void> {
  console.log('[RBAC SETUP] Starting...');
  const ids = await syncPermissions();
  console.log(`[RBAC SETUP] Permission catalog synced (${ids.size} permissions).`);

  await ensureRoles(ids, !!options.resetSystemRoles);
  await ensureIndexes();

  const superAdmins = await User.countDocuments({ role: 'super_admin', isDeleted: false, isActive: true });
  const admins = await User.countDocuments({ role: 'admin', isDeleted: false, isActive: true });
  if (superAdmins === 0) {
    console.warn(
      `[RBAC SETUP] WARNING: there is no active Super Admin account${admins ? ` (${admins} legacy "admin" account(s) exist and keep full access)` : ''}. ` +
      'Promote the owner account deliberately (set role to "super_admin") - this script never does it automatically.',
    );
  }
  if (!process.env.MFA_ENCRYPTION_KEY || process.env.MFA_ENCRYPTION_KEY.length < 32) {
    console.warn('[RBAC SETUP] WARNING: MFA_ENCRYPTION_KEY (min. 32 characters) is not set. Sub-admin activation will fail in production until it is.');
  }
  console.log('[RBAC SETUP] Done.');
}

// Standalone usage: npm run rbac:setup
if (require.main === module) {
  (async () => {
    (await import('dotenv')).default.config();
    const uri = process.env.MONGODB_URI;
    if (!uri) {
      console.error('MONGODB_URI not set');
      process.exit(1);
    }
    mongoose.set('autoIndex', false);
    await mongoose.connect(uri);
    await seedRBAC({ resetSystemRoles: process.argv.includes('--reset-system-roles') });
    await mongoose.disconnect();
    process.exit(0);
  })().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
