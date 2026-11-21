import { Request, Response } from 'express';
import crypto from 'crypto';
import { Business, IBusiness } from '../models/Business';
import { User } from '../models/User';
import { Product } from '../models/Product';
import { AuthRequest } from '../middlewares/auth.middleware';
import { revokeAllUserRefreshTokens } from '../services/token.service';
import { sendVendorCredentialsEmail } from '../services/vendorEmail.service';
import { getVendorDocumentAccess } from '../services/vendorDocs.service';

// Never expose storage internals (publicId / filename) of the KYC documents to the browser.
const sanitizeBusiness = (b: any) => {
  const o = typeof b.toObject === 'function' ? b.toObject() : { ...b };
  o.documents = (o.documents || []).map((d: any) => ({
    _id: d._id,
    type: d.type,
    label: d.label,
    originalName: d.originalName,
    mimeType: d.mimeType,
    size: d.size,
    uploadedAt: d.uploadedAt,
  }));
  return o;
};

const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const LOWER = 'abcdefghijkmnopqrstuvwxyz';
const DIGIT = '23456789';
const SPECIAL = '@#$%&*!';
const pick = (set: string) => set[crypto.randomInt(0, set.length)];

// 12 chars, always satisfies the site's password rule (upper + lower + digit + special).
const generateTempPassword = (): string => {
  const chars = [pick(UPPER), pick(LOWER), pick(DIGIT), pick(SPECIAL)];
  const all = UPPER + LOWER + DIGIT + SPECIAL;
  while (chars.length < 12) chars.push(pick(all));
  for (let i = chars.length - 1; i > 0; i--) {
    const j = crypto.randomInt(0, i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
};

const generateVendorCode = async (): Promise<string> => {
  for (let i = 0; i < 20; i++) {
    let suffix = '';
    for (let k = 0; k < 6; k++) suffix += pick(UPPER.replace(/[IO]/g, '') + DIGIT);
    const code = `VND-${suffix}`;
    if (!(await User.exists({ vendorCode: code }))) return code;
  }
  throw new Error('Could not generate a unique vendor id');
};

export const getBusinesses = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const { status, search, page = '1', limit = '20' } = req.query;
    const filter: any = {};

    if (status && ['pending', 'approved', 'rejected'].includes(status as string)) {
      filter.status = status;
    }

    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { tagline: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { ownerName: { $regex: search, $options: 'i' } },
        { gstin: { $regex: search, $options: 'i' } },
        { vendorCode: { $regex: search, $options: 'i' } },
      ];
    }

    const pageNum = Math.max(1, parseInt(page as string));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit as string)));
    const skip = (pageNum - 1) * limitNum;

    const [businesses, total] = await Promise.all([
      Business.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limitNum).lean(),
      Business.countDocuments(filter),
    ]);

    return res.status(200).json({
      businesses: businesses.map(sanitizeBusiness),
      total,
      page: pageNum,
      totalPages: Math.ceil(total / limitNum),
    });
  } catch (err: any) {
    return res.status(500).json({ message: 'Failed to fetch businesses', error: err.message });
  }
};

export const getBusinessById = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const business = await Business.findById(req.params.id).lean();
    if (!business) return res.status(404).json({ message: 'Business not found' });
    return res.status(200).json({ business: sanitizeBusiness(business) });
  } catch (err: any) {
    return res.status(500).json({ message: 'Failed to fetch business', error: err.message });
  }
};

// Approve = create the vendor's login (User role "vendor" + temporary password) and e-mail the
// user id, temporary password and login page URL. The vendor must change the password on first login.
export const approveBusiness = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const business = await Business.findById(req.params.id);
    if (!business) return res.status(404).json({ message: 'Business not found' });

    if (business.status === 'approved' && business.vendorUser) {
      return res.status(400).json({ message: 'This vendor is already approved.' });
    }
    if (!business.email) {
      return res.status(400).json({ message: 'This application has no e-mail address, so login details cannot be sent.' });
    }

    const email = business.email.toLowerCase().trim();
    if (await User.exists({ email })) {
      return res.status(409).json({
        message: 'An account with this e-mail already exists. Ask the applicant to apply again with a different business e-mail.',
      });
    }

    const tempPassword = generateTempPassword();
    const vendorCode = await generateVendorCode();

    const user = await User.create({
      fullName: business.ownerName || business.name,
      email,
      password: tempPassword,
      provider: 'local',
      role: 'vendor',
      isEmailVerified: true,
      vendorCode,
      businessId: business._id,
      mustChangePassword: true,
    });

    business.status = 'approved';
    business.reviewedBy = req.user?.userId as any;
    business.reviewedAt = new Date();
    business.rejectionReason = undefined;
    business.vendorUser = user._id as any;
    business.vendorCode = vendorCode;
    business.vendorSince = new Date();

    let emailSent = true;
    try {
      await sendVendorCredentialsEmail({
        to: email,
        ownerName: business.ownerName || business.name,
        storeName: business.name,
        vendorCode,
        tempPassword,
      });
      business.credentialsEmailStatus = 'sent';
      business.credentialsSentAt = new Date();
    } catch (mailErr: any) {
      console.error('[VENDOR] credentials e-mail failed:', mailErr?.message);
      business.credentialsEmailStatus = 'failed';
      emailSent = false;
    }
    await business.save();

    return res.status(200).json({
      message: emailSent
        ? 'Vendor approved. Login details were e-mailed to the vendor.'
        : 'Vendor approved, but the e-mail could not be sent. Use "Resend login details".',
      emailSent,
      business: sanitizeBusiness(business),
    });
  } catch (err: any) {
    return res.status(500).json({ message: 'Failed to approve business', error: err.message });
  }
};

