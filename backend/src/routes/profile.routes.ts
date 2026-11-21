import { Router } from 'express';
import { authenticateUser } from '../middlewares/auth.middleware';
import {
  getProfile, updateProfile, updatePassword, getPublicStoreInfo,
  getAddresses, getDefaultAddress, createAddress, updateAddress, deleteAddress,
  sendVerificationOTP, verifyOTP, deleteAccount,
} from '../controllers/profile.controller';

const router = Router();

// Public (no login): store brand name shown on the storefront product pages
router.get('/store-info', getPublicStoreInfo);

router.use(authenticateUser);

router.get('/me', getProfile);
router.put('/profile', updateProfile);
router.put('/password', updatePassword);
router.delete('/delete-account', deleteAccount);

router.get('/addresses', getAddresses);
router.get('/addresses/default', getDefaultAddress);
router.post('/addresses', createAddress);
router.put('/addresses/:id', updateAddress);
router.delete('/addresses/:id', deleteAddress);

router.post('/send-verification-otp', sendVerificationOTP);
router.post('/verify-otp', verifyOTP);

export default router;
