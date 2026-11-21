import { Router } from 'express';
import { adminLogin, adminLogout, adminRefreshTokens, forgotPassword, resetPassword, getAdminMe, adminMfaVerify } from '../controllers/adminAuth.controller';
import { authenticateAdmin } from '../middlewares/auth.middleware';
import { validate } from '../middlewares/validate.middleware';
import { adminLoginSchema, forgotPasswordSchema, resetPasswordSchema } from '../validators/auth.validator';
import rateLimit from 'express-rate-limit';

const router = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { message: 'Too many login attempts, please try again after 15 minutes' },
});

const strictLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { message: 'Too many requests, please try again later.' },
});

// Second step of a sub-admin login (TOTP / recovery code). Limited per IP; the account itself is also
// locked after repeated wrong codes (see adminMfaVerify).
const mfaLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { message: 'Too many verification attempts, please try again later.' },
});

router.post('/login', loginLimiter, validate(adminLoginSchema), adminLogin);
router.post('/mfa/verify', mfaLimiter, adminMfaVerify);
router.post('/logout', adminLogout);
router.post('/refresh', adminRefreshTokens);
router.post('/forgot-password', strictLimiter, validate(forgotPasswordSchema), forgotPassword);
router.post('/reset-password', strictLimiter, validate(resetPasswordSchema), resetPassword);
router.get('/me', authenticateAdmin, getAdminMe);

export default router;
