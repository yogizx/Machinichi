import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { buildApp, collectRoutes, routers } from '../helpers/app';
import {
  AdminAuditLog, User, bearer, connectTestDb, createCustomer, createFullAdmin, createRole,
  createSubAdmin, disconnectTestDb, fakeId, roleByName, tokenFor,
} from '../helpers/fixtures';
import { RefreshToken } from '../../src/models/RefreshToken';
import { generateAuthTokens } from '../../src/services/token.service';
import { enforceGuardedRoutes, requirePermission, requireAnyPermission } from '../../src/middlewares/permission.middleware';
import { Router } from 'express';

const app = buildApp();
const OID = fakeId();

let owner: Awaited<ReturnType<typeof createFullAdmin>>;
let rahul: Awaited<ReturnType<typeof createSubAdmin>>;

beforeAll(async () => {
  await connectTestDb();
  owner = await createFullAdmin('super_admin');
  // The acceptance scenario from the brief: Rahul, a Product Manager.
  rahul = await createSubAdmin({
    permissions: ['product.view', 'product.create', 'product.edit', 'product.delete', 'product.inventory.view'],
    roleName: 'Product Manager (Rahul)',
  });
});
afterAll(disconnectTestDb);

describe('Authentication', () => {
  it('rejects a request with no token (401)', async () => {
    const res = await request(app).get('/api/admin/products');
    expect(res.status).toBe(401);
    expect(res.body.ok).toBeUndefined();
  });

  it('rejects garbage and wrongly signed tokens', async () => {
    expect((await request(app).get('/api/admin/products').set(bearer('not-a-token'))).status).toBe(401);
    const forged = jwt.sign({ userId: String(owner.user._id), role: 'super_admin' }, 'attacker-secret');
    expect((await request(app).get('/api/admin/products').set(bearer(forged))).status).toBe(401);
  });

  it('rejects an expired token', async () => {
    const expired = jwt.sign({ userId: String(rahul.user._id), mfa: true }, process.env.JWT_ACCESS_SECRET!, { expiresIn: -10 });
    const res = await request(app).get('/api/admin/products').set(bearer(expired));
    expect(res.status).toBe(401);
  });

  it('ignores any role / permission claim inside the token: identity comes from the database', async () => {
    const customer = await createCustomer('customer');
    const inflated = jwt.sign(
      { userId: String(customer.user._id), role: 'super_admin', isAdmin: true, permissions: ['product.view'], mfa: true },
      process.env.JWT_ACCESS_SECRET!,
      { expiresIn: '5m' },
    );
    const res = await request(app).get('/api/admin/products').set(bearer(inflated));
    expect(res.status).toBe(403);
    expect(res.body.ok).toBeUndefined();
  });

  it('keeps customers and vendors out of every admin API', async () => {
    for (const role of ['customer', 'vendor'] as const) {
      const u = await createCustomer(role);
      for (const path of ['/api/admin/products', '/api/orders/admin/all', '/api/admin/staff/sub-admins', '/api/admin/businesses']) {
        const res = await request(app).get(path).set(bearer(u.token));
        expect(res.status, `${role} ${path}`).toBe(403);
        expect(res.body.ok).toBeUndefined();
      }
    }
  });

  it.each([
    ['suspended', { status: 'suspended' as const }],
    ['revoked', { status: 'revoked' as const }],
    ['pending invitation', { status: 'pending_invitation' as const }],
    ['expired access', { accessExpiry: new Date(Date.now() - 60_000) }],
  ])('refuses a sub-admin whose account is %s, even with a valid token', async (_name, opts) => {
    const sub = await createSubAdmin({ permissions: ['product.view'], ...(opts as any) });
    const res = await request(app).get('/api/admin/products').set(bearer(sub.token));
    expect(res.status).toBe(401);
    expect(res.body.ok).toBeUndefined();
  });

  it('refuses a sub-admin token that was not issued by the MFA login', async () => {
    const sub = await createSubAdmin({ permissions: ['product.view'] });
    const noMfa = await tokenFor(sub.user._id, false);
    const res = await request(app).get('/api/admin/products').set(bearer(noMfa));
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('MFA_REQUIRED');
  });

  it('refuses tokens issued before a session revocation', async () => {
    const sub = await createSubAdmin({ permissions: ['product.view'] });
    expect((await request(app).get('/api/admin/products').set(bearer(sub.token))).status).toBe(200);
    await User.updateOne({ _id: sub.user._id }, { $set: { tokensValidAfter: new Date(Date.now() + 1000) } });
    const res = await request(app).get('/api/admin/products').set(bearer(sub.token));
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('SESSION_REVOKED');
  });
});

