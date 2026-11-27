import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { buildApp } from '../helpers/app';
import {
  AdminAuditLog, AdminInvitation, Role, User, bearer, connectTestDb, createCustomer, createFullAdmin, createRole, createSubAdmin,
  disconnectTestDb, fakeId, roleByName,
} from '../helpers/fixtures';

const app = buildApp();
const S = '/api/admin/staff';

let owner: Awaited<ReturnType<typeof createFullAdmin>>;
let delegate: Awaited<ReturnType<typeof createSubAdmin>>;

beforeAll(async () => {
  await connectTestDb();
  owner = await createFullAdmin('super_admin');
  // A sub-admin who was explicitly trusted with staff management - the most dangerous kind of sub-admin.
  delegate = await createSubAdmin({
    roleName: 'Delegate (staff manager)',
    permissions: [
      'admin.view', 'admin.create', 'admin.edit', 'admin.suspend', 'admin.delete',
      'admin.role.view', 'admin.role.create', 'admin.role.edit', 'admin.role.delete', 'admin.permission.assign',
      'product.view',
    ],
  });
});
afterAll(disconnectTestDb);

describe('A sub-admin cannot change their own account, role or permissions', () => {
  it('cannot edit, suspend, delete or re-permission themselves', async () => {
    const id = delegate.user._id;
    expect((await request(app).put(`${S}/sub-admins/${id}`).set(bearer(delegate.token)).send({ fullName: 'New Name' })).status).toBe(403);
    expect((await request(app).put(`${S}/sub-admins/${id}`).set(bearer(delegate.token)).send({ roleId: String(delegate.role._id) })).status).toBe(403);
    expect((await request(app).put(`${S}/sub-admins/${id}/permissions`).set(bearer(delegate.token)).send({ overrides: [{ permissionKey: 'product.view', effect: 'allow' }] })).status).toBe(403);
    expect((await request(app).post(`${S}/sub-admins/${id}/status`).set(bearer(delegate.token)).send({ status: 'suspended' })).status).toBe(403);
    expect((await request(app).delete(`${S}/sub-admins/${id}`).set(bearer(delegate.token))).status).toBe(403);
    expect(await AdminAuditLog.countDocuments({ actorId: id, action: 'authz.self_modification_blocked' })).toBeGreaterThanOrEqual(4);
  });

  it('cannot add permissions to the role that is assigned to them', async () => {
    const res = await request(app).put(`${S}/roles/${delegate.role._id}/permissions`).set(bearer(delegate.token))
      .send({ permissions: ['admin.view', 'admin.role.edit', 'admin.permission.assign', 'product.view', 'order.view'] });
    expect(res.status).toBe(403);
    const keys = (await request(app).get(`${S}/my-permissions`).set(bearer(delegate.token))).body.data.permissions as string[];
    expect(keys).not.toContain('order.view');
  });

  it('still works normally for the account itself (no collateral damage)', async () => {
    expect((await request(app).get(`${S}/roles`).set(bearer(delegate.token))).status).toBe(200);
    expect((await request(app).get(`${S}/sub-admins`).set(bearer(delegate.token))).status).toBe(200);
  });
});

