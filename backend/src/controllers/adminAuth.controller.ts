import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { User } from '../models/User';
import { AuthRequest } from '../middlewares/auth.middleware';
import { generateAuthTokens, verifyRefreshToken, revokeRefreshToken } from '../services/token.service';
import { sendPasswordResetEmail, sendResetSuccessEmail } from '../services/email.service';
import { JWT_CONFIG } from '../config/jwt';
import { decryptSecret, findTotpStep, hashRecoveryCode, looksLikeRecoveryCode } from '../services/mfa.service';
import { isSubAdminUsable, revokeAllSessions } from '../services/rbac.service';
import { recordAudit } from '../services/audit.service';
import { validateStaffPassword } from '../services/passwordPolicy';

const STAFF_LOGIN_ROLES = ['admin', 'super_admin', 'sub_admin'] as const;

// Key used only for the short-lived "password OK, now the second factor" token. Derived, so it needs no new env var.
const MFA_LOGIN_SECRET = crypto.createHmac('sha256', JWT_CONFIG.ACCESS_SECRET).update('admin-mfa-login-v1').digest('hex');
const MFA_LOGIN_TTL = '5m';
const MAX_FAILED_ATTEMPTS = 5;
const LOCK_MS = 15 * 60 * 1000;

const cookieOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: (process.env.NODE_ENV === 'production' ? 'none' : 'lax') as 'none' | 'lax',
  path: '/',
});

const setAdminRefreshCookie = (res: Response, token: string) => {
  res.cookie('adminRefreshToken', token, { ...cookieOptions(), maxAge: 7 * 24 * 60 * 60 * 1000 });
};

const isString = (v: unknown): v is string => typeof v === 'string';