describe('Acceptance scenario - Rahul, Product Manager', () => {
  const allowed: Array<[string, string, string]> = [
    ['GET', '/api/admin/products', 'getAdminProducts'],
    ['GET', `/api/admin/products/${OID}`, 'getAdminProductById'],
    ['POST', '/api/admin/products', 'createProduct'],
    ['PUT', `/api/admin/products/${OID}`, 'updateProduct'],
    ['DELETE', `/api/admin/products/${OID}`, 'deleteProduct'],
    ['GET', '/api/admin/inventory', 'getInventoryOverview'],
    ['GET', `/api/admin/products/${OID}/inventory-logs`, 'getInventoryLogs'],
  ];
  it.each(allowed)('may %s %s', async (method, path, handler) => {
    const res = await (request(app) as any)[method.toLowerCase()](path).set(bearer(rahul.token)).send({});
    expect(res.status).toBe(200);
    expect(res.body.handler).toBe(handler);
  });

  const denied: Array<[string, string]> = [
    ['PATCH', `/api/admin/products/${OID}/inventory`],
    ['POST', '/api/admin/products/bulk-stock'],
    ['POST', `/api/admin/products/${OID}/list`],
    ['POST', `/api/admin/products/${OID}/unlist`],
    ['GET', '/api/admin/suppliers'],
    ['GET', '/api/admin/customers'],
    ['POST', '/api/admin/customers'],
    ['GET', '/api/admin/dashboard'],
    ['GET', '/api/admin/revenue'],
    ['GET', '/api/admin/analytics-page'],
    ['POST', '/api/admin/analytics-page/settings'],
    ['GET', '/api/admin/regional/overview'],
    ['GET', '/api/admin/tasks'],
    ['GET', '/api/orders/admin/all'],
    ['GET', '/api/orders/admin/status-counts'],
    ['PUT', `/api/orders/status/${OID}`],
    ['GET', `/api/orders/${OID}/label`],
    ['GET', '/api/returns/admin/all'],
    ['POST', `/api/returns/${OID}/process-refund`],
    ['GET', '/api/admin/businesses'],
    ['POST', `/api/admin/businesses/${OID}/approve`],
    ['DELETE', `/api/admin/businesses/${OID}`],
    ['GET', '/api/admin/staff/sub-admins'],
    ['POST', '/api/admin/staff/sub-admins'],
    ['GET', '/api/admin/staff/roles'],
    ['POST', '/api/admin/staff/roles'],
    ['GET', '/api/admin/staff/permissions'],
    ['GET', '/api/admin/staff/audit-logs'],
  ];
  it.each(denied)('may NOT %s %s (403, controller never runs)', async (method, path) => {
    const res = await (request(app) as any)[method.toLowerCase()](path).set(bearer(rahul.token)).send({});
    expect(res.status).toBe(403);
    expect(res.body.ok).toBeUndefined();
    expect(res.body.handler).toBeUndefined();
  });

  it('cannot gain access by forging client-side permission data', async () => {
    const res = await request(app)
      .get('/api/orders/admin/all?permissions=order.view&role=super_admin&isAdmin=true')
      .set({ ...bearer(rahul.token), 'x-user-role': 'super_admin', 'x-permissions': 'order.view,admin.create', 'x-user-id': String(owner.user._id) })
      .send({ role: 'super_admin', permissions: ['order.view'], userId: String(owner.user._id), isAdmin: true });
    expect(res.status).toBe(403);
    expect(res.body.ok).toBeUndefined();
  });

  it('reports exactly his permissions to the UI, never more', async () => {
    const res = await request(app).get('/api/admin/staff/my-permissions').set(bearer(rahul.token));
    expect(res.status).toBe(200);
    expect(res.body.data.isFullAdmin).toBe(false);
    expect(res.body.data.permissions).toEqual([
      'product.create', 'product.delete', 'product.edit', 'product.inventory.view', 'product.view',
    ]);
  });

  it('records every refused attempt in the audit trail', async () => {
    const attempts = await AdminAuditLog.countDocuments({ actorId: rahul.user._id, action: 'authz.denied', outcome: 'denied' });
    expect(attempts).toBeGreaterThan(10);
  });
});

