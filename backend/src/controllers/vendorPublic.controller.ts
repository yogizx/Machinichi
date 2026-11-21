import { Request, Response } from 'express';
import crypto from 'crypto';
import path from 'path';
import multer from 'multer';
import { Types } from 'mongoose';
import { z } from 'zod';
import { Business, VENDOR_DOC_TYPES, VendorDocType, IBusinessDocument } from '../models/Business';
import { User } from '../models/User';
import { Product } from '../models/Product';
import { VendorEmailVerification } from '../models/VendorEmailVerification';
import { storeVendorDocument, MAX_DOC_BYTES } from '../services/vendorDocs.service';
import { computeVendorRating } from '../services/vendorStats.service';
import { sendVendorOtpEmail } from '../services/vendorEmail.service';

/* ───────────────────────── E-mail OTP verification ───────────────────────── */

const OTP_TTL_MIN = 10;          // how long a code is valid
const TOKEN_TTL_MIN = 30;        // how long the "e-mail verified" proof can be used to submit the form
const RESEND_COOLDOWN_S = 30;    // minimum gap between two codes for the same e-mail
const MAX_SENDS_PER_HOUR = 5;    // codes per e-mail per hour
const MAX_WRONG_ATTEMPTS = 5;    // wrong guesses before the code is burned

const secret = () => process.env.JWT_ACCESS_SECRET || process.env.JWT_SECRET || 'machinichi-dev-only-secret';
const hmac = (value: string) => crypto.createHmac('sha256', secret()).update(value).digest('hex');
const safeEqual = (a: string, b: string) => {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
};

const emailSchema = z.string().trim().toLowerCase().email();

// One generic message for "already registered" and "already applied" so the form does not become an
// account-lookup tool.
const EMAIL_UNAVAILABLE = 'This e-mail cannot be used for a vendor application. Please use a different business e-mail.';

const emailIsAvailable = async (email: string): Promise<boolean> => {
  const [hasUser, hasBusiness] = await Promise.all([
    User.exists({ email }),
    Business.exists({ email, status: { $in: ['pending', 'approved'] } }),
  ]);
  if (hasUser || hasBusiness) return false;

  return true;
};

// POST /api/vendors/email-otp/send  { email }
export const sendVendorEmailOtp = async (req: Request, res: Response): Promise<any> => {
  try {
    const parsed = emailSchema.safeParse(req.body?.email);
    if (!parsed.success) return res.status(400).json({ success: false, message: 'Enter a valid e-mail address' });
    const email = parsed.data;

    if (!(await emailIsAvailable(email))) {
      return res.status(409).json({ success: false, message: EMAIL_UNAVAILABLE });
    }

    const now = new Date();
    const doc = (await VendorEmailVerification.findOne({ email })) || new VendorEmailVerification({ email });

    if (doc.lastSentAt) {
      const waited = (now.getTime() - doc.lastSentAt.getTime()) / 1000;
      if (waited < RESEND_COOLDOWN_S) {
        const retryAfter = Math.ceil(RESEND_COOLDOWN_S - waited);
        return res.status(429).json({ success: false, message: `Please wait ${retryAfter}s before requesting another code.`, retryAfter });
      }
    }
    if (!doc.sendWindowStart || now.getTime() - doc.sendWindowStart.getTime() > 60 * 60 * 1000) {
      doc.sendWindowStart = now;
      doc.sendCount = 0;
    }
    if (doc.sendCount >= MAX_SENDS_PER_HOUR) {
      return res.status(429).json({ success: false, message: 'Too many codes requested for this e-mail. Please try again in an hour.' });
    }

    const otp = crypto.randomInt(100000, 1000000).toString();
    doc.otpHash = hmac(`otp:${email}:${otp}`);
    doc.otpExpiresAt = new Date(now.getTime() + OTP_TTL_MIN * 60 * 1000);
    doc.attempts = 0;
    doc.sendCount += 1;
    doc.lastSentAt = now;
    doc.verified = false;          // a new code invalidates any earlier proof
    doc.tokenHash = undefined;
    doc.tokenExpiresAt = undefined;
    await doc.save();

    try {
      await sendVendorOtpEmail(email, otp, OTP_TTL_MIN);
    } catch (mailErr: any) {
      console.error('[VENDOR OTP] e-mail failed:', mailErr?.message);
      return res.status(502).json({ success: false, message: 'We could not send the code. Please check the e-mail address and try again.' });
    }

    return res.status(200).json({
      success: true,
      message: `We sent a 6-digit code to ${email}.`,
      expiresInSeconds: OTP_TTL_MIN * 60,
      resendAfterSeconds: RESEND_COOLDOWN_S,
    });
  } catch (error) {
    console.error('[VENDOR OTP] send failed:', error);
    return res.status(500).json({ success: false, message: 'Could not send the code. Please try again.' });
  }
};

