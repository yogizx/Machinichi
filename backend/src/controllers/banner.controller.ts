import { Response, NextFunction } from 'express';
import { Banner } from '../models/Banner';
import { AuthRequest } from '../middlewares/auth.middleware';
import { sendSuccess, sendError } from '../services/apiResponse';
import { createBannerSchema, updateBannerSchema } from '../validators';
import { Types } from 'mongoose';
import fs from 'fs';
import path from 'path';

// Helper to safely delete local uploaded files when replaced or deleted
const deleteLocalFile = (fileUrl: string) => {
  if (!fileUrl) return;
  if (fileUrl.includes('/uploads/')) {
    try {
      const parts = fileUrl.split('/uploads/');
      const filename = parts[parts.length - 1];
      const filePath = path.join(__dirname, '../../uploads', filename);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        console.log(`[FILE CLEANUP] Successfully deleted file: ${filename}`);
      }
    } catch (err: any) {
      console.error(`[FILE CLEANUP] Error unlinking file: ${err.message}`);
    }
  }
};

// Fetch only active banners for public homepage (Home.jsx) carousel
export const getActiveBanners = async (_req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const banners = await Banner.find({
      isActive: true,
      $and: [
        {
          $or: [
            { startDate: { $exists: false } },
            { startDate: null },
            { startDate: { $lte: new Date() } },
          ],
        },
        {
          $or: [
            { endDate: { $exists: false } },
            { endDate: null },
            { endDate: { $gte: new Date() } },
          ],
        },
      ],
    }).sort({ order: 1, createdAt: -1 });

    sendSuccess(res, { data: banners });
  } catch (error) {
    next(error);
  }
};

// Fetch all banners for admin control list (Bannerimage.jsx)
export const getAllBanners = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user?.isAdmin) {
      return sendError(res, 'Admin access required', 403);
    }

    const banners = await Banner.find().sort({ order: 1, createdAt: -1 });
    sendSuccess(res, { data: banners });
  } catch (error) {
    next(error);
  }
};

export const getBannerById = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const banner = await Banner.findById(req.params.id);
    if (!banner) return sendError(res, 'Banner not found', 404);
    sendSuccess(res, { data: banner });
  } catch (error) {
    next(error);
  }
};

// Create a banner record
export const createBanner = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user?.isAdmin) {
      return sendError(res, 'Admin access required', 403);
    }

    const validation = createBannerSchema.safeParse(req.body);
    if (!validation.success) {
      return sendError(res, 'Validation failed', 400, validation.error.issues);
    }

    const nextOrder = await Banner.countDocuments();

    // Map new WebP fields into legacy fields for DB backward compatibility
    const banner = await Banner.create({
      ...validation.data,
      title: validation.data.bigText || 'Banner',
      subtitle: validation.data.smallText || '',
      image: validation.data.imageWebp,
      imageUrl: validation.data.imageFallback,
      position: 'home', // standard positioning string
      order: validation.data.order ?? nextOrder,
      createdBy: new Types.ObjectId(req.user.userId),
    } as any);

    sendSuccess(res, { data: banner }, 201);
  } catch (error) {
    next(error);
  }
};

// Update an individual banner configuration
export const updateBanner = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user?.isAdmin) {
      return sendError(res, 'Admin access required', 403);
    }

    const validation = updateBannerSchema.safeParse(req.body);
    if (!validation.success) {
      return sendError(res, 'Validation failed', 400, validation.error.issues);
    }

    const currentBanner = await Banner.findById(req.params.id);
    if (!currentBanner) return sendError(res, 'Banner not found', 404);

    // Clean up replaced local images
    if (validation.data.imageWebp && validation.data.imageWebp !== currentBanner.imageWebp) {
      deleteLocalFile(currentBanner.imageWebp);
    }
    if (validation.data.imageFallback && validation.data.imageFallback !== currentBanner.imageFallback) {
      deleteLocalFile(currentBanner.imageFallback);
    }

    // Auto-map legacy fields if newer fields are changing
    const updatePayload: any = {
      ...validation.data,
      updatedBy: new Types.ObjectId(req.user.userId)
    };

    if (validation.data.bigText !== undefined) {
      updatePayload.title = validation.data.bigText || 'Banner';
    }
    if (validation.data.smallText !== undefined) {
      updatePayload.subtitle = validation.data.smallText || '';
    }
    if (validation.data.imageWebp !== undefined) {
      updatePayload.image = validation.data.imageWebp;
    }
    if (validation.data.imageFallback !== undefined) {
      updatePayload.imageUrl = validation.data.imageFallback;
    }

    const banner = await Banner.findByIdAndUpdate(
      req.params.id,
      updatePayload,
      { new: true }
    );

    sendSuccess(res, { data: banner });
  } catch (error) {
    next(error);
  }
};

// Delete a banner record and its files
export const deleteBanner = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user?.isAdmin) {
      return sendError(res, 'Admin access required', 403);
    }

    const banner = await Banner.findById(req.params.id);
    if (!banner) return sendError(res, 'Banner not found', 404);

    // Clean up local images
    deleteLocalFile(banner.imageWebp);
    deleteLocalFile(banner.imageFallback);

    await Banner.findByIdAndDelete(req.params.id);

    sendSuccess(res, { message: 'Banner deleted' });
  } catch (error) {
    next(error);
  }
};

// Bulk update display orders during reorder Drag & Drop operations
export const reorderBanners = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user?.isAdmin) {
      return sendError(res, 'Admin access required', 403);
    }

    const { reorders } = req.body;
    if (!Array.isArray(reorders)) {
      return sendError(res, 'Invalid payload: reorders list is required', 400);
    }

    const bulkOps = reorders.map((item: { id: string; order: number }) => ({
      updateOne: {
        filter: { _id: new Types.ObjectId(item.id) },
        update: { $set: { order: item.order } },
      },
    }));

    await Banner.bulkWrite(bulkOps);

    sendSuccess(res, { message: 'Banner order updated successfully' });
  } catch (error) {
    next(error);
  }
};
