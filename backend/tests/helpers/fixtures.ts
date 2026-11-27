import crypto from 'crypto';
import mongoose from 'mongoose';
import { User } from '../../src/models/User';
import { Role } from '../../src/models/Role';
import { Permission } from '../../src/models/Permission';
import { RolePermission } from '../../src/models/RolePermission';
import { UserPermissionOverride } from '../../src/models/UserPermissionOverride';
import { AdminInvitation } from '../../src/models/AdminInvitation';
import { AdminAuditLog } from '../../src/models/AdminAuditLog';
import { generateAuthTokens } from '../../src/services/token.service';
import { generateTotpSecret, encryptSecret, generateRecoveryCodes, totpAtStep, currentStep } from '../../src/services/mfa.service';
import { seedRBAC } from '../../src/scripts/seedRBAC';

let memory: { stop: () => Promise<any> } | undefined;

const LOCAL_HOST = /^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/i;

/**
 * Connects to a THROWAWAY database. Safety rails: the URI must point at this machine (never Atlas / production),
 * and the database name is random, so dropping it at the end cannot touch real data.
 * Set TEST_MONGODB_URI to use your own local replica set; otherwise an in-memory replica set is started.
 */
export async function connectTestDb(): Promise<void> {
  let uri = process.env.TEST_MONGODB_URI;
  if (!uri) {
    const { MongoMemoryReplSet } = await import('mongodb-memory-server');
    const repl = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    memory = repl;
    uri = repl.getUri();
  }
  const match = uri.match(/^mongodb:\/\/(?:[^@/]*@)?([^/?]+)/);
  if (!match || !match[1].split(',').every((h) => LOCAL_HOST.test(h))) {
    throw new Error(`Refusing to run tests against a non-local database: ${uri.replace(/\/\/[^@]*@/, '//***@')}`);
  }
  const dbName = `rbac_test_${crypto.randomBytes(5).toString('hex')}`;
  await mongoose.connect(uri, { dbName });

  // Same constraints the production database has (autoIndex is off in the app).
  await User.collection.createIndex({ email: 1 }, { unique: true, sparse: true, name: 'email_unique' });
  await User.collection.createIndex({ phone: 1 }, { unique: true, sparse: true, name: 'phone_unique' });

  const log = console.log;
  const warn = console.warn;
  console.log = () => {};
  console.warn = () => {};
  try {
    await seedRBAC(); // creates permissions, protected + predefined roles, RBAC indexes
  } finally {
    console.log = log;
    console.warn = warn;
  }
}

export async function disconnectTestDb(): Promise<void> {
  if (mongoose.connection.readyState === 1) {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
  await memory?.stop();
}

export const uniq = (): string => crypto.randomBytes(4).toString('hex');
export const STRONG_PASSWORD = 'Sup3r!Strong#Pass-2026';

export async function setRoleKeys(roleId: any, keys: string[]): Promise<void> {
  await RolePermission.deleteMany({ roleId });
  if (!keys.length) return;
  const perms = await Permission.find({ permissionKey: { $in: keys } }).select('_id permissionKey').lean();
  if (perms.length !== keys.length) throw new Error(`Test fixture: unknown permission(s) in ${keys.join(', ')}`);
  await RolePermission.insertMany(perms.map((p: any) => ({ roleId, permissionId: p._id })));
}

export async function createRole(keys: string[], name?: string) {
  const role = await Role.create({ roleName: name || `Test Role ${uniq()}`, isSystemRole: false, isSuperAdminRole: false });
  await setRoleKeys(role._id, keys);
  return role;
}

export async function roleByName(name: string) {
  const role = await Role.findOne({ roleName: name });
  if (!role) throw new Error(`Test fixture: role ${name} missing - did seedRBAC run?`);
  return role;
}

export async function createFullAdmin(role: 'super_admin' | 'admin' = 'super_admin') {
  const email = `${role}_${uniq()}@example.test`;
  const user = await User.create({
    fullName: `Owner ${uniq()}`, email, password: STRONG_PASSWORD, role,
    isActive: true, isEmailVerified: true, provider: 'local', accountStatus: 'active',
  });
  return { user, email, token: await tokenFor(user._id, false) };
}

export async function createCustomer(role: 'customer' | 'vendor' = 'customer') {
  const user = await User.create({
    fullName: `Customer ${uniq()}`, email: `${role}_${uniq()}@example.test`, password: STRONG_PASSWORD, role,
    isActive: true, isEmailVerified: true, provider: 'local',
  });
  return { user, token: await tokenFor(user._id, false) };
}

export async function tokenFor(userId: any, mfaVerified: boolean): Promise<string> {
  const { accessToken } = await generateAuthTokens(userId, '127.0.0.1', 'vitest', undefined, { mfaVerified });
  return accessToken;
}

export interface SubAdminOptions {
  permissions: string[];
  email?: string;
  status?: 'active' | 'suspended' | 'revoked' | 'pending_invitation';
  accessExpiry?: Date;
  roleName?: string;
}

/** A fully activated sub-admin (as if the invitation flow had completed) with a role of exactly these permissions. */
export async function createSubAdmin(opts: SubAdminOptions) {
  const role = await createRole(opts.permissions, opts.roleName);
  const secret = generateTotpSecret();
  const recovery = generateRecoveryCodes();
  const status = opts.status || 'active';
  const user = await User.create({
    fullName: `Sub Admin ${uniq()}`,
    email: opts.email || `sub_${uniq()}@example.test`,
    password: STRONG_PASSWORD,
    role: 'sub_admin',
    roleId: role._id,
    accountStatus: status,
    isActive: status === 'active',
    isEmailVerified: true,
    provider: 'local',
    accessExpiry: opts.accessExpiry,
    mfa: { enabled: true, secretEnc: encryptSecret(secret), enrolledAt: new Date(), recoveryCodeHashes: recovery.hashes },
  });
  return { user, role, secret, recoveryCodes: recovery.codes, token: await tokenFor(user._id, true) };
}

export const totp = (secret: string, stepOffset = 0): string => totpAtStep(secret, currentStep() + stepOffset);

export const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

export const fakeId = (): string => new mongoose.Types.ObjectId().toString();

export { User, Role, Permission, RolePermission, UserPermissionOverride, AdminInvitation, AdminAuditLog };
