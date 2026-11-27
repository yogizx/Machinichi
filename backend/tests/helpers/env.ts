// Runs before every test file. Test secrets only - nothing here is used outside the test run.
process.env.NODE_ENV = 'test';
process.env.JWT_ACCESS_SECRET = 'test-access-secret-0123456789-abcdefghijklmnopqrstuvwxyz';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-0123456789-abcdefghijklmnopqrstuvwxyz';
process.env.MFA_ENCRYPTION_KEY = 'test-mfa-encryption-key-0123456789-abcdef';
process.env.CLIENT_URL = 'http://localhost:5173';