// POST /api/vendors/email-otp/verify  { email, otp }  ->  { verificationToken }
export const verifyVendorEmailOtp = async (req: Request, res: Response): Promise<any> => {
  try {
    const parsed = emailSchema.safeParse(req.body?.email);
    const otp = String(req.body?.otp || '').trim();
    if (!parsed.success || !/^\d{6}$/.test(otp)) {
      return res.status(400).json({ success: false, message: 'Enter the 6-digit code' });
    }
    const email = parsed.data;

    const doc = await VendorEmailVerification.findOne({ email });
    if (!doc || !doc.otpHash || !doc.otpExpiresAt) {
      return res.status(400).json({ success: false, message: 'Request a new code first.' });
    }
    if (doc.otpExpiresAt.getTime() < Date.now()) {
      return res.status(400).json({ success: false, message: 'This code has expired. Request a new one.' });
    }
    if (doc.attempts >= MAX_WRONG_ATTEMPTS) {
      return res.status(429).json({ success: false, message: 'Too many wrong attempts. Request a new code.' });
    }

    if (!safeEqual(doc.otpHash, hmac(`otp:${email}:${otp}`))) {
      doc.attempts += 1;
      await doc.save();
      const left = MAX_WRONG_ATTEMPTS - doc.attempts;
      return res.status(400).json({
        success: false,
        message: left > 0 ? `Incorrect code. ${left} attempt${left === 1 ? '' : 's'} left.` : 'Too many wrong attempts. Request a new code.',
      });
    }

    const token = crypto.randomBytes(24).toString('hex');
    doc.verified = true;
    doc.otpHash = undefined;          // a code can be used only once
    doc.otpExpiresAt = undefined;
    doc.attempts = 0;
    doc.tokenHash = hmac(`token:${email}:${token}`);
    doc.tokenExpiresAt = new Date(Date.now() + TOKEN_TTL_MIN * 60 * 1000);
    await doc.save();

    return res.status(200).json({
      success: true,
      message: 'E-mail verified.',
      verificationToken: token,
      expiresInSeconds: TOKEN_TTL_MIN * 60,
    });
  } catch (error) {
    console.error('[VENDOR OTP] verify failed:', error);
    return res.status(500).json({ success: false, message: 'Could not verify the code. Please try again.' });
  }
};

// The server-side gate: the form can only be submitted with the proof issued for THIS e-mail address.
const hasValidEmailProof = async (email: string, token: string): Promise<boolean> => {
  if (!token) return false;
  const doc = await VendorEmailVerification.findOne({ email });
  if (!doc || !doc.verified || !doc.tokenHash || !doc.tokenExpiresAt) return false;
  if (doc.tokenExpiresAt.getTime() < Date.now()) return false;
  return safeEqual(doc.tokenHash, hmac(`token:${email}:${token}`));
};

/* ───────────────────────── Application form ───────────────────────── */

// ── multipart parsing (documents are kept in memory, then stored privately) ──
const DOC_EXT_BY_MIME: Record<string, string[]> = {
  'application/pdf': ['.pdf'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
};
const DOC_FORMAT_MESSAGE = 'Wrong file format. Only PDF, JPG or PNG documents are allowed';

// a file error that remembers which document box it belongs to, so the form can show it under that box
const docError = (message: string, field?: string, code?: string) => Object.assign(new Error(message), { field, docCode: code });

const docUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_DOC_BYTES, files: VENDOR_DOC_TYPES.length },
  fileFilter: (_req, file, cb) => {
    const allowedExt = DOC_EXT_BY_MIME[file.mimetype];
    const ext = path.extname(file.originalname || '').toLowerCase();
    if (!allowedExt || !allowedExt.includes(ext)) {
      return cb(docError(DOC_FORMAT_MESSAGE, file.fieldname, 'BAD_FORMAT'));
    }
    cb(null, true);
  },
}).fields(VENDOR_DOC_TYPES.map((name) => ({ name, maxCount: 1 })));

const REQUIRED_DOCS: VendorDocType[] = []; // every document is optional

const optionalText = (max: number, what = 'This field') => z.string().trim().max(max, `${what} must be ${max} characters or fewer`).optional().or(z.literal(''));

