/**
 * Emergency tool: resets an admin account's password and clears its lock-outs.
 *
 * SECURITY: no credentials live in this file. They are passed in through environment variables for the
 * single run, e.g. (PowerShell, from the backend folder):
 *
 *   $env:ADMIN_RESTORE_EMAIL = "you@example.com"
 *   $env:ADMIN_RESTORE_PASSWORD = "<a long, unique password>"
 *   npx ts-node src/restore-admin-auth.ts
 *   Remove-Item Env:ADMIN_RESTORE_PASSWORD
 *
 * The password is never printed. All of the admin's sessions are revoked.
 */
import dotenv from 'dotenv';
dotenv.config();
import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import { User } from './models/User';
import { RefreshToken } from './models/RefreshToken';

const STRONG_PASSWORD = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9\s])\S{12,128}$/;

async function restoreAdminAuth() {
  const uri = process.env.MONGODB_URI;
  const adminEmail = (process.env.ADMIN_RESTORE_EMAIL || '').toLowerCase().trim();
  const plainPassword = process.env.ADMIN_RESTORE_PASSWORD || '';

  if (!uri) throw new Error('MONGODB_URI is not set.');
  if (!adminEmail) throw new Error('Set ADMIN_RESTORE_EMAIL to the admin account e-mail.');
  if (!STRONG_PASSWORD.test(plainPassword)) {
    throw new Error(
      'ADMIN_RESTORE_PASSWORD must be 12-128 characters with upper-case, lower-case, a number and a special character (no spaces).'
    );
  }

  console.log('Connecting to MongoDB...');
  await mongoose.connect(uri, { family: 4 } as any);

  try {
    const hashedPassword = await bcrypt.hash(plainPassword, 12);

    console.log(`Updating auth state for ${adminEmail}...`);
    const result = await User.updateOne(
      { email: adminEmail, role: { $in: ['admin', 'super_admin'] } },
      {
        $set: {
          password: hashedPassword,
          failedLoginAttempts: 0,
          isActive: true,
          isDeleted: false,
          isBlocked: false,
        },
        $unset: {
          lockUntil: 1,
          passwordResetToken: 1,
          passwordResetExpires: 1,
          passwordResetLockUntil: 1,
        },
      }
    );

    if (!result.matchedCount) {
      throw new Error('No admin account with that e-mail was found. Nothing was changed.');
    }

    const admin = await User.findOne({ email: adminEmail }).select('_id');
    if (admin) await RefreshToken.updateMany({ user: admin._id, isRevoked: false }, { isRevoked: true });

    console.log('Done: password updated and all existing sessions for this admin were signed out.');
  } finally {
    await mongoose.disconnect();
  }
}

restoreAdminAuth().catch((err) => {
  console.error('Failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
