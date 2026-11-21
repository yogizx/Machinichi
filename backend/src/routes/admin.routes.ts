import { Router, Request, Response, NextFunction } from 'express';
import { Types } from 'mongoose';
import { authMiddleware, adminMiddleware } from '../middlewares/auth.middleware';
import {
  requirePermission,
  requireAnyPermission,
  requireStaffAccount,
  enforceGuardedRoutes,
} from '../middlewares/permission.middleware';
import {
  createProduct, updateProduct, deleteProduct, getAdminProducts, getAdminProductById,
  bulkUpdateStock, getInventoryLogs, getInventoryOverview, updateInventory,
  listProduct, unlistProduct, updateListing,
} from '../controllers/admin/product.controller';
import { generateAIContent } from '../controllers/admin/ai.controller';
import {
  createSupplier, getSuppliers, getSupplierById, updateSupplier, deleteSupplier,
  addSupplierToProduct, removeSupplierFromProduct, addPurchaseRecord, getPurchaseHistory,
} from '../controllers/admin/supplier.controller';
import { getDashboardStats, getRevenueAnalytics, getTopProducts, getOrderStats, getUserAnalytics, getCategoryDistribution, getProductUsers, getAnalyticsPageData, exportAnalyticsReport, getLiveFeedStats, saveReportConfig, getReportConfig, saveAnalyticsSettings, getAnalyticsSettings } from '../controllers/admin/analytics.controller';
import { getTasks, createTask, updateTaskStatus, deleteTask } from '../controllers/admin/task.controller';
import { getAdminCustomers, createAdminCustomer } from '../controllers/admin/customer.controller';
import {
  getStatesList,
  getStateDetail,
  getStateMonthlyTrends,
  getStateGrowth,
  getTopStates,
  getBottomStates,
  getRegionalOverview,
  getStateAOV,
  getStateRepeatRates,
  exportRegionalCSV,
} from '../controllers/regional.controller';

const router = Router();

const objectIdPattern = /^[0-9a-fA-F]{24}$/;

const validateObjectId = (paramName: string) => (req: Request, res: Response, next: NextFunction) => {
  const rawValue = req.params[paramName];
  const value = typeof rawValue === 'string' ? rawValue.trim() : '';
  if (!value || !Types.ObjectId.isValid(value) || !objectIdPattern.test(value)) {
    return res.status(400).json({ success: false, message: `Invalid ${paramName} format. Must be a 24-character hex string.` });
  }
  req.params[paramName] = value;
  next();
};

/**
 * Access model for /api/admin/*
 *  - authMiddleware identifies the caller (and rejects suspended / expired / revoked / non-MFA sub-admins)
 *  - requireStaffAccount keeps customers and vendors out
 *  - EVERY route below carries its own permission guard. enforceGuardedRoutes() makes registering a route
 *    without one a start-up error, so a forgotten guard can never expose an endpoint (deny by default).
 *  - Super Admin / Admin pass every guard (unchanged behaviour). Sub-admins pass only with the exact permission.
 *  - adminMiddleware = "full administrators only" is used for the few endpoints that are not delegable.
 */
router.use(authMiddleware, requireStaffAccount);
enforceGuardedRoutes(router, 'admin.routes');

const inventoryView = requireAnyPermission(['inventory.view', 'product.inventory.view']);
const inventoryUpdate = requireAnyPermission(['inventory.update', 'product.inventory.update']);

// ── Dashboard ──
router.get('/dashboard', requirePermission('report.view'), getDashboardStats);
router.get('/revenue', requirePermission('report.view'), getRevenueAnalytics);
router.get('/top-products', requirePermission('report.view'), getTopProducts);
router.get('/orders', requirePermission('report.view'), getOrderStats);
router.get('/users', requireAnyPermission(['report.view', 'report.analytics']), getUserAnalytics);
router.get('/categories', requirePermission('report.view'), getCategoryDistribution);

// Step 1 — catalog (create/edit product info; never touches publish state)
router.get('/products', requirePermission('product.view'), getAdminProducts);
router.get('/products/:id', requirePermission('product.view'), validateObjectId('id'), getAdminProductById);
router.get('/products/:id/users', requirePermission('product.view'), validateObjectId('id'), getProductUsers);
router.post('/products', requirePermission('product.create'), createProduct);
router.put('/products/:id', requirePermission('product.edit'), validateObjectId('id'), updateProduct);
router.delete('/products/:id', requirePermission('product.delete'), validateObjectId('id'), deleteProduct);