// Issues a NEW temporary password and e-mails it (also used when the first e-mail failed).
export const resendVendorCredentials = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const business = await Business.findById(req.params.id);
    if (!business || business.status !== 'approved' || !business.vendorUser) {
      return res.status(400).json({ message: 'Only approved vendors have login details.' });
    }
    const user = await User.findById(business.vendorUser);
    if (!user || !user.email) return res.status(404).json({ message: 'Vendor account not found' });

    const tempPassword = generateTempPassword();
    user.password = tempPassword;
    user.mustChangePassword = true;
    user.failedLoginAttempts = 0;
    user.lockUntil = undefined;
    await user.save();
    await revokeAllUserRefreshTokens(user._id as any);

    try {
      await sendVendorCredentialsEmail({
        to: user.email,
        ownerName: user.fullName,
        storeName: business.name,
        vendorCode: user.vendorCode || business.vendorCode || '',
        tempPassword,
        isReset: true,
      });
      business.credentialsEmailStatus = 'sent';
      business.credentialsSentAt = new Date();
      await business.save();
    } catch (mailErr: any) {
      business.credentialsEmailStatus = 'failed';
      await business.save();
      return res.status(502).json({ message: 'Password was reset but the e-mail could not be sent. Check the SMTP settings and try again.' });
    }
    return res.status(200).json({ message: 'New login details were e-mailed to the vendor.', business: sanitizeBusiness(business) });
  } catch (err: any) {
    return res.status(500).json({ message: 'Failed to resend login details', error: err.message });
  }
};

export const rejectBusiness = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const { reason } = req.body;
    if (!reason || !reason.trim()) {
      return res.status(400).json({ message: 'Rejection reason is required' });
    }

    const business = await Business.findById(req.params.id);
    if (!business) return res.status(404).json({ message: 'Business not found' });
    if (business.status === 'approved' && business.vendorUser) {
      return res.status(400).json({ message: 'An approved vendor cannot be rejected.' });
    }

    business.status = 'rejected';
    business.rejectionReason = reason.trim();
    business.reviewedBy = req.user?.userId as any;
    business.reviewedAt = new Date();
    await business.save();

    return res.status(200).json({ message: 'Business rejected', business: sanitizeBusiness(business) });
  } catch (err: any) {
    return res.status(500).json({ message: 'Failed to reject business', error: err.message });
  }
};

export const deleteBusiness = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const existing = await Business.findById(req.params.id);
    if (!existing) return res.status(404).json({ message: 'Business not found' });
    if (existing.vendorUser || (await Product.exists({ vendor: existing._id }))) {
      return res.status(400).json({ message: 'An approved vendor with an account or products cannot be deleted.' });
    }
    await Business.findByIdAndDelete(req.params.id);
    return res.status(200).json({ message: 'Business deleted' });
  } catch (err: any) {
    return res.status(500).json({ message: 'Failed to delete business', error: err.message });
  }
};

// Admin-only: opens one KYC document. Cloudinary docs -> JSON { url } (signed link);
// local docs -> the file itself (the admin UI fetches it with the auth header).
export const getBusinessDocument = async (req: Request, res: Response): Promise<any> => {
  try {
    const business = await Business.findById(req.params.id).select('documents').lean<IBusiness>();
    const doc: any = business?.documents?.find((d: any) => String(d._id) === String(req.params.docId));
    if (!doc) return res.status(404).json({ message: 'Document not found' });

    const access = getVendorDocumentAccess(doc);
    if (access.kind === 'url') return res.status(200).json({ url: access.url });
    if (access.kind === 'file') {
      res.setHeader('Content-Type', access.mimeType);
      res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(access.downloadName)}"`);
      return res.sendFile(access.absolutePath);
    }
    return res.status(404).json({ message: 'The stored file is no longer available' });
  } catch (err: any) {
    return res.status(500).json({ message: 'Failed to open document', error: err.message });
  }
};
