import { Response, NextFunction } from 'express';
import { Types } from 'mongoose';
import {
  TrustBar,
  ITrustBarItem,
  TRUST_BAR_ICON_KEYS,
  MAX_TRUST_BAR_ITEMS,
} from '../models/TrustBar';
import { AuthRequest } from '../middlewares/auth.middleware';
import { sendSuccess, sendError } from '../services/apiResponse';

const TITLE_MAX = 40;
const SUBTITLE_MAX = 60;

const toPublic = (items: ITrustBarItem[]) =>
  items.map(({ icon, title, subtitle }) => ({ icon, title, subtitle: subtitle || '' }));

// Public + admin read: the saved highlights bar. Nothing saved yet = no items (the home page then hides the bar).
export const getTrustBar = async (_req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const doc = await TrustBar.findOne().sort({ updatedAt: -1 });
    const items = doc ? toPublic(doc.items) : [];
    sendSuccess(res, { data: { items, isActive: doc ? doc.isActive : true } });
  } catch (error) {
    next(error);
  }
};

// Admin: create / update the highlights bar (single document).
export const saveTrustBar = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user?.isAdmin) return sendError(res, 'Admin access required', 403);

    const { items, isActive } = req.body || {};
    if (!Array.isArray(items) || items.length > MAX_TRUST_BAR_ITEMS) {
      return sendError(res, `Add up to ${MAX_TRUST_BAR_ITEMS} highlights.`, 400);
    }

    const clean: ITrustBarItem[] = [];
    for (let i = 0; i < items.length; i++) {
      const raw = items[i] || {};
      const icon = typeof raw.icon === 'string' ? raw.icon.trim() : '';
      const title = typeof raw.title === 'string' ? raw.title.trim() : '';
      const subtitle = typeof raw.subtitle === 'string' ? raw.subtitle.trim() : '';

      if (!(TRUST_BAR_ICON_KEYS as readonly string[]).includes(icon)) {
        return sendError(res, `Highlight ${i + 1}: please choose a valid icon.`, 400);
      }
      if (!title) return sendError(res, `Highlight ${i + 1}: title is required.`, 400);
      if (title.length > TITLE_MAX) {
        return sendError(res, `Highlight ${i + 1}: title must be ${TITLE_MAX} characters or fewer.`, 400);
      }
      if (subtitle.length > SUBTITLE_MAX) {
        return sendError(res, `Highlight ${i + 1}: subtitle must be ${SUBTITLE_MAX} characters or fewer.`, 400);
      }
      clean.push({ icon, title, subtitle });
    }

    const existing = await TrustBar.findOne().sort({ updatedAt: -1 });
    const payload = {
      items: clean,
      isActive: typeof isActive === 'boolean' ? isActive : (existing?.isActive ?? true),
      updatedBy: new Types.ObjectId(req.user.userId),
    };

    const doc = existing
      ? await TrustBar.findByIdAndUpdate(existing._id, payload, { new: true })
      : await TrustBar.create(payload);

    sendSuccess(res, { data: { items: toPublic(doc!.items), isActive: doc!.isActive } });
  } catch (error) {
    next(error);
  }
};
