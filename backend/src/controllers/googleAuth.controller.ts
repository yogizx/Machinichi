import { Request, Response } from 'express';
import { OAuth2Client } from 'google-auth-library';
import { User } from '../models/User';
import { generateAuthTokens } from '../services/token.service';
import { sendGoogleWelcomeEmail } from '../services/email.service';

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

const setRefreshCookie = (res: Response, token: string) => {
  res.cookie('refreshToken', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
};

export const googleAuth = async (req: Request, res: Response): Promise<any> => {
  try {
    // SECURITY: without our own client id the audience would not be checked, and an ID token that Google issued
    // to ANY other app could be used to sign in here. So refuse to run unconfigured.
    if (!process.env.GOOGLE_CLIENT_ID) {
      console.error('[GOOGLE AUTH] GOOGLE_CLIENT_ID is not set - Google sign-in is disabled');
      return res.status(503).json({ message: 'Google sign-in is not available right now' });
    }

    const { idToken } = req.body;
    if (!idToken || typeof idToken !== 'string') {
      return res.status(400).json({ message: 'Google ID token is required' });
    }

    let payload: any;
    try {
      const ticket = await googleClient.verifyIdToken({
        idToken,
        audience: process.env.GOOGLE_CLIENT_ID,
      });
      payload = ticket.getPayload();
    } catch (verifyErr) {
      return res.status(401).json({ message: 'Invalid Google ID token' });
    }

    if (!payload || !payload.email) {
      return res.status(400).json({ message: 'Google account must have an email address' });
    }

    // SECURITY: only trust an e-mail address that Google itself has verified. Otherwise someone could create a
    // Google account claiming another person's e-mail and take over that person's shop account.
    if (payload.email_verified !== true) {
      return res.status(401).json({ message: 'Your Google email address is not verified' });
    }

    const { sub: googleId, email, name, picture } = payload;

    let user = await User.findOne({
      $or: [{ googleId }, { email: email.toLowerCase() }],
    });

    const isNewUser = !user;

    if (user) {
      // Sub-admins sign in only through the admin portal (password + authenticator code). Linking or signing in
      // with Google would skip the second factor, so it is refused for them.
      if (user.role === 'sub_admin') {
        return res.status(403).json({ message: 'Staff accounts must sign in through the admin portal.' });
      }
      // An account that is blocked / deleted / deactivated must not be reachable through Google either.
      if (user.isBlocked || user.isDeleted || user.isActive === false) {
        return res.status(403).json({ message: 'Account is blocked. Contact support.' });
      }
      // The account is already tied to a different Google identity: never re-link it.
      if (user.googleId && user.googleId !== googleId) {
        return res.status(401).json({ message: 'This account is linked to a different Google account' });
      }
    }

    if (!user) {
      user = await User.create({
        fullName: name || email.split('@')[0],
        email: email.toLowerCase(),
        avatar: picture || undefined,
        provider: 'google',
        googleId,
        role: 'customer',
        isEmailVerified: true,
      });

      try {
        await sendGoogleWelcomeEmail(email, name || email.split('@')[0]);
      } catch (emailErr) {
        console.error('Failed to send welcome email:', emailErr);
      }
    } else {
      if (!user.googleId) {
        // Link Google to the existing account. The account keeps its own `provider`: flipping an e-mail/password
        // account to 'google' would silently lock its owner out of password login and password reset.
        user.googleId = googleId;
      }
      if (!user.avatar && picture) {
        user.avatar = picture;
      }
    }

    user.lastLogin = new Date();
    user.lastLoginIp = req.ip || '';
    user.lastLoginDevice = req.headers['user-agent'] || '';
    user.failedLoginAttempts = 0;
    user.lockUntil = undefined;
    await user.save();

    const { accessToken, refreshToken } = await generateAuthTokens(
      user._id as any,
      req.ip,
      req.headers['user-agent']
    );
    setRefreshCookie(res, refreshToken);

    return res.status(200).json({
      message: isNewUser ? 'Account created with Google' : 'Signed in with Google',
      accessToken,
      isNewUser,
      user: {
        id: user._id,
        fullName: user.fullName,
        email: user.email,
        avatar: user.avatar,
        role: user.role,
      },
    });
  } catch (err: any) {
    console.error('Google auth error:', err?.message);
    return res.status(500).json({ message: 'Google authentication failed' });
  }
};
