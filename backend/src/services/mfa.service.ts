import crypto from 'crypto';
import { JWT_CONFIG } from '../config/jwt';

/**
 * TOTP (RFC 6238) multi-factor authentication, implemented with Node's crypto only (no extra dependency).
 *
 *  - Secrets are stored AES-256-GCM encrypted (key from MFA_ENCRYPTION_KEY) - a database leak alone is not enough
 *    to generate codes.
 *  - A code can be used once (the controller stores the last accepted time-step).
 *  - Recovery codes are stored only as keyed hashes and are single use.
 */

const TOTP_STEP_SECONDS = 30;
const TOTP_DIGITS = 6;
const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(input: string): Buffer {
  const clean = input.replace(/=+$/g, '').replace(/\s+/g, '').toUpperCase();
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const ch of clean) {
    const idx = BASE32.indexOf(ch);
    if (idx === -1) throw new Error('Invalid base32 character');
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

export const generateTotpSecret = (): string => base32Encode(crypto.randomBytes(20));

const hotp = (secret: Buffer, counter: number): string => {
  const buf = Buffer.alloc(8);
  buf.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  buf.writeUInt32BE(counter >>> 0, 4);
  const hmac = crypto.createHmac('sha1', secret).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const bin =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return String(bin % 10 ** TOTP_DIGITS).padStart(TOTP_DIGITS, '0');
};

export const currentStep = (now = Date.now()): number => Math.floor(now / 1000 / TOTP_STEP_SECONDS);

export const totpAtStep = (secretB32: string, step: number): string => hotp(base32Decode(secretB32), step);

const safeEqual = (a: string, b: string): boolean => {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
};

/**
 * Returns the time-step the code belongs to (so the caller can reject re-use), or null when it does not match.
 * A window of +/-1 step tolerates clock drift.
 */
export function findTotpStep(secretB32: string, code: string, now = Date.now(), window = 1): number | null {
  if (!/^\d{6}$/.test(code)) return null;
  const secret = base32Decode(secretB32);
  const center = currentStep(now);
  let matched: number | null = null;
  for (let s = center - window; s <= center + window; s++) {
    // no early return: keep the work constant regardless of which step matches
    if (safeEqual(hotp(secret, s), code)) matched = s;
  }
  return matched;
}

export const buildOtpAuthUrl = (secretB32: string, account: string, issuer = 'Machinichi'): string =>
  `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(account)}` +
  `?secret=${secretB32}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=${TOTP_DIGITS}&period=${TOTP_STEP_SECONDS}`;

// ── Encryption of the stored secret ────────────────────────────────────────────

let warnedDevKey = false;

const encryptionKey = (): Buffer => {
  const configured = process.env.MFA_ENCRYPTION_KEY;
  if (configured && configured.length >= 32) {
    return crypto.createHash('sha256').update(configured).digest();
  }
  if (process.env.NODE_ENV === 'production') {
    // Fail closed: never store MFA secrets under a key derived from something guessable.
    throw new Error('MFA_ENCRYPTION_KEY is not set (minimum 32 characters). Refusing to handle MFA secrets.');
  }
  if (!warnedDevKey) {
    warnedDevKey = true;
    console.warn('[SECURITY] MFA_ENCRYPTION_KEY is not set - deriving a development key from JWT_ACCESS_SECRET.');
  }
  return crypto.createHmac('sha256', JWT_CONFIG.ACCESS_SECRET).update('machinichi-mfa-dev-key').digest();
};

export function encryptSecret(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ['v1', iv.toString('base64'), tag.toString('base64'), ct.toString('base64')].join(':');
}

export function decryptSecret(blob: string): string {
  const [version, iv, tag, ct] = blob.split(':');
  if (version !== 'v1' || !iv || !tag || !ct) throw new Error('Unsupported MFA secret format');
  const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(ct, 'base64')), decipher.final()]).toString('utf8');
}

// ── Recovery codes ─────────────────────────────────────────────────────────────

const RECOVERY_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const normalizeRecovery = (code: string): string => code.replace(/[^A-Za-z0-9]/g, '').toUpperCase();

export const hashRecoveryCode = (code: string): string =>
  crypto.createHmac('sha256', JWT_CONFIG.ACCESS_SECRET).update(`mfa-recovery|${normalizeRecovery(code)}`).digest('hex');

export function generateRecoveryCodes(count = 8): { codes: string[]; hashes: string[] } {
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    let raw = '';
    for (let j = 0; j < 10; j++) raw += RECOVERY_ALPHABET[crypto.randomInt(RECOVERY_ALPHABET.length)];
    codes.push(`${raw.slice(0, 5)}-${raw.slice(5)}`);
  }
  return { codes, hashes: codes.map(hashRecoveryCode) };
}

export const looksLikeRecoveryCode = (code: string): boolean => /^[A-Za-z0-9]{5}-?[A-Za-z0-9]{5}$/.test(code.trim());
