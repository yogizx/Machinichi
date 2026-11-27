import { describe, expect, it } from 'vitest';
import {
  base32Decode, base32Encode, buildOtpAuthUrl, decryptSecret, encryptSecret, findTotpStep, generateRecoveryCodes,
  generateTotpSecret, hashRecoveryCode, totpAtStep,
} from '../../src/services/mfa.service';
import {
  ASSIGNABLE_KEYS, PERMISSIONS, PERMISSION_KEYS, PREDEFINED_ROLES, STAFF_MANAGEMENT_KEYS,
} from '../../src/services/permissionCatalog';
import { validateStaffPassword } from '../../src/services/passwordPolicy';
import { redact } from '../../src/services/audit.service';

describe('TOTP (RFC 6238)', () => {
  // RFC 6238 Appendix B, SHA-1, secret "12345678901234567890"; 6-digit codes are the last 6 digits of the published 8-digit ones.
  const secret = base32Encode(Buffer.from('12345678901234567890'));
  it.each([
    [59, '287082'],
    [1111111109, '081804'],
    [1111111111, '050471'],
    [1234567890, '005924'],
    [2000000000, '279037'],
  ])('matches the RFC test vector at t=%i', (t, code) => {
    expect(totpAtStep(secret, Math.floor(t / 30))).toBe(code);
  });

  it('round-trips base32', () => {
    const raw = Buffer.from([1, 2, 3, 250, 251, 252, 0, 99]);
    expect(base32Decode(base32Encode(raw)).equals(raw)).toBe(true);
  });

  it('accepts the current and neighbouring step, rejects anything further away or malformed', () => {
    const s = generateTotpSecret();
    const now = Date.now();
    const step = Math.floor(now / 30000);
    expect(findTotpStep(s, totpAtStep(s, step), now)).toBe(step);
    expect(findTotpStep(s, totpAtStep(s, step - 1), now)).toBe(step - 1);
    expect(findTotpStep(s, totpAtStep(s, step + 1), now)).toBe(step + 1);
    expect(findTotpStep(s, totpAtStep(s, step + 3), now)).toBeNull();
    expect(findTotpStep(s, totpAtStep(s, step - 3), now)).toBeNull();
    expect(findTotpStep(s, '12345', now)).toBeNull();
    expect(findTotpStep(s, 'abcdef', now)).toBeNull();
    expect(findTotpStep(s, '', now)).toBeNull();
  });

  it('builds a standard otpauth URL', () => {
    const url = buildOtpAuthUrl('ABCDEFGH', 'a@b.test');
    expect(url).toMatch(/^otpauth:\/\/totp\/Machinichi:a%40b\.test\?secret=ABCDEFGH&issuer=Machinichi/);
  });
});

describe('MFA secret storage', () => {
  it('encrypts, never stores the plaintext, and detects tampering', () => {
    const secret = generateTotpSecret();
    const blob = encryptSecret(secret);
    expect(blob.startsWith('v1:')).toBe(true);
    expect(blob).not.toContain(secret);
    expect(decryptSecret(blob)).toBe(secret);
    expect(encryptSecret(secret)).not.toBe(blob); // fresh IV every time

    const parts = blob.split(':');
    const flipped = Buffer.from(parts[3], 'base64');
    flipped[0] ^= 0xff;
    expect(() => decryptSecret([parts[0], parts[1], parts[2], flipped.toString('base64')].join(':'))).toThrow();
  });

  it('recovery codes are random, formatted, and only their hashes are kept', () => {
    const { codes, hashes } = generateRecoveryCodes(8);
    expect(new Set(codes).size).toBe(8);
    codes.forEach((c, i) => {
      expect(c).toMatch(/^[A-Z2-9]{5}-[A-Z2-9]{5}$/);
      expect(hashes[i]).toBe(hashRecoveryCode(c));
      expect(hashes[i]).not.toContain(c);
      expect(hashRecoveryCode(c.toLowerCase().replace('-', ''))).toBe(hashes[i]); // forgiving input
    });
  });
});

describe('Permission catalog integrity', () => {
  it('has unique keys that follow module.action', () => {
    expect(PERMISSIONS.length).toBe(PERMISSION_KEYS.size);
    PERMISSIONS.forEach((p) => expect(p.key).toBe(`${p.module}.${p.action}`));
  });

  it('reserved permissions cannot be granted and predefined roles use only real, enforced ones', () => {
    const reserved = PERMISSIONS.filter((p) => !p.enforced).map((p) => p.key);
    expect(reserved).toContain('settings.general');
    reserved.forEach((k) => expect(ASSIGNABLE_KEYS.has(k)).toBe(false));
    PREDEFINED_ROLES.forEach((r) => r.permissions.forEach((k) => expect(ASSIGNABLE_KEYS.has(k)).toBe(true)));
  });

  it('keeps staff-management permissions in one non-delegable group', () => {
    expect([...STAFF_MANAGEMENT_KEYS].every((k) => k.startsWith('admin.'))).toBe(true);
    expect(STAFF_MANAGEMENT_KEYS.has('admin.permission.assign')).toBe(true);
    expect(STAFF_MANAGEMENT_KEYS.has('product.view')).toBe(false);
  });

  it('has no wildcard permissions', () => {
    PERMISSIONS.forEach((p) => expect(p.key).not.toMatch(/[*?]/));
  });
});

describe('Staff password policy', () => {
  const ctx = { email: 'rahul.kumar@example.com', fullName: 'Rahul Kumar' };
  it.each([
    ['short1!A', 'too short'],
    ['alllowercaseletters', 'one character class'],
    ['Password123456!', 'common word'],
    ['Machinichi#2026Aa', 'brand word'],
    ['xRahulx#Strong99', 'contains first name'],
    ['rahul.kumar#Zz9!!', 'contains e-mail name'],
    ['aaaaaaaaaaaa', 'repeated'],
  ])('rejects %s (%s)', (pw) => {
    expect(validateStaffPassword(pw, ctx)).not.toBeNull();
  });
  it('accepts a strong password and rejects non-strings', () => {
    expect(validateStaffPassword('Tr0ub4dor&3-horse-battery', ctx)).toBeNull();
    expect(validateStaffPassword({ $ne: '' } as any, ctx)).not.toBeNull();
  });
});

describe('Audit redaction', () => {
  it('never keeps credentials, tokens, codes or hashes', () => {
    const out = redact({
      email: 'a@b.test',
      password: 'hunter2', newPassword: 'x', token: 't', setupToken: 's', otpCode: '123456', mfaSecret: 'S',
      authorization: 'Bearer abc', cookie: 'c=1', recoveryCodes: ['A'], passwordHash: 'h',
      nested: { refreshToken: 'r', ok: 'fine', deep: { secretKey: 'k', roleName: 'Product Manager' } },
      list: [{ password: 'p' }, 'plain'],
    });
    const text = JSON.stringify(out);
    ['hunter2', '123456', 'Bearer abc', '"t"', '"s"', '"r"', '"k"'].forEach((s) => expect(text).not.toContain(s));
    expect(out.email).toBe('a@b.test');
    expect(out.nested.ok).toBe('fine');
    expect(out.nested.deep.roleName).toBe('Product Manager');
  });
  it('bounds size', () => {
    const out = redact({ big: 'x'.repeat(5000), arr: new Array(500).fill('a') });
    expect(out.big.length).toBeLessThan(400);
    expect(out.arr.length).toBeLessThanOrEqual(100);
  });
});
