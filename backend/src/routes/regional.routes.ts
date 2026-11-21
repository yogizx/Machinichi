import { Router } from 'express';
import { authMiddleware } from '../middlewares/auth.middleware';
import { requirePermission, requireStaffAccount, enforceGuardedRoutes } from '../middlewares/permission.middleware';
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

router.use(authMiddleware, requireStaffAccount);
enforceGuardedRoutes(router, 'regional.routes');

router.get('/overview', requirePermission('report.analytics'), getRegionalOverview);
router.get('/states', requirePermission('report.analytics'), getStatesList);
router.get('/states/top', requirePermission('report.analytics'), getTopStates);
router.get('/states/bottom', requirePermission('report.analytics'), getBottomStates);
router.get('/states/aov', requirePermission('report.analytics'), getStateAOV);
router.get('/states/repeat-rates', requirePermission('report.analytics'), getStateRepeatRates);
router.get('/states/:stateName', requirePermission('report.analytics'), getStateDetail);
router.get('/states/:stateName/trends', requirePermission('report.analytics'), getStateMonthlyTrends);
router.get('/states/:stateName/growth', requirePermission('report.analytics'), getStateGrowth);
router.get('/export/csv', requirePermission('report.export'), exportRegionalCSV);

export default router;