const collapse = (v: string) => v.replace(/\s+/g, ' ');
const NAME_RE = /^[A-Za-z][A-Za-z .]*$/;
const BUSINESS_NAME_RE = /^[A-Za-z][A-Za-z .&'-]*$/;
const PLACE_RE = /^[A-Za-z][A-Za-z .'-]*$/;
const ADDRESS_RE = /^[A-Za-z0-9 ,.\-/#&()']+$/;
const CATEGORY_OPTIONS = [
  'Grains & Flours', 'Pulses & Lentils', 'Spices & Masalas', 'Dry Fruits & Nuts', 'Oils & Ghee',
  'Organic Produce', 'Snacks & Namkeen', 'Beverages', 'Home Care', 'Personal Care', 'Other',
] as const;
const YEARS_OPTIONS = ['Less than 1 year', '1 - 3 years', '3 - 5 years', '5 - 10 years', 'More than 10 years'] as const;

const applicationSchema = z.object({
  businessName: z.string().trim().transform(collapse).pipe(
    z.string().min(2, 'Store / business name must be at least 2 characters').max(100, 'Business name must be 100 characters or fewer')
      .regex(BUSINESS_NAME_RE, 'Business name can contain only letters, spaces and . & \' -'),
  ),
  ownerName: z.string().trim().transform(collapse).pipe(
    z.string().min(2, 'Owner name must be at least 2 characters').max(80, 'Owner name must be 80 characters or fewer')
      .regex(NAME_RE, 'Owner name can contain only letters, spaces and dots'),
  ),
  email: z.string().trim().toLowerCase().email('Enter a valid e-mail address'),
  phone: z.string().trim().transform((v) => v.replace(/[\s-]/g, '')).pipe(
    z.string().regex(/^(\+91)?[6-9]\d{9}$/, 'Enter a valid 10-digit Indian mobile number (starting with 6-9)'),
  ).transform((v) => (v.startsWith('+91') ? v : `+91${v}`)),
  category: z.enum(CATEGORY_OPTIONS, { message: 'Select what you sell' }),
  description: optionalText(300, 'The description'),
  tagline: optionalText(150),
  website: z.string().trim().max(200).url('Enter a valid website address').refine((v) => /^https?:\/\//i.test(v), 'Website must start with http:// or https://').optional().or(z.literal('')),
  gstin: z.string().trim().toUpperCase().regex(/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/, 'Enter a valid 15-character GSTIN').optional().or(z.literal('')),
  panNumber: z.string().trim().toUpperCase().regex(/^[A-Z]{5}\d{4}[A-Z]$/, 'Enter a valid 10-character PAN').optional().or(z.literal('')),
  fssaiNumber: z.string().trim().regex(/^\d{14}$/, 'FSSAI number must be 14 digits').optional().or(z.literal('')),
  yearsInBusiness: z.enum(YEARS_OPTIONS, { message: 'Select a valid duration' }).optional().or(z.literal('')),
  address: z.string().trim().transform(collapse).pipe(
    z.string().min(5, 'Pickup / business address must be at least 5 characters').max(300, 'Address must be 300 characters or fewer')
      .regex(ADDRESS_RE, 'Address can contain only letters, numbers, spaces and , . - / # & ( )'),
  ),
  city: z.string().trim().transform(collapse).pipe(z.string().min(2, 'City is required').max(60).regex(PLACE_RE, 'City can contain only letters')),
  state: z.string().trim().transform(collapse).pipe(z.string().min(2, 'State is required').max(60).regex(PLACE_RE, 'State can contain only letters')),
  district: z.string().trim().transform(collapse).pipe(z.string().min(2, 'District is required').max(60).regex(PLACE_RE, 'District can contain only letters')),
  pincode: z.string().trim().regex(/^[1-9]\d{5}$/, 'Enter a valid 6-digit pincode'),
});

const runUpload = (req: Request, res: Response) =>
  new Promise<void>((resolve, reject) => docUpload(req, res, (err: any) => (err ? reject(err) : resolve())));

// POST /api/vendors/apply  (public, multipart/form-data) — requires the e-mail verification proof
export const submitVendorApplication = async (req: Request, res: Response): Promise<any> => {
  try {
    try {
      await runUpload(req, res);
    } catch (err: any) {
      const field: string | undefined = (VENDOR_DOC_TYPES as readonly string[]).includes(err?.field) ? err.field : undefined;
      let message: string;
      if (err?.code === 'LIMIT_FILE_SIZE') message = 'File is too large. Each document must be 2 MB or smaller';
      else if (err?.code === 'LIMIT_UNEXPECTED_FILE' || err?.code === 'LIMIT_FILE_COUNT') message = 'Unexpected file upload. Attach each document only once, in its own box';
      else if (err?.docCode) message = err.message;
      else message = 'Invalid upload. Please check your documents and try again';
      return res.status(400).json({
        success: false,
        message,
        ...(field ? { errors: [{ field, message }] } : {}),
      });
    }

    const parsed = applicationSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: parsed.error.issues[0]?.message || 'Please check the form',
        errors: parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      });
    }
    const data = parsed.data;

    if (data.gstin && data.panNumber && data.gstin.slice(2, 12) !== data.panNumber) {
      return res.status(400).json({ success: false, message: 'The PAN does not match the PAN inside the GSTIN', errors: [{ field: 'panNumber', message: 'The PAN does not match the PAN inside the GSTIN' }] });
    }

    // The business e-mail must have been verified by OTP, and the proof must belong to this exact address.
    if (!(await hasValidEmailProof(data.email, String(req.body?.emailVerificationToken || '')))) {
      return res.status(403).json({
        success: false,
        code: 'EMAIL_NOT_VERIFIED',
        message: 'Please verify your business e-mail with the OTP before submitting.',
      });
    }

    const files = (req.files || {}) as Record<string, Express.Multer.File[]>;
    const SIGNATURES: Record<string, number[]> = {
      'application/pdf': [0x25, 0x50, 0x44, 0x46],
      'image/png': [0x89, 0x50, 0x4e, 0x47],
      'image/jpeg': [0xff, 0xd8, 0xff],
    };
    for (const [field, list] of Object.entries(files)) {
      for (const f of list) {
        const sig = SIGNATURES[f.mimetype];
        if (!f.size) {
          const message = 'This file is empty. Please choose another file';
          return res.status(400).json({ success: false, message, errors: [{ field, message }] });
        }
        if (f.size > MAX_DOC_BYTES) {
          const message = 'File is too large. Each document must be 2 MB or smaller';
          return res.status(400).json({ success: false, message, errors: [{ field, message }] });
        }
        if (!sig || !sig.every((b, i) => f.buffer[i] === b)) {
          const message = `"${path.basename(f.originalname)}" is damaged or is not a real PDF, JPG or PNG file`;
          return res.status(400).json({ success: false, message, errors: [{ field, message }] });
        }
      }
    }
    const missing = REQUIRED_DOCS.filter((t) => !files[t]?.[0]);
    if (missing.length) {
      return res.status(400).json({ success: false, message: `Please upload: ${missing.join(', ').replace(/_/g, ' ')}` });
    }

    if (!(await emailIsAvailable(data.email))) {
      return res.status(409).json({ success: false, message: EMAIL_UNAVAILABLE });
    }

    const documents: IBusinessDocument[] = [];
    for (const type of VENDOR_DOC_TYPES) {
      const file = files[type]?.[0];
      if (file) documents.push(await storeVendorDocument(file, type));
    }

    const business = await Business.create({
      name: data.businessName,
      ownerName: data.ownerName,
      email: data.email,
      phone: data.phone,
      category: data.category,
      description: data.description || undefined,
      tagline: data.tagline || undefined,
      website: data.website || undefined,
      gstin: data.gstin,
      panNumber: data.panNumber,
      fssaiNumber: data.fssaiNumber || undefined,
      yearsInBusiness: data.yearsInBusiness || undefined,
      address: data.address,
      city: data.city,
      state: data.state,
      district: data.district,
      pincode: data.pincode,
      documents,
      status: 'pending',
    });

    // the proof is single-use
    await VendorEmailVerification.updateOne(
      { email: data.email },
      { $set: { verified: false }, $unset: { tokenHash: 1, tokenExpiresAt: 1 } },
    );

    return res.status(201).json({
      success: true,
      message: 'Application submitted. Our team will review your documents and e-mail your login details once approved.',
      applicationId: String(business._id),
    });
  } catch (error: any) {
    console.error('[VENDOR APPLY] failed:', error);
    return res.status(500).json({ success: false, message: 'Could not submit your application. Please try again.' });
  }
};

// GET /api/vendors/seller/:productId  (public) — the "Seller" card on the product page.
export const getSellerForProduct = async (req: Request, res: Response): Promise<any> => {
  try {
    const productId = String(req.params.productId || '');
    if (!Types.ObjectId.isValid(productId)) {
      return res.status(400).json({ success: false, message: 'Invalid product id' });
    }

    const product = await Product.findById(productId).select('vendor averageRating reviewCount').lean();
    if (!product) return res.status(404).json({ success: false, message: 'Product not found' });

    if (product.vendor) {
      const business = await Business.findOne({ _id: product.vendor, status: 'approved' }).select('name vendorSince createdAt').lean();
      if (business) {
        const { rating, ratingCount } = await computeVendorRating(business._id);
        return res.status(200).json({
          success: true,
          data: {
            storeName: business.name,
            rating,
            ratingCount,
            memberSince: business.vendorSince || business.createdAt,
            isMarketplaceSeller: true,
          },
        });
      }
    }

    // Machinichi's own catalogue
    const reviewed = (product.reviewCount || 0) > 0;
    return res.status(200).json({
      success: true,
      data: {
        storeName: 'Machinichi',
        rating: reviewed ? Math.round((product.averageRating || 0) * 10) / 10 : null,
        ratingCount: product.reviewCount || 0,
        memberSince: process.env.PLATFORM_LAUNCH_DATE || null,
        isMarketplaceSeller: false,
      },
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: 'Could not load seller details' });
  }
};
