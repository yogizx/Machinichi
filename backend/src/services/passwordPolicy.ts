/**
 * Password policy for privileged (staff) accounts.
 * Returns a human readable problem, or null when the password is acceptable.
 */
const COMMON = ['password', 'passw0rd', 'qwerty', 'letmein', 'welcome', 'admin', 'machinichi', '123456', 'iloveyou'];

export function validateStaffPassword(
  password: unknown,
  context: { email?: string; fullName?: string } = {},
): string | null {
  if (typeof password !== 'string') return 'Password is required.';
  if (password.length < 12) return 'Password must be at least 12 characters long.';
  if (password.length > 128) return 'Password must be at most 128 characters long.';

  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((re) => re.test(password)).length;
  if (classes < 3) return 'Use at least three of: lowercase, uppercase, numbers and symbols.';

  const lower = password.toLowerCase();
  if (COMMON.some((word) => lower.includes(word))) return 'Password is too easy to guess.';

  const localPart = context.email?.split('@')[0]?.toLowerCase();
  if (localPart && localPart.length >= 4 && lower.includes(localPart)) return 'Password must not contain your e-mail name.';

  const nameParts = (context.fullName || '').toLowerCase().split(/\s+/).filter((p) => p.length >= 4);
  if (nameParts.some((p) => lower.includes(p))) return 'Password must not contain your name.';

  if (/^(.)\1+$/.test(password)) return 'Password is too easy to guess.';
  return null;
}