describe('Delegation: you can only hand out what you hold', () => {
  it('cannot create a role containing a permission they lack', async () => {
    const res = await request(app).post(`${S}/roles`).set(bearer(delegate.token)).send({ roleName: 'Sneaky', permissions: ['product.view', 'order.view'] });
    expect(res.status).toBe(403);
    expect(res.body.missing).toEqual(['order.view']);
    expect(await Role.countDocuments({ roleName: 'Sneaky' })).toBe(0);
  });

  it('cannot pass on staff-management permissions even though they hold them', async () => {
    const res = await request(app).post(`${S}/roles`).set(bearer(delegate.token)).send({ roleName: 'Mini Admin', permissions: ['admin.view', 'admin.create'] });
    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/Super Admin/);
    expect(await Role.countDocuments({ roleName: 'Mini Admin' })).toBe(0);
  });

  it('can create a role that is a subset of their own permissions, and invite someone into it', async () => {
    const created = await request(app).post(`${S}/roles`).set(bearer(delegate.token)).send({ roleName: 'Catalogue Viewer', permissions: ['product.view'] });
    expect(created.status).toBe(201);
    const invited = await request(app).post(`${S}/sub-admins`).set(bearer(delegate.token))
      .send({ fullName: 'Asha Viewer', email: `asha_${Date.now()}@example.test`, roleId: created.body.data._id });
    expect(invited.status).toBe(201);
    expect(invited.body.data.accountStatus).toBe('pending_invitation');
  });

  it('cannot invite somebody into a more powerful role', async () => {
    const orderManager = await roleByName('Order Manager');
    const email = `greedy_${Date.now()}@example.test`;
    const res = await request(app).post(`${S}/sub-admins`).set(bearer(delegate.token)).send({ fullName: 'Greedy Person', email, roleId: String(orderManager._id) });
    expect(res.status).toBe(403);
    expect(await User.countDocuments({ email })).toBe(0);
  });

  it('cannot reassign somebody into a more powerful role', async () => {
    const weak = await createSubAdmin({ permissions: ['product.view'] });
    const orderManager = await roleByName('Order Manager');
    const res = await request(app).put(`${S}/sub-admins/${weak.user._id}`).set(bearer(delegate.token)).send({ roleId: String(orderManager._id) });
    expect(res.status).toBe(403);
    const fresh = await User.findById(weak.user._id).lean();
    expect(String(fresh!.roleId)).toBe(String(weak.role._id));
  });

  it('cannot grant individual permissions they lack (overrides)', async () => {
    const weak = await createSubAdmin({ permissions: ['product.view'] });
    for (const key of ['order.view', 'admin.create']) {
      const res = await request(app).put(`${S}/sub-admins/${weak.user._id}/permissions`).set(bearer(delegate.token))
        .send({ overrides: [{ permissionKey: key, effect: 'allow' }] });
      expect(res.status, key).toBe(403);
    }
    const perms = (await request(app).get(`${S}/sub-admins/${weak.user._id}`).set(bearer(owner.token))).body.data.permissions;
    expect(perms).toEqual(['product.view']);
  });

  it('cannot manage an account that holds permissions they do not have', async () => {
    const strong = await createSubAdmin({ permissions: ['order.view', 'product.view'] });
    const t = strong.user._id;
    const attempts = [
      request(app).put(`${S}/sub-admins/${t}`).set(bearer(delegate.token)).send({ fullName: 'Hijacked Name' }),
      request(app).post(`${S}/sub-admins/${t}/status`).set(bearer(delegate.token)).send({ status: 'suspended' }),
      request(app).post(`${S}/sub-admins/${t}/password-reset`).set(bearer(delegate.token)),
      request(app).put(`${S}/sub-admins/${t}/permissions`).set(bearer(delegate.token)).send({ overrides: [] }),
      request(app).delete(`${S}/sub-admins/${t}`).set(bearer(delegate.token)),
    ];
    for (const res of await Promise.all(attempts)) expect(res.status).toBe(403);
    const fresh = await User.findById(t).lean();
    expect(fresh!.fullName).not.toBe('Hijacked Name');
    expect(fresh!.accountStatus).toBe('active');
    expect(fresh!.isDeleted).toBe(false);
  });

  it('cannot change or delete a role that contains permissions they lack', async () => {
    const strongRole = await createRole(['order.view', 'product.view']);
    expect((await request(app).put(`${S}/roles/${strongRole._id}/permissions`).set(bearer(delegate.token)).send({ permissions: [] })).status).toBe(403);
    expect((await request(app).put(`${S}/roles/${strongRole._id}`).set(bearer(delegate.token)).send({ description: 'x' })).status).toBe(403);
    expect((await request(app).delete(`${S}/roles/${strongRole._id}`).set(bearer(delegate.token))).status).toBe(403);
  });

  it('records the blocked attempts', async () => {
    const blocked = await AdminAuditLog.countDocuments({ actorId: delegate.user._id, outcome: 'denied', action: { $regex: /^authz\./ } });
    expect(blocked).toBeGreaterThanOrEqual(8);
  });
});

