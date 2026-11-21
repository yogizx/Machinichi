import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import { User } from '../models/User';
import { Business } from '../models/Business';
import { AuthRequest } from '../middlewares/auth.middleware';
import {
  generateAuthTokens, verifyRefreshToken, revokeRefreshToken, revokeAllUserRefreshTokens,
} from '../services/token.service';

const setVendorRefreshCookie = (res: Response, token: string) => {
  res.cookie('vendorRefreshToken', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    path: '/',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
};

// Same rule as the rest of the site: 8+ chars with upper, lower, digit and a special character.
const STRONG_PASSWORD = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;

const publicUser = (user: any, business?: any) => ({
  id: user._id,
  fullName: user.fullName,
  email: user.email,
  vendorCode: user.vendorCode,
  role: user.role,
  mustChangePassword: !!user.mustChangePassword,
  store: business ? { id: business._id, name: business.name } : undefined,
});

// Sign in with the Vendor User ID from the approval e-mail (or the e-mail address) + password.
export const vendorLogin = async (req: Request, res: Response): Promise<any> => {
  try {
    const rawId = String(req.body?.userId || '').trim();
    const password = String(req.body?.password || '');
    if (!rawId || !password) {
      return res.status(400).json({ message: 'User ID and password are required' });
    }

    // Literal filters (not a shared variable) so TypeScript keeps role as the 'vendor' literal type.
    const user = await (rawId.includes('@')
      ? User.findOne({ email: rawId.toLowerCase(), role: 'vendor' })
      : User.findOne({ vendorCode: rawId.toUpperCase(), role: 'vendor' })
    ).select('+password');

    if (!user || user.isDeleted || !user.isActive || user.isBlocked) {
      // spend the same time as a real check so timing does not reveal whether the id exists
      await bcrypt.compare(password, '$2b$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidi');
      return res.status(401).json({ message: 'Invalid credentials' });
    }
    if (user.isLocked) {
      return res.status(403).json({ message: 'Account locked. Try again later.' });
    }

    const isMatch = await bcrypt.compare(password, user.password || '');
    if (!isMatch) {
      user.failedLoginAttempts += 1;
      if (user.failedLoginAttempts >= 5) user.lockUntil = new Date(Date.now() + 15 * 60 * 1000);
      await user.save();
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const business = user.businessId ? await Business.findById(user.businessId).select('name status') : null;
    if (!business || business.status !== 'approved') {
      return res.status(403).json({ message: 'Your vendor account is not active. Please contact Machinichi support.' });
    }

    user.failedLoginAttempts = 0;
    user.lockUntil = undefined;
    user.lastLogin = new Date();
    user.lastLoginIp = req.ip || '';
    user.lastLoginDevice = req.headers['user-agent'] || '';
    await user.save();

    const { accessToken, refreshToken } = await generateAuthTokens(user._id as any, req.ip, req.headers['user-agent']);
    setVendorRefreshCookie(res, refreshToken);
    return res.status(200).json({
      message: 'Vendor login successful',
      accessToken,
      refreshToken,
      mustChangePassword: !!user.mustChangePassword,
      user: publicUser(user, business),
    });
  } catch (error: any) {
    return res.status(500).json({ message: 'Login failed', error: error?.message });
  }
};

export const vendorRefreshTokens = async (req: Request, res: Response): Promise<any> => {
  try {
    let refreshTokenValue = req.cookies?.vendorRefreshToken;
    if (!refreshTokenValue) {
      const authHeader = req.headers.authorization;
      if (authHeader?.startsWith('Bearer ')) refreshTokenValue = authHeader.split(' ')[1];
    }
    if (!refreshTokenValue) return res.status(401).json({ message: 'Refresh token not found' });

    const validTokenDoc = await verifyRefreshToken(refreshTokenValue);
    if ((validTokenDoc.user as any)?.role !== 'vendor') {
      return res.status(401).json({ message: 'Invalid refresh token' });
    }
    await revokeRefreshToken(refreshTokenValue);

    const { accessToken, refreshToken: newRefreshToken } = await generateAuthTokens(
      (validTokenDoc.user as any)._id, req.ip, req.headers['user-agent'], refreshTokenValue,
    );
    setVendorRefreshCookie(res, newRefreshToken);
    return res.status(200).json({ accessToken, refreshToken: newRefreshToken });
  } catch {
    return res.status(401).json({ message: 'Invalid refresh token' });
  }
};

export const vendorLogout = async (req: Request, res: Response): Promise<any> => {
  try {
    const token = req.cookies?.vendorRefreshToken;
    if (token) await revokeRefreshToken(token);
    res.clearCookie('vendorRefreshToken');
    return res.status(200).json({ message: 'Logged out successfully' });
  } catch {
    return res.status(500).json({ message: 'Logout failed' });
  }
};

// Current vendor (also tells the app whether the temporary password still has to be replaced).
export const getVendorMe = async (req: AuthRequest, res: Response): Promise<any> => {
  const user = await User.findById(req.user?.userId);
  if (!user || user.role !== 'vendor') return res.status(403).json({ message: 'Vendor access required' });
  const business = user.businessId ? await Business.findById(user.businessId).select('name status vendorSince') : null;
  return res.status(200).json({ user: publicUser(user, business) });
};

export const vendorChangePassword = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const { currentPassword, newPassword } = req.body || {};
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: 'Current and new password are required' });
    }
    if (!STRONG_PASSWORD.test(newPassword)) {
      return res.status(400).json({ message: 'Password must be at least 8 characters with upper & lower case letters, a number and a special character.' });
    }
    if (newPassword === currentPassword) {
      return res.status(400).json({ message: 'New password must be different from the current one.' });
    }

    const user = await User.findById(req.user?.userId).select('+password');
    if (!user || user.role !== 'vendor') return res.status(403).json({ message: 'Vendor access required' });

    if (!(await bcrypt.compare(currentPassword, user.password || ''))) {
      return res.status(401).json({ message: 'Current password is incorrect' });
    }

    user.password = newPassword;
    user.mustChangePassword = false;
    user.failedLoginAttempts = 0;
    await user.save();

    // sign out every other session, then continue this one with fresh tokens
    await revokeAllUserRefreshTokens(user._id as any);
    const { accessToken, refreshToken } = await generateAuthTokens(user._id as any, req.ip, req.headers['user-agent']);
    setVendorRefreshCookie(res, refreshToken);
    return res.status(200).json({ message: 'Password updated', accessToken, refreshToken });
  } catch (error: any) {
    return res.status(500).json({ message: 'Could not change password', error: error?.message });
  }
};
