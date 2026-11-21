import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middlewares/auth.middleware';
import { requirePermission, requireAnyPermission } from '../middlewares/permission.middleware';
import {
  getActiveBanners,
  getAllBanners,
  getBannerById,
  createBanner,
  updateBanner,
  deleteBanner,
  reorderBanners,
} from '../controllers/banner.controller';
import {
  getActivePopup,
  getPopupAdmin,
  savePopup,
  deletePopup,
  uploadPopupImage,
} from '../controllers/popup.controller';
import { uploadDisk } from '../middlewares/upload.middleware';
import { getTrustBar, saveTrustBar } from '../controllers/trustBar.controller';
import { cloudinary, isCloudinaryConfigured, CLOUDINARY_FOLDERS } from '../config/cloudinary';
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const router = Router();

// Public route to fetch only active banners
router.get('/active', getActiveBanners);

// Home page popup (declared before the '/:id' routes so 'popup' is never read as a banner id)
router.get('/popup/active', getActivePopup);
router.get('/popup', authMiddleware, requirePermission('content.homepage.view'), getPopupAdmin);
router.put('/popup', authMiddleware, requirePermission('content.homepage.edit'), savePopup);
router.delete('/popup', authMiddleware, requirePermission('content.homepage.edit'), deletePopup);
router.post('/popup/upload', authMiddleware, requirePermission('content.homepage.edit'), uploadDisk.single('file'), uploadPopupImage);

// Banner highlights bar ("100% Natural", "Pan India Delivery" ...) - also declared before '/:id'
router.get('/trust-bar', getTrustBar);
router.put('/trust-bar', authMiddleware, requirePermission('content.homepage.edit'), saveTrustBar);

// Protected Admin CRUD operations
router.get('/all', authMiddleware, requirePermission('marketing.banner.view'), getAllBanners);
router.get('/:id', getBannerById);
router.post('/', authMiddleware, requirePermission('marketing.banner.create'), createBanner);
router.put('/:id', authMiddleware, requirePermission('marketing.banner.edit'), updateBanner);
router.delete('/:id', authMiddleware, requirePermission('marketing.banner.delete'), deleteBanner);

// Secure bulk reorder route
router.patch('/reorder', authMiddleware, requirePermission('marketing.banner.edit'), reorderBanners);

// Secure image uploader that processes uploaded images to WebP and JPEG fallback formats
router.post(
  '/upload',
  authMiddleware,
  requireAnyPermission(['marketing.banner.create', 'marketing.banner.edit']),
  uploadDisk.single('file'),
  async (req: Request, res: Response): Promise<any> => {
    try {
      if (!req.file) {
        return res.status(400).json({ success: false, message: 'No file uploaded' });
      }

      const uploadsDir = path.join(__dirname, '../../uploads');
      
      // Ensure the uploads directory exists
      if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true });
      }

      const timestamp = Date.now();
      const random = Math.round(Math.random() * 1e9);
      
      const webpFilename = `${timestamp}-${random}-optimized.webp`;
      const fallbackFilename = `${timestamp}-${random}-fallback.jpg`;

      const webpPath = path.join(uploadsDir, webpFilename);
      const fallbackPath = path.join(uploadsDir, fallbackFilename);

      // Process and optimize WebP copy using sharp (resizing to recommended 1920x800)
      await sharp(req.file.path)
        .resize({
          width: 1920,
          height: 800,
          fit: 'cover',
          withoutEnlargement: true
        })
        .webp({ quality: 80 })
        .toFile(webpPath);

      // Process and optimize JPEG fallback copy using sharp
      await sharp(req.file.path)
        .resize({
          width: 1920,
          height: 800,
          fit: 'cover',
          withoutEnlargement: true
        })
        .jpeg({ quality: 80 })
        .toFile(fallbackPath);

      // Securely delete the original temporary multer upload file
      if (fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }

      // Push the optimized images to Cloudinary (public, CDN-delivered URLs).
      // Falls back to legacy local /uploads URLs when Cloudinary is not configured.
      let imageWebp: string;
      let imageFallback: string;
      if (isCloudinaryConfigured) {
        const uploadAsset = async (filePath: string) => {
          const result = await cloudinary.uploader.upload(filePath, {
            folder: CLOUDINARY_FOLDERS.banners,
            resource_type: 'image',
            allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
            overwrite: true,
          });
          if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
          return result.secure_url;
        };
        [imageWebp, imageFallback] = await Promise.all([
          uploadAsset(webpPath),
          uploadAsset(fallbackPath),
        ]);
      } else {
        const base = process.env.API_URL || process.env.PUBLIC_URL || 'http://localhost:3000';
        imageWebp = `${base.replace(/\/$/, '')}/uploads/${webpFilename}`;
        imageFallback = `${base.replace(/\/$/, '')}/uploads/${fallbackFilename}`;
      }

      return res.json({
        success: true,
        imageWebp,
        imageFallback
      });
    } catch (err: any) {
      console.error(`[UPLOAD PROCESSING ERROR] ${err.message}`);
      
      // Attempt cleanup on failure
      if (req.file && fs.existsSync(req.file.path)) {
        try {
          fs.unlinkSync(req.file.path);
        } catch (_) {}
      }

      return res.status(500).json({
        success: false,
        message: `Image optimization failed: ${err.message}`
      });
    }
  }
);

export default router;