describe('Protected roles', () => {
  it('a sub-admin cannot change a system role', async () => {
    const pm = await roleByName('Product Manager');
    const res = await request(app).put(`${S}/roles/${pm._id}/permissions`).set(bearer(delegate.token)).send({ permissions: ['product.view'] });
    expect(res.status).toBe(403);
  });

  it('even a Super Admin cannot rename, delete or edit the Super Admin role, or hand it to a sub-admin', async () => {
    const superRole = await Role.findOne({ isSuperAdminRole: true });
    expect(superRole).toBeTruthy();
    const id = superRole!._id;
    expect((await request(app).put(`${S}/roles/${id}`).set(bearer(owner.token)).send({ roleName: 'Nobody' })).status).toBe(403);
    expect((await request(app).put(`${S}/roles/${id}/permissions`).set(bearer(owner.token)).send({ permissions: [] })).status).toBe(403);
    expect((await request(app).delete(`${S}/roles/${id}`).set(bearer(owner.token))).status).toBe(403);
    expect((await request(app).post(`${S}/roles/${id}/duplicate`).set(bearer(owner.token)).send({ roleName: 'Copy Of Super' })).status).toBe(403);
    const invite = await request(app).post(`${S}/sub-admins`).set(bearer(owner.token))
      .send({ fullName: 'Wannabe Owner', email: `wannabe_${Date.now()}@example.test`, roleId: String(id) });
    expect(invite.status).toBe(403);
  });

  it('system roles cannot be renamed or deleted, even by a Super Admin', async () => {
    const pm = await roleByName('Product Manager');
    expect((await request(app).put(`${S}/roles/${pm._id}`).set(bearer(owner.token)).send({ roleName: 'Renamed' })).status).toBe(403);
    expect((await request(app).delete(`${S}/roles/${pm._id}`).set(bearer(owner.token))).status).toBe(403);
  });

  it('a role that is still in use cannot be deleted', async () => {
    const sub = await createSubAdmin({ permissions: ['product.view'] });
    const res = await request(app).delete(`${S}/roles/${sub.role._id}`).set(bearer(owner.token));
    expect(res.status).toBe(409);
  });
});