describe('Permission changes apply to sessions that are already open', () => {
  it('removing product.edit from the role blocks the very next edit with the same token', async () => {
    const sub = await createSubAdmin({ permissions: ['product.view', 'product.edit'] });
    const edit = () => request(app).put(`/api/admin/products/${OID}`).set(bearer(sub.token)).send({});
    expect((await edit()).status).toBe(200);

    const before = (await request(app).get('/api/admin/staff/my-permissions').set(bearer(sub.token))).body.data.permissionVersion;
    const res = await request(app)
      .put(`/api/admin/staff/roles/${sub.role._id}/permissions`)
      .set(bearer(owner.token)).send({ permissions: ['product.view'] });
    expect(res.status).toBe(200);

    expect((await edit()).status).toBe(403);
    const after = await request(app).get('/api/admin/staff/my-permissions').set(bearer(sub.token));
    expect(after.body.data.permissions).toEqual(['product.view']);
    expect(after.body.data.permissionVersion).toBeGreaterThan(before);
  });

  it('a per-user DENY override removes a permission the role grants', async () => {
    const sub = await createSubAdmin({ permissions: ['product.view'] });
    expect((await request(app).get('/api/admin/products').set(bearer(sub.token))).status).toBe(200);
    const res = await request(app)
      .put(`/api/admin/staff/sub-admins/${sub.user._id}/permissions`)
      .set(bearer(owner.token)).send({ overrides: [{ permissionKey: 'product.view', effect: 'deny' }] });
    expect(res.status).toBe(200);
    expect((await request(app).get('/api/admin/products').set(bearer(sub.token))).status).toBe(403);
  });

  it('reassigning the role swaps the permissions immediately and clears stale overrides', async () => {
    const sub = await createSubAdmin({ permissions: ['product.view'] });
    const other = await createRole(['vendor.view']);
    await request(app).put(`/api/admin/staff/sub-admins/${sub.user._id}/permissions`)
      .set(bearer(owner.token)).send({ overrides: [{ permissionKey: 'marketing.coupon.view', effect: 'allow' }] });
    const res = await request(app).put(`/api/admin/staff/sub-admins/${sub.user._id}`)
      .set(bearer(owner.token)).send({ roleId: String(other._id) });
    expect(res.status).toBe(200);
    expect((await request(app).get('/api/admin/products').set(bearer(sub.token))).status).toBe(403);
    expect((await request(app).get('/api/admin/businesses').set(bearer(sub.token))).status).toBe(200);
    const perms = (await request(app).get('/api/admin/staff/my-permissions').set(bearer(sub.token))).body.data.permissions;
    expect(perms).toEqual(['vendor.view']); // the old "allow" override did not survive the role change
  });

  it('suspending an account stops its open session and its refresh token at once', async () => {
    const sub = await createSubAdmin({ permissions: ['product.view'] });
    const { refreshToken } = await generateAuthTokens(sub.user._id, '127.0.0.1', 'vitest', undefined, { mfaVerified: true });
    expect((await request(app).get('/api/admin/products').set(bearer(sub.token))).status).toBe(200);

    const res = await request(app).post(`/api/admin/staff/sub-admins/${sub.user._id}/status`).set(bearer(owner.token)).send({ status: 'suspended' });
    expect(res.status).toBe(200);

    expect((await request(app).get('/api/admin/products').set(bearer(sub.token))).status).toBe(401);
    expect(await RefreshToken.countDocuments({ user: sub.user._id, isRevoked: false })).toBe(0);
    const refresh = await request(app).post('/api/admin/auth/refresh').set('Authorization', `Bearer ${refreshToken}`);
    expect(refresh.status).toBe(401);

    // reactivating does not resurrect the old session
    await request(app).post(`/api/admin/staff/sub-admins/${sub.user._id}/status`).set(bearer(owner.token)).send({ status: 'active' });
    expect((await request(app).get('/api/admin/products').set(bearer(sub.token))).status).toBe(401);
  });

  it('"revoke sessions" ends every open session', async () => {
    const sub = await createSubAdmin({ permissions: ['product.view'] });
    const res = await request(app).post(`/api/admin/staff/sub-admins/${sub.user._id}/sessions/revoke`).set(bearer(owner.token));
    expect(res.status).toBe(200);
    expect((await request(app).get('/api/admin/products').set(bearer(sub.token))).status).toBe(401);
  });

  it('survives many concurrent permission changes without errors or a corrupted result', async () => {
    const sub = await createSubAdmin({ permissions: ['product.view'] });
    const sets = [['product.view'], ['product.view', 'product.edit'], ['product.edit'], []];
    const results = await Promise.all(
      Array.from({ length: 16 }, (_, i) =>
        request(app).put(`/api/admin/staff/roles/${sub.role._id}/permissions`).set(bearer(owner.token)).send({ permissions: sets[i % sets.length] })),
    );
    results.forEach((r) => expect(r.status).toBeLessThan(500));
    const final = (await request(app).get('/api/admin/staff/my-permissions').set(bearer(sub.token))).body.data.permissions as string[];
    const valid = sets.map((s) => [...s].sort().join(','));
    expect(valid).toContain([...final].sort().join(','));
  });
});

