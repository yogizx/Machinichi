import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import {
  submitVendorApplication, getSellerForProduct, sendVendorEmailOtp, verifyVendorEmailOtp,
} from '../controllers/vendorPublic.controller';

const router = Router();

// applications carry up to six uploaded documents, so keep this one tight
const applyLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 6,
  message: { success: false, message: 'Too many applications from this network. Please try again later.' },
});

// e-mail OTPs: per-address limits are enforced in the controller; this caps a single network
const otpSendLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  message: { success: false, message: 'Too many verification requests from this network. Please try again later.' },
});
const otpVerifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: { success: false, message: 'Too many attempts. Please try again in a few minutes.' },
});

router.post('/email-otp/send', otpSendLimiter, sendVendorEmailOtp);
router.post('/email-otp/verify', otpVerifyLimiter, verifyVendorEmailOtp);
router.post('/apply', applyLimiter, submitVendorApplication);
router.get('/seller/:productId', getSellerForProduct);

export default router;