describe('Input validation, mass assignment and reserved permissions', () => {
  const base = () => ({ fullName: 'Valid Person', email: `valid_${Date.now()}_${Math.random().toString(16).slice(2, 6)}@example.test` });

  it.each([
    ['role', { role: 'super_admin' }],
    ['isActive', { isActive: true }],
    ['permissionVersion', { permissionVersion: 99 }],
    ['accountStatus active', { accountStatus: 'active' }],
    ['password', { password: 'Sup3r!Strong#Pass-2026' }],
    ['mfa', { mfa: { enabled: true } }],
    ['tokensValidAfter', { tokensValidAfter: new Date(0) }],
  ])('rejects an invitation that tries to set %s', async (_label, extra) => {
    const role = await roleByName('Product Manager');
    const body = { ...base(), roleId: String(role._id), ...extra };
    const res = await request(app).post(`${S}/sub-admins`).set(bearer(owner.token)).send(body);
    expect(res.status).toBe(400);
    expect(await User.countDocuments({ email: body.email })).toBe(0);
  });

  it.each([
    [{ role: 'super_admin' }], [{ accountStatus: 'active' }], [{ password: 'x' }], [{ isDeleted: false }], [{ email: 'other@example.test' }],
  ])('rejects an update that tries to change %j', async (extra) => {
    const sub = await createSubAdmin({ permissions: ['product.view'] });
    const res = await request(app).put(`${S}/sub-admins/${sub.user._id}`).set(bearer(owner.token)).send(extra);
    expect(res.status).toBe(400);
    const fresh = await User.findById(sub.user._id).lean();
    expect(fresh!.role).toBe('sub_admin');
  });

  it('rejects roles that try to set protection flags', async () => {
    for (const extra of [{ isSystemRole: true }, { isSuperAdminRole: true }, { createdBy: fakeId() }]) {
      const res = await request(app).post(`${S}/roles`).set(bearer(owner.token)).send({ roleName: `Flagged ${Math.random()}`, ...extra });
      expect(res.status).toBe(400);
    }
  });

  it('rejects reserved and unknown permissions, for roles and for overrides', async () => {
    const sub = await createSubAdmin({ permissions: ['product.view'] });
    for (const key of ['settings.general', 'finance.view', 'delivery.assign', 'product.approve', 'bogus.key', '*', 'admin.*']) {
      const role = await request(app).put(`${S}/roles/${sub.role._id}/permissions`).set(bearer(owner.token)).send({ permissions: [key] });
      expect(role.status, `role ${key}`).toBe(400);
      const override = await request(app).put(`${S}/sub-admins/${sub.user._id}/permissions`).set(bearer(owner.token))
        .send({ overrides: [{ permissionKey: key, effect: 'allow' }] });
      expect(override.status, `override ${key}`).toBe(400);
    }
  });

  it('rejects duplicate e-mail addresses (including a customer\'s) and bad role references', async () => {
    const customer = await createCustomer('customer');
    const role = await roleByName('Product Manager');
    const dup = await request(app).post(`${S}/sub-admins`).set(bearer(owner.token)).send({ fullName: 'Copy Cat', email: customer.user.email, roleId: String(role._id) });
    expect(dup.status).toBe(409);
    const missingRole = await request(app).post(`${S}/sub-admins`).set(bearer(owner.token)).send({ ...base(), roleId: fakeId() });
    expect(missingRole.status).toBe(400);
    const badId = await request(app).post(`${S}/sub-admins`).set(bearer(owner.token)).send({ ...base(), roleId: 'not-an-id' });
    expect(badId.status).toBe(400);
  });

  it('rejects an access expiry in the past and malformed contact details', async () => {
    const role = await roleByName('Product Manager');
    const past = await request(app).post(`${S}/sub-admins`).set(bearer(owner.token)).send({ ...base(), roleId: String(role._id), accessExpiry: new Date(Date.now() - 86400000).toISOString() });
    expect(past.status).toBe(400);
    const phone = await request(app).post(`${S}/sub-admins`).set(bearer(owner.token)).send({ ...base(), roleId: String(role._id), mobile: 'call me maybe' });
    expect(phone.status).toBe(400);
    const img = await request(app).post(`${S}/sub-admins`).set(bearer(owner.token)).send({ ...base(), roleId: String(role._id), profileImage: 'javascript:alert(1)' });
    expect(img.status).toBe(400);
  });

  it('enforces the account status machine', async () => {
    const revoked = await createSubAdmin({ permissions: ['product.view'], status: 'revoked' });
    expect((await request(app).post(`${S}/sub-admins/${revoked.user._id}/status`).set(bearer(owner.token)).send({ status: 'active' })).status).toBe(400);
    const pending = await createSubAdmin({ permissions: ['product.view'], status: 'pending_invitation' });
    expect((await request(app).post(`${S}/sub-admins/${pending.user._id}/status`).set(bearer(owner.token)).send({ status: 'suspended' })).status).toBe(400);
    expect((await request(app).post(`${S}/sub-admins/${pending.user._id}/status`).set(bearer(owner.token)).send({ status: 'admin' })).status).toBe(400);
  });
});

