import { vi } from 'vitest';

/**
 * These tests exercise the REAL authorization stack: authMiddleware, the permission engine, the guards, the
 * route tables, the staff controller and the admin-auth controller - against a real MongoDB.
 *
 * What is replaced by stubs: the domain controllers behind the admin routes (products, orders, suppliers ...).
 * They are irrelevant to authorization; a stub that answers { ok: true, handler } is enough to prove whether a
 * request got past the guards. Rate limiters are bypassed (they would throttle the many logins a test makes),
 * and outgoing e-mail is captured instead of sent.
 */
const { stub } = vi.hoisted(() => ({
  stub: (names: string[]) =>
    Object.fromEntries(
      names.map((n) => [
        n,
        (req: any, res: any) =>
          res.json({ ok: true, handler: n, isAdmin: !!req.user?.isAdmin, userId: req.user?.userId }),
      ]),
    ),
}));

vi.mock('express-rate-limit', () => ({
  default: () => (_req: any, _res: any, next: any) => next(),
  ipKeyGenerator: (ip: string) => ip,
}));

vi.mock('../../src/services/email.service', async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    sendStaffInvitationEmail: vi.fn(async () => {}),
    sendPasswordResetEmail: vi.fn(async () => {}),
    sendResetSuccessEmail: vi.fn(async () => {}),
  };
});

vi.mock('../../src/middlewares/upload.middleware', () => ({
  default: { single: () => (_q: any, _s: any, n: any) => n(), array: () => (_q: any, _s: any, n: any) => n() },
}));

vi.mock('../../src/controllers/admin/product.controller', () =>
  stub(['createProduct', 'updateProduct', 'deleteProduct', 'getAdminProducts', 'getAdminProductById', 'bulkUpdateStock', 'getInventoryLogs', 'getInventoryOverview', 'updateInventory', 'listProduct', 'unlistProduct', 'updateListing']));
vi.mock('../../src/controllers/admin/ai.controller', () => stub(['generateAIContent']));
vi.mock('../../src/controllers/admin/supplier.controller', () =>
  stub(['createSupplier', 'getSuppliers', 'getSupplierById', 'updateSupplier', 'deleteSupplier', 'addSupplierToProduct', 'removeSupplierFromProduct', 'addPurchaseRecord', 'getPurchaseHistory']));
vi.mock('../../src/controllers/admin/analytics.controller', () =>
  stub(['getDashboardStats', 'getRevenueAnalytics', 'getTopProducts', 'getOrderStats', 'getUserAnalytics', 'getCategoryDistribution', 'getProductUsers', 'getAnalyticsPageData', 'exportAnalyticsReport', 'getLiveFeedStats', 'saveReportConfig', 'getReportConfig', 'saveAnalyticsSettings', 'getAnalyticsSettings']));
vi.mock('../../src/controllers/admin/task.controller', () => stub(['getTasks', 'createTask', 'updateTaskStatus', 'deleteTask']));
vi.mock('../../src/controllers/admin/customer.controller', () => stub(['getAdminCustomers', 'createAdminCustomer']));
vi.mock('../../src/controllers/regional.controller', () =>
  stub(['getStatesList', 'getStateDetail', 'getStateMonthlyTrends', 'getStateGrowth', 'getTopStates', 'getBottomStates', 'getRegionalOverview', 'getStateAOV', 'getStateRepeatRates', 'exportRegionalCSV']));
vi.mock('../../src/controllers/order.controller', () =>
  stub(['getMyOrders', 'getOrderById', 'cancelOrder', 'updateOrderStatus', 'delayOrder', 'getAllOrders', 'getOrderStatusCounts', 'addTracking', 'getMyOrderStats']));
vi.mock('../../src/controllers/orderPdf.controller', () => stub(['downloadInvoice', 'downloadShippingLabel']));
vi.mock('../../src/controllers/business.controller', () =>
  stub(['getBusinesses', 'getBusinessById', 'approveBusiness', 'rejectBusiness', 'deleteBusiness', 'resendVendorCredentials', 'getBusinessDocument']));
vi.mock('../../src/controllers/return.controller', () =>
  stub(['createReturnRequest', 'checkEligibility', 'getEligibleOrders', 'getMyReturnRequests', 'getAllReturnRequests', 'getReturnStats', 'getReturnById', 'updateReturnStatus', 'cancelReturnRequest', 'moveToReview', 'approveReturn', 'rejectReturn', 'schedulePickup', 'markPickupFailed', 'confirmReceipt', 'inspectReturn', 'processRefund', 'markRefundFailed', 'completeReturn', 'refundReturnRequest', 'addReturnNote']));