export const adminLogin = async (req: Request, res: Response): Promise<any> => {
  try {
    const { email, password } = req.body || {};
    // Reject non-string input (e.g. {"$ne": ""}) before it can reach a database query.
    if (!isString(email) || !isString(password) || !email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }
    const cleanEmail = email.toLowerCase().trim();

    const user = await User.findOne({ email: cleanEmail, role: { $in: STAFF_LOGIN_ROLES } }).select('+password');

    if (!user) {
      await recordAudit({ action: 'auth.login_failed', module: 'auth', outcome: 'failure', metadata: { reason: 'unknown_account', email: cleanEmail }, req });
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    if (user.isLocked) {
      await recordAudit({ actorId: user._id as any, action: 'auth.login_failed', module: 'auth', outcome: 'failure', metadata: { reason: 'locked' }, req });
      return res.status(403).json({ message: 'Account locked. Try again later.' });
    }

    const isMatch = await bcrypt.compare(password, user.password || '');
    if (!isMatch) {
      user.failedLoginAttempts += 1;
      if (user.failedLoginAttempts >= MAX_FAILED_ATTEMPTS) {
        user.lockUntil = new Date(Date.now() + LOCK_MS);
      }
      await user.save();
      await recordAudit({ actorId: user._id as any, action: 'auth.login_failed', module: 'auth', outcome: 'failure', metadata: { reason: 'bad_password' }, req });
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // ── Sub-admins: password is only the first factor ─────────────────────────
    if (user.role === 'sub_admin') {
      if (!isSubAdminUsable(user as any)) {
        await recordAudit({ actorId: user._id as any, action: 'auth.login_failed', module: 'auth', outcome: 'denied', metadata: { reason: 'account_not_active', status: user.accountStatus }, req });
        return res.status(403).json({
          message: 'Your account is not active. Please contact your administrator.',
          code: 'ACCOUNT_NOT_ACTIVE',
        });
      }
      if (!user.mfa?.enabled) {
        await recordAudit({ actorId: user._id as any, action: 'auth.login_failed', module: 'auth', outcome: 'denied', metadata: { reason: 'mfa_not_enrolled' }, req });
        return res.status(403).json({
          message: 'Two-step verification is not set up for this account. Ask your administrator to send a new invitation.',
          code: 'MFA_NOT_ENROLLED',
        });
      }

      user.failedLoginAttempts = 0;
      user.lockUntil = undefined;
      await user.save();

      const mfaToken = jwt.sign({ purpose: 'admin-mfa', userId: String(user._id) }, MFA_LOGIN_SECRET, { expiresIn: MFA_LOGIN_TTL });
      return res.status(200).json({
        message: 'Enter the 6-digit code from your authenticator app.',
        mfaRequired: true,
        mfaToken,
      });
    }

    // ── admin / super_admin: unchanged behaviour ──────────────────────────────
    user.failedLoginAttempts = 0;
    user.lockUntil = undefined;
    user.lastLogin = new Date();
    user.lastLoginIp = req.ip || '';
    user.lastLoginDevice = req.headers['user-agent'] || '';
    await user.save();

    const { accessToken, refreshToken } = await generateAuthTokens(user._id as any, req.ip, req.headers['user-agent']);
    setAdminRefreshCookie(res, refreshToken);
    await recordAudit({ actorId: user._id as any, action: 'auth.login_success', module: 'auth', metadata: { role: user.role }, req });
    return res.status(200).json({ message: 'Admin login successful', accessToken, refreshToken });
  } catch (error) {
    console.error('[ADMIN LOGIN] failed:', (error as any)?.message || error);
    return res.status(500).json({ message: 'Login failed' });
  }
};

const mfaVerifySchema = z.object({
  mfaToken: z.string().min(20).max(2000),
  code: z.string().trim().min(6).max(14),
}).strict();

/** Second step of a sub-admin login: verifies the authenticator code (or a recovery code) and opens the session. */
export const adminMfaVerify = async (req: Request, res: Response): Promise<any> => {
  try {
    const parsed = mfaVerifySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: 'Verification code is required.' });
    const { mfaToken, code } = parsed.data;

    let userId: string;
    try {
      const decoded = jwt.verify(mfaToken, MFA_LOGIN_SECRET) as any;
      if (decoded.purpose !== 'admin-mfa' || !decoded.userId) throw new Error('wrong purpose');
      userId = String(decoded.userId);
    } catch {
      return res.status(401).json({ message: 'Verification session expired. Please sign in again.', code: 'MFA_SESSION_EXPIRED' });
    }

    const user = await User.findById(userId).select('+mfa.secretEnc +mfa.recoveryCodeHashes +mfa.lastUsedStep');
    if (!user || user.role !== 'sub_admin' || !isSubAdminUsable(user as any) || !user.mfa?.enabled || !user.mfa.secretEnc) {
      return res.status(401).json({ message: 'Verification session expired. Please sign in again.', code: 'MFA_SESSION_EXPIRED' });
    }
    if (user.isLocked) {
      return res.status(403).json({ message: 'Account locked. Try again later.' });
    }

    const isTotp = /^\d{6}$/.test(code);
    let method: 'totp' | 'recovery' | null = null;

    if (isTotp) {
      const step = findTotpStep(decryptSecret(user.mfa.secretEnc), code);
      if (step !== null) {
        // Single use: only accept a step newer than the last one that was accepted.
        const claimed = await User.findOneAndUpdate(
          { _id: user._id, $or: [{ 'mfa.lastUsedStep': { $exists: false } }, { 'mfa.lastUsedStep': { $lt: step } }] },
          { $set: { 'mfa.lastUsedStep': step } },
        );
        if (claimed) method = 'totp';
      }
    } else if (looksLikeRecoveryCode(code)) {
      const hash = hashRecoveryCode(code);
      const claimed = await User.findOneAndUpdate(
        { _id: user._id, 'mfa.recoveryCodeHashes': hash },
        { $pull: { 'mfa.recoveryCodeHashes': hash } },
      );
      if (claimed) method = 'recovery';
    }

    if (!method) {
      const updated = await User.findOneAndUpdate({ _id: user._id }, { $inc: { failedLoginAttempts: 1 } }, { new: true });
      if (updated && updated.failedLoginAttempts >= MAX_FAILED_ATTEMPTS) {
        await User.updateOne({ _id: user._id }, { $set: { lockUntil: new Date(Date.now() + LOCK_MS) } });
      }
      await recordAudit({ actorId: user._id as any, action: 'auth.mfa_failed', module: 'auth', outcome: 'failure', req });
      return res.status(401).json({ message: 'Invalid verification code.', code: 'MFA_INVALID' });
    }

    await User.updateOne(
      { _id: user._id },
      {
        $set: { failedLoginAttempts: 0, lastLogin: new Date(), lastLoginIp: req.ip || '', lastLoginDevice: req.headers['user-agent'] || '' },
        $unset: { lockUntil: '' },
      },
    );

    const { accessToken, refreshToken } = await generateAuthTokens(user._id as any, req.ip, req.headers['user-agent'], undefined, { mfaVerified: true });
    setAdminRefreshCookie(res, refreshToken);

    await recordAudit({ actorId: user._id as any, action: 'auth.login_success', module: 'auth', metadata: { role: 'sub_admin', mfaMethod: method }, req });
    let recoveryCodesRemaining: number | undefined;
    if (method === 'recovery') {
      recoveryCodesRemaining = Math.max(0, (user.mfa.recoveryCodeHashes?.length || 1) - 1);
      await recordAudit({ actorId: user._id as any, action: 'auth.mfa_recovery_used', module: 'auth', metadata: { remaining: recoveryCodesRemaining }, req });
    }

    return res.status(200).json({ message: 'Admin login successful', accessToken, refreshToken, recoveryCodesRemaining });
  } catch (error) {
    console.error('[ADMIN MFA] failed:', (error as any)?.message || error);
    return res.status(500).json({ message: 'Verification failed' });
  }
};