describe('Object references and query hardening', () => {
  it('only ever resolves sub-admin accounts (no peeking at customers or owners)', async () => {
    const customer = await createCustomer('customer');
    for (const id of [customer.user._id, owner.user._id]) {
      expect((await request(app).get(`${S}/sub-admins/${id}`).set(bearer(delegate.token))).status).toBe(404);
      expect((await request(app).get(`${S}/sub-admins/${id}/sessions`).set(bearer(delegate.token))).status).toBe(404);
      expect((await request(app).put(`${S}/sub-admins/${id}`).set(bearer(delegate.token)).send({ fullName: 'Taken Over' })).status).toBe(404);
      expect((await request(app).delete(`${S}/sub-admins/${id}`).set(bearer(delegate.token))).status).toBe(404);
    }
    expect((await request(app).get(`${S}/sub-admins/not-an-id`).set(bearer(delegate.token))).status).toBe(400);
    expect((await request(app).get(`${S}/sub-admins/${fakeId()}`).set(bearer(delegate.token))).status).toBe(404);
  });

  it('treats the search box as text, never as a regular expression', async () => {
    const started = Date.now();
    const evil = await request(app).get(`${S}/sub-admins`).query({ search: '(a+)+$' }).set(bearer(owner.token));
    expect(evil.status).toBe(200);
    expect(Date.now() - started).toBeLessThan(3000);
    const wildcard = await request(app).get(`${S}/sub-admins`).query({ search: '.*' }).set(bearer(owner.token));
    expect(wildcard.status).toBe(200);
    expect(wildcard.body.data).toEqual([]);
  });

  it('bounds paging and rejects odd types', async () => {
    for (const q of [{ limit: 100000 }, { page: -1 }, { limit: 0 }, { status: 'god' }, { role: 'x' }]) {
      const res = await request(app).get(`${S}/sub-admins`).query(q as any).set(bearer(owner.token));
      expect(res.status, JSON.stringify(q)).toBe(400);
    }
    const arr = await request(app).get(`${S}/sub-admins?search=a&search=b`).set(bearer(owner.token));
    expect(arr.status).toBe(400);
  });

  it('lists sessions without ever exposing token values', async () => {
    const sub = await createSubAdmin({ permissions: ['product.view'] });
    const res = await request(app).get(`${S}/sub-admins/${sub.user._id}/sessions`).set(bearer(owner.token));
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);
    expect(JSON.stringify(res.body)).not.toMatch(/token/i);
  });

  it('never returns password, MFA secrets or recovery hashes from the staff API', async () => {
    const sub = await createSubAdmin({ permissions: ['product.view'] });
    const detail = await request(app).get(`${S}/sub-admins/${sub.user._id}`).set(bearer(owner.token));
    const list = await request(app).get(`${S}/sub-admins`).set(bearer(owner.token));
    for (const body of [detail.body, list.body]) {
      const text = JSON.stringify(body);
      expect(text).not.toMatch(/secretEnc|pendingSecret|recoveryCodeHashes|"password"|passwordResetToken|lastUsedStep|tokensValidAfter/);
    }
  });
});

describe('Invitations cannot be abused by those without the right permission', () => {
  it('a sub-admin without admin.create cannot invite, resend or read pending invitations', async () => {
    const viewer = await createSubAdmin({ permissions: ['admin.view'] });
    const role = await roleByName('Product Manager');
    expect((await request(app).post(`${S}/sub-admins`).set(bearer(viewer.token)).send({ fullName: 'No Way', email: `noway_${Date.now()}@example.test`, roleId: String(role._id) })).status).toBe(403);
    const pending = await createSubAdmin({ permissions: ['product.view'], status: 'pending_invitation' });
    expect((await request(app).post(`${S}/sub-admins/${pending.user._id}/resend-invitation`).set(bearer(viewer.token))).status).toBe(403);
    expect(await AdminInvitation.countDocuments({ userId: pending.user._id })).toBe(0);
  });
});

describe('The last Super Admin is protected', () => {
  it('cannot be demoted, deactivated or deleted - but can once another Super Admin exists', async () => {
    const lone = async (mutate: (u: any) => void) => {
      const u = await User.findById(owner.user._id);
      mutate(u);
      return u!.save();
    };
    await expect(lone((u) => { u.role = 'admin'; })).rejects.toThrow(/last active Super Admin/);
    await expect(lone((u) => { u.isActive = false; })).rejects.toThrow(/last active Super Admin/);
    await expect(lone((u) => { u.isDeleted = true; })).rejects.toThrow(/last active Super Admin/);
    await expect(lone((u) => { u.accountStatus = 'suspended'; })).rejects.toThrow(/last active Super Admin/);
    expect((await User.findById(owner.user._id).lean())!.role).toBe('super_admin');

    const second = await createFullAdmin('super_admin');
    await lone((u) => { u.role = 'admin'; }); // allowed now: a second Super Admin exists
    const stillLast = await User.findById(second.user._id);
    stillLast!.role = 'admin' as any;
    await expect(stillLast!.save()).rejects.toThrow(/last active Super Admin/);

    await User.updateOne({ _id: owner.user._id }, { $set: { role: 'super_admin' } }); // restore for any later test
  });
});
