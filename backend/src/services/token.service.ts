import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { JWT_CONFIG } from '../config/jwt';
import { RefreshToken } from '../models/RefreshToken';
import { Types } from 'mongoose';

// SECURITY: refresh tokens are long-lived credentials, so the database only ever stores a SHA-256 hash of them.
// If the database leaks, the stored values cannot be used to sign in.
const hashToken = (token: string): string => crypto.createHash('sha256').update(token).digest('hex');

// Tokens issued before hashing was introduced are stored in plain text. They keep working until they expire
// (7 days) and are then replaced by hashed ones, so nobody is forced to sign in again.
const tokenLookup = (token: string) => ({ token: { $in: [hashToken(token), token] } });

export interface TokenOptions {
  /** Set only by the admin MFA login. Access tokens then carry `mfa: true`, which sub-admin accounts require. */
  mfaVerified?: boolean;
}

export const generateAuthTokens = async (
  userId: Types.ObjectId | string,
  ip?: string,
  userAgent?: string,
  replacedToken?: string,
  options: TokenOptions = {},
) => {
  // Always sign the plain id. (Callers that pass a populated user document used to embed the whole
  // document in the JWT, which made req.user.userId an object after a token refresh.)
  const id = String((userId as any)?._id ?? userId);

  // Rotating a refresh token keeps the assurance level of the session it replaces.
  let mfaVerified = options.mfaVerified === true;
  if (replacedToken && !mfaVerified) {
    const previous = await RefreshToken.findOne(tokenLookup(replacedToken)).select('mfaVerified').lean();
    if (previous?.mfaVerified) mfaVerified = true;
  }

  const accessToken = jwt.sign({ userId: id, ...(mfaVerified && { mfa: true }) }, JWT_CONFIG.ACCESS_SECRET, {
    expiresIn: JWT_CONFIG.ACCESS_EXPIRES_IN as any,
  });

  const refreshTokenValue = crypto.randomBytes(40).toString('hex');
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + JWT_CONFIG.REFRESH_EXPIRES_IN_DAYS);

  await RefreshToken.create({
    token: hashToken(refreshTokenValue),
    user: id,
    expiresAt,
    mfaVerified,
    ...(ip && { userIp: ip }),
    ...(userAgent && { userAgent }),
  });

  // Rotation: remember on the OLD token which token replaced it.
  if (replacedToken) {
    await RefreshToken.findOneAndUpdate(tokenLookup(replacedToken), { replacedByToken: hashToken(refreshTokenValue) });
  }

  return { accessToken, refreshToken: refreshTokenValue };
};

export const verifyRefreshToken = async (token: string) => {
  const refreshTokenDoc = await RefreshToken.findOne(tokenLookup(token)).populate('user');
  if (!refreshTokenDoc || refreshTokenDoc.isRevoked || refreshTokenDoc.expiresAt < new Date()) {
    throw new Error('Invalid or expired refresh token');
  }
  return refreshTokenDoc;
};

export const revokeRefreshToken = async (token: string) => {
  await RefreshToken.findOneAndUpdate(tokenLookup(token), { isRevoked: true });
};

// Signs the user out everywhere (used after a password reset so a stolen session cannot survive it).
export const revokeAllUserRefreshTokens = async (userId: Types.ObjectId | string) => {
  await RefreshToken.updateMany({ user: userId, isRevoked: false }, { isRevoked: true });
};
