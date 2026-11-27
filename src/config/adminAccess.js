/**
 * Admin access map - the ONE place in the frontend that says which permission each admin screen needs.
 * The sidebar (lock icons) and the route guards both read it, so nothing is hard-coded per page.
 *
 * IMPORTANT: this is a user-experience layer only. Hiding or locking a screen is NOT security.
 * The backend re-checks every permission on every request (see backend/src/middlewares/permission.middleware.ts),
 * so changing anything in the browser (local storage, variables, URLs) cannot grant access to data.
 *
 * Rule shape:
 *   any:  user needs at least ONE of these permissions
 *   open: any signed-in staff member may open it (e.g. their own profile)
 * A path with no rule is DENIED (deny by default).
 */

export const ADMIN_ROUTE_RULES = [
  { path: '/admin/dashboard', label: 'Dashboard', any: ['report.view'] },
  { path: '/admin/profile', label: 'Profile', open: true },
  { path: '/admin/customers', label: 'Customer', any: ['customer.view'] },
  { path: '/admin/categories', label: 'Categories', any: ['content.category.view'] },
  { path: '/admin/inventory', label: 'Inventory', any: ['inventory.view', 'product.inventory.view'] },
  { path: '/admin/product-listing', label: 'Product Listing', any: ['product.view'] },
  { path: '/admin/orders', label: 'Orders', any: ['order.view'] },
  { path: '/admin/businesses', label: 'Businesses', any: ['vendor.view'] },
  { path: '/admin/analytics', label: 'Analytics', any: ['report.analytics'] },
  { path: '/admin/banner-images', label: 'Banner Images', any: ['marketing.banner.view'] },
  { path: '/admin/return-request', label: 'Return Request', any: ['order.return.view'] },
  { path: '/admin/offers-coupons', label: 'Offers & Coupons', any: ['marketing.coupon.view'] },
  { path: '/admin/create-offers', label: 'Create Offers', any: ['marketing.coupon.create'] },

  // Staff & Access Management
  { path: '/admin/sub-admins', label: 'Sub-Admins', any: ['admin.view'] },
  { path: '/admin/sub-admins/create', label: 'Create Sub-Admin', any: ['admin.create'] },
  { path: '/admin/roles', label: 'Roles & Permissions', any: ['admin.role.view'] },
  { path: '/admin/access-control', label: 'Access Control', any: ['admin.view'] },
  { path: '/admin/activity-logs', label: 'Activity Logs', any: ['admin.audit.view'] },
];

/** Children of the "Staff & Access" sidebar group, in display order. */
export const STAFF_NAV_PATHS = [
  '/admin/sub-admins',
  '/admin/roles',
  '/admin/sub-admins/create',
  '/admin/access-control',
  '/admin/activity-logs',
];

export function findRule(path) {
  const clean = String(path || '').replace(/\/+$/, '') || '/';
  return ADMIN_ROUTE_RULES.find((r) => r.path === clean) || null;
}

/** @param hasAny (keys: string[]) => boolean */
export function isAllowed(rule, hasAny) {
  if (!rule) return false; // deny by default
  if (rule.open) return true;
  return hasAny(rule.any || []);
}

/** First screen the user may open - where they land after login or after a refused page. */
export function firstAccessiblePath(hasAny) {
  const order = ADMIN_ROUTE_RULES.filter((r) => !r.open);
  const hit = order.find((r) => isAllowed(r, hasAny));
  return hit ? hit.path : '/admin/profile';
}