export const adminRefreshTokens = async (req: Request, res: Response): Promise<any> => {
  try {
    let refreshTokenValue = req.cookies?.adminRefreshToken;
    if (!refreshTokenValue) {
      const authHeader = req.headers.authorization;
      if (authHeader?.startsWith('Bearer ')) {
        refreshTokenValue = authHeader.split(' ')[1];
      }
    }
    if (!refreshTokenValue) return res.status(401).json({ message: 'Refresh token not found' });

    const validTokenDoc = await verifyRefreshToken(refreshTokenValue);
    const owner: any = validTokenDoc.user;

    // The account may have been suspended, revoked, expired or deleted since the session was opened.
    const ownerUsable =
      owner && !owner.isDeleted && owner.isActive !== false &&
      (owner.role !== 'sub_admin' || (isSubAdminUsable(owner) && validTokenDoc.mfaVerified === true));
    if (!ownerUsable) {
      await revokeRefreshToken(refreshTokenValue);
      return res.status(401).json({ message: 'Session is no longer valid. Please sign in again.' });
    }

    await revokeRefreshToken(refreshTokenValue);

    const { accessToken, refreshToken: newRefreshToken } = await generateAuthTokens(
      owner._id, req.ip, req.headers['user-agent'], refreshTokenValue,
    );

    setAdminRefreshCookie(res, newRefreshToken);
    return res.status(200).json({ accessToken, refreshToken: newRefreshToken });
  } catch {
    return res.status(401).json({ message: 'Invalid refresh token' });
  }
};

export const adminLogout = async (req: Request, res: Response): Promise<any> => {
  try {
    const adminRefreshToken = req.cookies?.adminRefreshToken;
    if (adminRefreshToken) await revokeRefreshToken(adminRefreshToken);
    res.clearCookie('adminRefreshToken', cookieOptions());
    return res.status(200).json({ message: 'Logged out successfully' });
  } catch {
    return res.status(500).json({ message: 'Logout failed' });
  }
};

export const getAdminMe = async (req: AuthRequest, res: Response): Promise<any> => {
  return res.status(200).json({ admin: req.user });
};

