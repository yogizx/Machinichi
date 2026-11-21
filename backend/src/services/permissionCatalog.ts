/**
 * Permission catalog - the ONE place where permissions are defined.
 *
 * - Backend routes reference keys from this catalog (a typo makes the server refuse to start).
 * - The frontend never hard-codes the list: it loads it from GET /api/admin/staff/permissions.
 * - Roles, predefined roles and validation of every grant are derived from it.
 *
 * `enforced: false` means "reserved": the product has no endpoint for that feature yet, so the permission
 * cannot be granted (the API rejects it and the UI shows it disabled). This keeps the matrix honest -
 * an assignable permission always corresponds to something the server really enforces.
 */

export interface PermissionDef {
  key: string;
  module: string;
  action: string;
  description: string;
  enforced: boolean;
}

export interface ModuleDef {
  key: string;
  label: string;
  description: string;
}

export const MODULES: ModuleDef[] = [
  { key: 'product', label: 'Product Management', description: 'Catalogue, publishing and product inventory view' },
  { key: 'order', label: 'Order Management', description: 'Orders, returns and refunds' },
  { key: 'vendor', label: 'Vendor Management', description: 'Vendor applications and verification' },
  { key: 'customer', label: 'Customer Management', description: 'Customers and review moderation' },
  { key: 'inventory', label: 'Inventory Management', description: 'Stock levels and updates' },
  { key: 'payment', label: 'Payment & Finance', description: 'Payment records and refunds' },
  { key: 'finance', label: 'Finance Reports', description: 'Financial reports and settlements' },
  { key: 'delivery', label: 'Delivery Management', description: 'Delivery partners and tracking' },
  { key: 'marketing', label: 'Marketing', description: 'Coupons, offers and banners' },
  { key: 'content', label: 'Content Management', description: 'Homepage content and categories' },
  { key: 'report', label: 'Reports & Analytics', description: 'Dashboards, analytics and exports' },
  { key: 'settings', label: 'System Settings', description: 'Platform configuration' },
  { key: 'admin', label: 'Staff & Access Management', description: 'Sub-admins, roles, permissions and audit logs' },
];

const def = (module: string, action: string, description: string, enforced = true): PermissionDef => ({
  key: `${module}.${action}`,
  module,
  action,
  description,
  enforced,
});

export const PERMISSIONS: PermissionDef[] = [
  // ── Product Management ──
  def('product', 'view', 'View products'),
  def('product', 'create', 'Add products'),
  def('product', 'edit', 'Edit products'),
  def('product', 'delete', 'Delete products'),
  def('product', 'publish', 'Publish / unpublish products'),
  def('product', 'inventory.view', 'View product inventory'),
  def('product', 'inventory.update', 'Update product inventory'),
  def('product', 'approve', 'Approve products', false),
  def('product', 'pricing', 'Manage product pricing separately from editing', false),
  def('product', 'import', 'Import products', false),
  def('product', 'export', 'Export products', false),

  // ── Order Management ──
  def('order', 'view', 'View orders and order details'),
  def('order', 'update', 'Update order status, delays and tracking'),
  def('order', 'cancel', 'Cancel orders'),
  def('order', 'refund', 'Process return refunds'),
  def('order', 'return.view', 'View return requests'),
  def('order', 'return.manage', 'Review, approve, reject and process return requests'),
  def('order', 'export', 'Export orders', false),

  // ── Vendor Management ──
  def('vendor', 'view', 'View vendors and their applications'),
  def('vendor', 'verify', 'View vendor documents and resend vendor credentials'),
  def('vendor', 'approve', 'Approve or reject vendors'),
  def('vendor', 'suspend', 'Suspend vendors', false),
  def('vendor', 'settlement', 'Manage vendor settlements', false),

  // ── Customer Management ──
  def('customer', 'view', 'View customers'),
  def('customer', 'create', 'Create customer accounts'),
  def('customer', 'support', 'Moderate customer reviews / support'),
  def('customer', 'edit', 'Edit customers', false),
  def('customer', 'status', 'Change customer status', false),

  // ── Inventory Management ──
  def('inventory', 'view', 'View stock, suppliers and purchase history'),
  def('inventory', 'update', 'Update stock and suppliers'),
  def('inventory', 'alerts', 'Low stock alerts', false),
  def('inventory', 'reports', 'Inventory reports', false),

  // ── Payment & Finance ──
  def('payment', 'view', 'View payment records'),
  def('payment', 'refund', 'Initiate payment refunds'),
  def('finance', 'view', 'View financial records', false),
  def('finance', 'reports', 'Financial reports', false),
  def('finance', 'settlement', 'Settlements', false),

  // ── Delivery Management ──
  def('delivery', 'view', 'View deliveries', false),
  def('delivery', 'assign', 'Assign delivery partners', false),
  def('delivery', 'track', 'Track deliveries', false),
  def('delivery', 'status', 'Update delivery status', false),

  // ── Marketing ──
  def('marketing', 'coupon.view', 'View coupons and offers'),
  def('marketing', 'coupon.create', 'Create coupons and offers'),
  def('marketing', 'coupon.edit', 'Edit coupons and offers'),
  def('marketing', 'coupon.delete', 'Delete coupons and offers'),
  def('marketing', 'banner.view', 'View banners'),
  def('marketing', 'banner.create', 'Create banners and upload banner images'),
  def('marketing', 'banner.edit', 'Edit and reorder banners'),
  def('marketing', 'banner.delete', 'Delete banners'),
  def('marketing', 'discount', 'Manage discounts', false),
  def('marketing', 'promotion', 'Manage promotions', false),

  // ── Content Management ──
  def('content', 'homepage.view', 'View homepage popup and highlight bar'),
  def('content', 'homepage.edit', 'Edit homepage popup and highlight bar'),
  def('content', 'category.view', 'View categories'),
  def('content', 'category.create', 'Create categories'),
  def('content', 'category.edit', 'Edit categories'),
  def('content', 'category.delete', 'Delete categories'),
  def('content', 'featured', 'Manage featured products', false),
  def('content', 'wellness', 'Manage wellness collections', false),

  // ── Reports & Analytics ──
  def('report', 'view', 'View the dashboard and sales summaries'),
  def('report', 'analytics', 'View analytics pages'),
  def('report', 'export', 'Export analytics reports'),
  def('report', 'settings', 'Change analytics and report settings'),

  // ── System Settings (no settings endpoints exist yet) ──
  def('settings', 'general', 'General settings', false),
  def('settings', 'payment', 'Payment settings', false),
  def('settings', 'shipping', 'Shipping settings', false),
  def('settings', 'email', 'Email settings', false),
  def('settings', 'api', 'API settings', false),
  def('settings', 'security', 'Security settings', false),

  // ── Staff & Access Management ──
  def('admin', 'view', 'View sub-admins'),
  def('admin', 'create', 'Create and invite sub-admins'),
  def('admin', 'edit', 'Edit sub-admins and start password recovery'),
  def('admin', 'suspend', 'Suspend, reactivate and revoke sub-admins'),
  def('admin', 'delete', 'Delete sub-admins'),
  def('admin', 'role.view', 'View roles'),
  def('admin', 'role.create', 'Create roles'),
  def('admin', 'role.edit', 'Edit roles'),
  def('admin', 'role.delete', 'Delete roles'),
  def('admin', 'permission.assign', 'Assign permissions to roles and users'),
  def('admin', 'audit.view', 'View activity / audit logs'),
  def('admin', 'session.revoke', 'View and revoke sub-admin sessions'),
];

