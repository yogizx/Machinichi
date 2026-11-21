import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { addRealtimeClient, removeRealtimeClient } from '../services/realtime.service';
import { authMiddleware, adminMiddleware, AuthRequest } from '../middlewares/auth.middleware';
import { JWT_CONFIG } from '../config/jwt';
import { User } from '../models/User';

const router = Router();

// A browser EventSource cannot send an Authorization header, so an admin first asks for a short-lived,
// single-purpose ticket through a normal authenticated request and then opens the stream with it.
// The ticket is signed with a key derived from the server secret that is DIFFERENT from the login-token key,
// so a ticket can never be used as a login token (and a login token can never be used as a ticket).
const STREAM_TICKET_SECRET = crypto
  .createHmac('sha256', JWT_CONFIG.ACCESS_SECRET)
  .update('product-analytics-stream-ticket')
  .digest('hex');

router.post('/product-analytics/ticket', authMiddleware, adminMiddleware, (req: AuthRequest, res: Response) => {
  const ticket = jwt.sign({ purpose: 'product-analytics-stream', userId: req.user!.userId }, STREAM_TICKET_SECRET, {
    expiresIn: '60s',
  });
  res.status(200).json({ success: true, ticket });
});

// Admin-only SSE stream for product analytics.
// Frontend Detailed View subscribes to this to get real-time card updates.
router.get('/product-analytics/stream', async (req: Request, res: Response) => {
  try {
    const ticket = typeof req.query.ticket === 'string' ? req.query.ticket : '';
    const decoded = jwt.verify(ticket, STREAM_TICKET_SECRET) as any;
    if (decoded.purpose !== 'product-analytics-stream') throw new Error('wrong ticket');

    const admin = await User.findById(decoded.userId).select('role isDeleted isActive');
    if (!admin || admin.isDeleted || !admin.isActive || !['admin', 'super_admin'].includes(admin.role)) {
      throw new Error('not an admin');
    }
  } catch {
    res.status(401).json({ success: false, message: 'Access denied.' });
    return;
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  // CORS headers are already set by global cors middleware; need to flush
  res.flushHeaders?.();

  const idsParam = typeof req.query.ids === 'string' ? req.query.ids : undefined;
  const ids = idsParam
    ? idsParam.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 200)
    : undefined;

  const client = addRealtimeClient(res, ids);

  // keep-alive ping
  const ping = setInterval(() => {
    try { res.write(`: ping\n\n`); } catch { clearInterval(ping); }
  }, 25000);

  req.on('close', () => {
    clearInterval(ping);
    removeRealtimeClient(client);
    res.end();
  });
});

export default router;
