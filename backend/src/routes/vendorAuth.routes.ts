import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { authMiddleware } from '../middlewares/auth.middleware';
import {
  vendorLogin, vendorLogout, vendorRefreshTokens, getVendorMe, vendorChangePassword,
} from '../controllers/vendorAuth.controller';

const router = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { message: 'Too many login attempts, please try again after 15 minutes' },
});

router.post('/login', loginLimiter, vendorLogin);
router.post('/logout', vendorLogout);
router.post('/refresh', vendorRefreshTokens);
router.get('/me', authMiddleware, getVendorMe);
router.post('/change-password', authMiddleware, vendorChangePassword);

export default router;