export const PERMISSION_KEYS: ReadonlySet<string> = new Set(PERMISSIONS.map((p) => p.key));
export const ASSIGNABLE_KEYS: ReadonlySet<string> = new Set(PERMISSIONS.filter((p) => p.enforced).map((p) => p.key));

/**
 * Staff-management permissions (module "admin") can only be granted by a full administrator
 * (super_admin / admin). A sub-admin can never pass them on, even if they hold them - this stops
 * delegation chains and "admin creating admins" escalation.
 */
export const STAFF_MANAGEMENT_KEYS: ReadonlySet<string> = new Set(
  PERMISSIONS.filter((p) => p.module === 'admin').map((p) => p.key),
);

export const isKnownPermission = (key: string): boolean => PERMISSION_KEYS.has(key);
export const isAssignablePermission = (key: string): boolean => ASSIGNABLE_KEYS.has(key);

export interface PredefinedRole {
  name: string;
  description: string;
  permissions: string[];
}

export const PREDEFINED_ROLES: PredefinedRole[] = [
  {
    name: 'Product Manager',
    description: 'Manage the product catalogue and view product inventory',
    permissions: ['product.view', 'product.create', 'product.edit', 'product.delete', 'product.publish', 'product.inventory.view', 'content.category.view'],
  },
  {
    name: 'Order Manager',
    description: 'Process orders and return requests',
    permissions: ['order.view', 'order.update', 'order.cancel', 'order.return.view', 'order.return.manage', 'customer.view'],
  },
  {
    name: 'Vendor Manager',
    description: 'Review, verify and approve vendors',
    permissions: ['vendor.view', 'vendor.verify', 'vendor.approve'],
  },
  {
    name: 'Customer Support',
    description: 'Assist customers with orders, returns and reviews',
    permissions: ['customer.view', 'customer.support', 'order.view', 'order.return.view'],
  },
  {
    name: 'Inventory Manager',
    description: 'Maintain stock levels and suppliers',
    permissions: ['inventory.view', 'inventory.update', 'product.view', 'product.inventory.view'],
  },
  {
    name: 'Finance Manager',
    description: 'Payments, refunds and sales reporting',
    permissions: ['payment.view', 'payment.refund', 'order.view', 'order.refund', 'report.view'],
  },
  {
    name: 'Marketing Manager',
    description: 'Coupons, offers, banners and homepage promotions',
    permissions: [
      'marketing.coupon.view', 'marketing.coupon.create', 'marketing.coupon.edit', 'marketing.coupon.delete',
      'marketing.banner.view', 'marketing.banner.create', 'marketing.banner.edit', 'marketing.banner.delete',
      'content.homepage.view', 'content.homepage.edit',
    ],
  },
  {
    name: 'Delivery Manager',
    description: 'Follow orders through dispatch and delivery',
    permissions: ['order.view', 'order.update'],
  },
  {
    name: 'Content Manager',
    description: 'Website content, categories and banners',
    permissions: [
      'content.homepage.view', 'content.homepage.edit',
      'content.category.view', 'content.category.create', 'content.category.edit', 'content.category.delete',
      'marketing.banner.view', 'marketing.banner.create', 'marketing.banner.edit',
    ],
  },
];

// ── Self-check at load time: a typo in the catalog should stop the server, not silently weaken security. ──
(() => {
  const seen = new Set<string>();
  for (const p of PERMISSIONS) {
    if (seen.has(p.key)) throw new Error(`[RBAC] Duplicate permission key in catalog: ${p.key}`);
    seen.add(p.key);
    if (!MODULES.some((m) => m.key === p.module)) throw new Error(`[RBAC] Permission ${p.key} references unknown module ${p.module}`);
  }
  for (const role of PREDEFINED_ROLES) {
    for (const key of role.permissions) {
      if (!ASSIGNABLE_KEYS.has(key)) throw new Error(`[RBAC] Predefined role "${role.name}" uses non-assignable permission ${key}`);
    }
  }
})();