describe('Shared routes: staff are served as administrators only when permitted', () => {
  it('elevates a sub-admin who holds order.view, and nobody else', async () => {
    const withPerm = await createSubAdmin({ permissions: ['order.view'] });
    const without = await createSubAdmin({ permissions: ['product.view'] });
    const customer = await createCustomer('customer');
    const get = (t: string) => request(app).get(`/api/orders/${OID}`).set(bearer(t));
    expect((await get(withPerm.token)).body.isAdmin).toBe(true);
    expect((await get(without.token)).body.isAdmin).toBe(false);
    expect((await get(customer.token)).body.isAdmin).toBe(false);
    expect((await get(owner.token)).body.isAdmin).toBe(true);
  });

  it('does not let order.cancel holders into order status updates', async () => {
    const sub = await createSubAdmin({ permissions: ['order.cancel'] });
    expect((await request(app).put(`/api/orders/status/${OID}`).set(bearer(sub.token)).send({})).status).toBe(403);
  });
});

describe('Deny by default is built into the route tables', () => {
  const guardNames = (h: any[]) => h.some((fn) => fn && fn.__rbacGuard === true);

  it.each([
    ['admin.routes', () => routers.adminRoutes],
    ['business.routes', () => routers.businessRoutes],
  ])('every route in %s carries an authorization guard', (_name, get) => {
    const routes = collectRoutes(get());
    expect(routes.length).toBeGreaterThan(10);
    const unguarded = routes.filter((r) => !guardNames(r.handlers)).map((r) => `${r.method} ${r.path}`);
    expect(unguarded).toEqual([]);
  });

  it('every route in staff.routes is guarded except the three public invitation endpoints and /my-permissions', () => {
    const routes = collectRoutes(routers.staffRoutes);
    const unguarded = routes.filter((r) => !guardNames(r.handlers)).map((r) => `${r.method} ${r.path}`).sort();
    expect(unguarded).toEqual([
      'GET /my-permissions',
      'POST /invitations/complete',
      'POST /invitations/start',
      'POST /invitations/validate',
    ]);
  });

  it('refuses to register an unguarded route on a protected router', () => {
    const r = enforceGuardedRoutes(Router(), 'test');
    expect(() => r.get('/oops', (_q, s) => s.send('x'))).toThrow(/without an authorization guard/);
    expect(() => r.post('/ok', requirePermission('product.view'), (_q, s) => s.send('x'))).not.toThrow();
  });

  it('refuses a guard that names a permission which does not exist', () => {
    expect(() => requirePermission('product.viewz')).toThrow(/Unknown permission key/);
    expect(() => requireAnyPermission([])).toThrow();
    expect(() => requireAnyPermission(['product.view', 'nope.nope'])).toThrow();
  });

  it('keeps full-administrator-only endpoints closed to sub-admins even with broad permissions', async () => {
    const sub = await createSubAdmin({ permissions: ['product.view', 'product.create', 'product.edit', 'product.delete', 'inventory.view', 'inventory.update'] });
    for (const [method, path] of [['GET', '/api/admin/tasks'], ['DELETE', `/api/admin/businesses/${OID}`]]) {
      const res = await (request(app) as any)[method.toLowerCase()](path).set(bearer(sub.token));
      expect(res.status).toBe(403);
    }
  });

  it('serves a super admin everywhere (existing behaviour is unchanged)', async () => {
    for (const path of ['/api/admin/products', '/api/orders/admin/all', '/api/admin/businesses', '/api/admin/dashboard', '/api/admin/tasks']) {
      const res = await request(app).get(path).set(bearer(owner.token));
      expect(res.status, path).toBe(200);
    }
    const legacy = await createFullAdmin('admin');
    expect((await request(app).get('/api/admin/products').set(bearer(legacy.token))).status).toBe(200);
  });
});

describe('Predefined roles behave as described', () => {
  it('Order Manager can process orders but cannot see payments, vendors or staff', async () => {
    const role = await roleByName('Order Manager');
    const sub = await createSubAdmin({ permissions: [] });
    await User.updateOne({ _id: sub.user._id }, { $set: { roleId: role._id }, $inc: { permissionVersion: 1 } });
    expect((await request(app).get('/api/orders/admin/all').set(bearer(sub.token))).status).toBe(200);
    expect((await request(app).put(`/api/orders/status/${OID}`).set(bearer(sub.token)).send({})).status).toBe(200);
    expect((await request(app).post(`/api/returns/${OID}/process-refund`).set(bearer(sub.token)).send({})).status).toBe(403);
    expect((await request(app).get('/api/admin/businesses').set(bearer(sub.token))).status).toBe(403);
    expect((await request(app).get('/api/admin/staff/sub-admins').set(bearer(sub.token))).status).toBe(403);
  });
});