// Admins/super admins, or ACTIVE sub-admins (a pending/suspended/revoked sub-admin can never recover access this way).
const recoverableStaffFilter = {
  $or: [
    { role: { $in: ['admin', 'super_admin'] as ('admin' | 'super_admin')[] } },
    { role: 'sub_admin' as const, accountStatus: 'active' as const, isDeleted: false, isActive: true },
  ],
};

export const forgotPassword = async (req: Request, res: Response): Promise<any> => {
  try {
    const { email } = req.body || {};
    if (!isString(email) || !email) return res.status(400).json({ message: 'Email is required' });
    const cleanEmail = email.toLowerCase().trim();

    const user = await User.findOne({ email: cleanEmail, ...recoverableStaffFilter });
    if (!user) return res.status(200).json({ message: 'If that email exists, a reset link has been sent.' });

    if (user.passwordResetLockUntil && user.passwordResetLockUntil > new Date()) {
      const remaining = Math.ceil((user.passwordResetLockUntil.getTime() - Date.now()) / 60000);
      return res.status(429).json({ message: `Too many requests. Try again in ${remaining} minutes.` });
    }

    const recentRequests = user.passwordResetAttempts || 0;
    if (recentRequests >= 3) {
      user.passwordResetLockUntil = new Date(Date.now() + 15 * 60 * 1000);
      user.passwordResetAttempts = 0;
      await user.save();
      return res.status(429).json({ message: 'Too many requests. Try again in 15 minutes.' });
    }

    const token = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    user.passwordResetToken = hashedToken;
    user.passwordResetExpires = new Date(Date.now() + 30 * 60 * 1000);
    user.passwordResetAttempts = (recentRequests || 0) + 1;
    await user.save();

    const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';
    const resetLink = `${CLIENT_URL}/forgot-password?token=${token}&admin=1`;

    try {
      await sendPasswordResetEmail(cleanEmail, resetLink, user.fullName);
    } catch (emailErr: any) {
      console.error('Failed to send admin reset email:', emailErr.message);
    }

    await recordAudit({ actorId: user._id as any, action: 'auth.password_reset_requested', module: 'auth', metadata: { role: user.role }, req });
    return res.status(200).json({ message: 'If that email exists, a reset link has been sent.' });
  } catch (err: any) {
    console.error('Admin forgot password error:', err);
    return res.status(500).json({ message: 'Failed to process request' });
  }
};

export const resetPassword = async (req: Request, res: Response): Promise<any> => {
  try {
    const { token, password, confirmPassword } = req.body || {};

    if (!isString(token) || !isString(password) || !token || !password) {
      return res.status(400).json({ message: 'Token and password are required' });
    }
    if (password !== confirmPassword) return res.status(400).json({ message: 'Passwords do not match' });

    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    const user = await User.findOne({
      passwordResetToken: hashedToken,
      passwordResetExpires: { $gt: new Date() },
      ...recoverableStaffFilter,
    }).select('+password');

    if (!user) return res.status(400).json({ message: 'Token is invalid or has expired' });

    if (user.role === 'sub_admin') {
      const problem = validateStaffPassword(password, { email: user.email, fullName: user.fullName });
      if (problem) return res.status(400).json({ message: problem });
    }

    user.password = password;
    user.passwordResetToken = undefined as any;
    user.passwordResetExpires = undefined as any;
    user.passwordResetAttempts = 0;
    user.passwordResetLockUntil = undefined as any;
    user.failedLoginAttempts = 0;
    user.lockUntil = undefined as any;
    await user.save();

    // A password reset signs the account out everywhere (a stolen session must not survive it).
    await revokeAllSessions(user._id as any);
    await recordAudit({ actorId: user._id as any, action: 'auth.password_reset_completed', module: 'auth', metadata: { role: user.role }, req });

    try {
      await sendResetSuccessEmail(user.email!, user.fullName);
    } catch (emailErr) {
      console.error('Failed to send reset success email:', emailErr);
    }

    return res.status(200).json({ message: 'Password reset successfully.' });
  } catch (err: any) {
    return res.status(500).json({ message: 'Password reset failed' });
  }
};
