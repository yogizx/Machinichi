import { Response, NextFunction } from 'express';
import { Types } from 'mongoose';
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { Popup } from '../models/Popup';
import { AuthRequest } from '../middlewares/auth.middleware';
import { sendSuccess, sendError } from '../services/apiResponse';
import { cloudinary, isCloudinaryConfigured, CLOUDINARY_FOLDERS } from '../config/cloudinary';

// Only allow in-site paths ("/product") or absolute http(s) URLs. Blocks javascript:, data:, etc.
const isSafeLink = (value: string): boolean => {
  const v = value.trim();
  if (!v) return true;
  if (v.startsWith('/') && !v.startsWith('//')) return true;
  return /^https?:\/\/\S+$/i.test(v);
};

const isSafeImageUrl = (value: string): boolean => /^https?:\/\/\S+$/i.test(value.trim());

const deleteLocalFile = (fileUrl?: string) => {
  if (!fileUrl || !fileUrl.includes('/uploads/')) return;
  try {
    const filename = fileUrl.split('/uploads/').pop() as string;
    const filePath = path.join(__dirname, '../../uploads', filename);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch (err: any) {
    console.error(`[POPUP CLEANUP] ${err.message}`);
  }
};

// Public: the popup shown on the storefront home page (null when none / disabled).
export const getActivePopup = async (_req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const popup = await Popup.findOne({ isActive: true, imageUrl: { $exists: true, $ne: '' } }).sort({ updatedAt: -1 });
    sendSuccess(res, { data: popup || null });
  } catch (error) {
    next(error);
  }
};

// Admin: current popup configuration (null when nothing saved yet).
export const getPopupAdmin = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user?.isAdmin) return sendError(res, 'Admin access required', 403);
    const popup = await Popup.findOne().sort({ updatedAt: -1 });
    sendSuccess(res, { data: popup || null });
  } catch (error) {
    next(error);
  }
};

// Admin: create / update the popup (single document).
export const savePopup = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user?.isAdmin) return sendError(res, 'Admin access required', 403);

    const { imageUrl, linkUrl, isActive } = req.body || {};
    const existing = await Popup.findOne().sort({ updatedAt: -1 });

    const nextImage = typeof imageUrl === 'string' ? imageUrl.trim() : existing?.imageUrl;
    if (!nextImage) return sendError(res, 'Please upload a popup image before saving.', 400);
    if (!isSafeImageUrl(nextImage)) return sendError(res, 'Invalid popup image URL.', 400);

    const nextLink = typeof linkUrl === 'string' ? linkUrl.trim() : (existing?.linkUrl || '');
    if (!isSafeLink(nextLink)) {
      return sendError(res, 'Popup URL must start with http://, https:// or "/" (for example /product).', 400);
    }

    const payload = {
      imageUrl: nextImage,
      linkUrl: nextLink,
      isActive: typeof isActive === 'boolean' ? isActive : (existing?.isActive ?? true),
      updatedBy: new Types.ObjectId(req.user.userId),
    };

    let popup;
    if (existing) {
      if (existing.imageUrl !== nextImage) deleteLocalFile(existing.imageUrl);
      popup = await Popup.findByIdAndUpdate(existing._id, payload, { new: true });
    } else {
      popup = await Popup.create(payload);
    }

    sendSuccess(res, { data: popup });
  } catch (error) {
    next(error);
  }
};

// Admin: remove the popup completely.
export const deletePopup = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user?.isAdmin) return sendError(res, 'Admin access required', 403);
    const existing = await Popup.findOne().sort({ updatedAt: -1 });
    if (existing) {
      deleteLocalFile(existing.imageUrl);
      await Popup.deleteMany({});
    }
    sendSuccess(res, { message: 'Popup removed' });
  } catch (error) {
    next(error);
  }
};

// Admin: upload + optimise the popup image (multer disk upload -> sharp -> Cloudinary / local).
export const uploadPopupImage = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }

    const uploadsDir = path.join(__dirname, '../../uploads');
    if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

    const filename = `${Date.now()}-${Math.round(Math.random() * 1e9)}-popup.webp`;
    const outPath = path.join(uploadsDir, filename);

    await sharp(req.file.path)
      .resize({ width: 1200, height: 1200, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 85 })
      .toFile(outPath);

    if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);

    let imageUrl: string;
    if (isCloudinaryConfigured) {
      const result = await cloudinary.uploader.upload(outPath, {
        folder: CLOUDINARY_FOLDERS.banners,
        resource_type: 'image',
        allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
        overwrite: true,
      });
      if (fs.existsSync(outPath)) fs.unlinkSync(outPath);
      imageUrl = result.secure_url;
    } else {
      const base = process.env.API_URL || process.env.PUBLIC_URL || 'http://localhost:3000';
      imageUrl = `${base.replace(/\/$/, '')}/uploads/${filename}`;
    }

    return res.json({ success: true, imageUrl });
  } catch (err: any) {
    console.error(`[POPUP UPLOAD ERROR] ${err.message}`);
    if (req.file && fs.existsSync(req.file.path)) {
      try { fs.unlinkSync(req.file.path); } catch (_) { /* ignore */ }
    }
    return res.status(500).json({ success: false, message: `Image upload failed: ${err.message}` });
  }
};