// Step 2 — inventory (separate screen/workflow from listing)
router.get('/inventory', inventoryView, getInventoryOverview);
router.patch('/products/:id/inventory', inventoryUpdate, validateObjectId('id'), updateInventory);
router.post('/products/bulk-stock', inventoryUpdate, bulkUpdateStock);
router.get('/products/:productId/inventory-logs', inventoryView, validateObjectId('productId'), getInventoryLogs);

// Step 3 & 5 — listing / publish ("Add Product to Store")
router.post('/products/:id/list', requirePermission('product.publish'), validateObjectId('id'), listProduct);
router.post('/products/:id/unlist', requirePermission('product.publish'), validateObjectId('id'), unlistProduct);
router.patch('/products/:id/listing', requirePermission('product.publish'), validateObjectId('id'), updateListing);

// Supplier management routes (inventory domain)
router.get('/suppliers', requirePermission('inventory.view'), getSuppliers);
router.get('/suppliers/:id', requirePermission('inventory.view'), validateObjectId('id'), getSupplierById);
router.post('/suppliers', requirePermission('inventory.update'), createSupplier);
router.put('/suppliers/:id', requirePermission('inventory.update'), validateObjectId('id'), updateSupplier);
router.delete('/suppliers/:id', requirePermission('inventory.update'), validateObjectId('id'), deleteSupplier);

// Product ↔ Supplier linking
router.post('/products/:id/suppliers', requirePermission('inventory.update'), validateObjectId('id'), addSupplierToProduct);
router.delete('/products/:id/suppliers/:supplierId', requirePermission('inventory.update'), validateObjectId('id'), validateObjectId('supplierId'), removeSupplierFromProduct);

// Purchase history
router.get('/products/:productId/purchase-history', requirePermission('inventory.view'), validateObjectId('productId'), getPurchaseHistory);
router.post('/products/:id/purchase-history', requirePermission('inventory.update'), validateObjectId('id'), addPurchaseRecord);

// Customers management routes
router.get('/customers', requirePermission('customer.view'), getAdminCustomers);
router.post('/customers', requirePermission('customer.create'), createAdminCustomer);

// AI content generation
router.post('/ai/generate', requireAnyPermission(['product.create', 'product.edit']), generateAIContent);

// Tasks management routes — personal admin to-dos, not delegable: full administrators only
router.get('/tasks', adminMiddleware, getTasks);
router.post('/tasks', adminMiddleware, createTask);
router.put('/tasks/:id', adminMiddleware, validateObjectId('id'), updateTaskStatus);
router.delete('/tasks/:id', adminMiddleware, validateObjectId('id'), deleteTask);

// Analytics dashboard page routes
router.get('/analytics-page', requirePermission('report.analytics'), getAnalyticsPageData);
router.post('/analytics-page/export', requirePermission('report.export'), exportAnalyticsReport);
router.get('/analytics-page/live-feed', requirePermission('report.analytics'), getLiveFeedStats);
router.post('/analytics-page/report-config', requirePermission('report.settings'), saveReportConfig);
router.get('/analytics-page/report-config', requirePermission('report.analytics'), getReportConfig);
router.post('/analytics-page/settings', requirePermission('report.settings'), saveAnalyticsSettings);
router.get('/analytics-page/settings', requirePermission('report.analytics'), getAnalyticsSettings);

// Regional analytics routes — state-wise breakdown driven entirely by MongoDB
router.get('/regional/overview', requirePermission('report.analytics'), getRegionalOverview);
router.get('/regional/states/top', requirePermission('report.analytics'), getTopStates);
router.get('/regional/states/bottom', requirePermission('report.analytics'), getBottomStates);
router.get('/regional/states/aov', requirePermission('report.analytics'), getStateAOV);
router.get('/regional/states/repeat-rates', requirePermission('report.analytics'), getStateRepeatRates);
router.get('/regional/states', requirePermission('report.analytics'), getStatesList);
router.get('/regional/states/:stateName/trends', requirePermission('report.analytics'), getStateMonthlyTrends);
router.get('/regional/states/:stateName/growth', requirePermission('report.analytics'), getStateGrowth);
router.get('/regional/states/:stateName', requirePermission('report.analytics'), getStateDetail);
router.get('/regional/export/csv', requirePermission('report.export'), exportRegionalCSV);

export default router;
