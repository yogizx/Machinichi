import Razorpay from 'razorpay';
import crypto from 'crypto';
import dotenv from 'dotenv';
dotenv.config();

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID || '',
  key_secret: process.env.RAZORPAY_KEY_SECRET || '',
});

export const createRazorpayOrder = async (amount: number, currency = 'INR', receipt?: string) => {
  const order = await razorpay.orders.create({
    amount: Math.round(amount * 100),
    currency,
    receipt: receipt || `rcpt_${Date.now()}`,
    notes: { platform: 'machinichi' },
  });
  return order;
};

// Constant-time comparison of two hex signatures (avoids leaking how many leading characters matched).
const signaturesMatch = (expected: string, received: unknown): boolean => {
  if (typeof received !== 'string') return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(received);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

export const verifyPaymentSignature = (
  orderId: string,
  paymentId: string,
  signature: string
): boolean => {
  const secret = process.env.RAZORPAY_KEY_SECRET || '';
  if (!secret) return false; // never "verify" against an empty key
  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${orderId}|${paymentId}`)
    .digest('hex');
  return signaturesMatch(expected, signature);
};

// `body` must be the EXACT bytes Razorpay sent (not re-serialised JSON), and the secret must be set:
// an empty secret would let anybody compute a "valid" signature.
export const verifyWebhookSignature = (body: string | Buffer, signature: string, secret: string): boolean => {
  if (!secret) return false;
  const expected = crypto.createHmac('sha256', secret).update(body).digest('hex');
  return signaturesMatch(expected, signature);
};

export const capturePayment = async (paymentId: string, amount: number) => {
  return razorpay.payments.capture(paymentId, amount * 100, 'INR');
};

// `speed: 'optimum'` asks Razorpay for an INSTANT refund (falls back to normal speed automatically when
// an instant refund is not possible). Without a speed the refund uses the normal 5-7 working day speed.
export const createRefund = async (paymentId: string, amount?: number, speed?: 'normal' | 'optimum') => {
  return razorpay.payments.refund(paymentId, {
    ...(amount && { amount: Math.round(amount * 100) }),
    ...(speed && { speed }),
  });
};

export const fetchPaymentById = async (paymentId: string) => {
  return razorpay.payments.fetch(paymentId);
};

export default razorpay;
