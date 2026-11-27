import express, { Router } from 'express';
import cookieParser from 'cookie-parser';
import adminAuthRoutes from '../../src/routes/adminAuth.routes';
import staffRoutes from '../../src/routes/staff.routes';
import adminRoutes from '../../src/routes/admin.routes';
import businessRoutes from '../../src/routes/business.routes';
import orderRoutes from '../../src/routes/order.routes';
import returnRoutes from '../../src/routes/return.routes';

export const routers = { adminAuthRoutes, staffRoutes, adminRoutes, businessRoutes, orderRoutes, returnRoutes };

/** The same routers, in the same order, as production (staff before the generic admin router). */
export function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/api/admin/auth', adminAuthRoutes);
  app.use('/api/admin/businesses', businessRoutes);
  const api = Router();
  api.use('/admin/staff', staffRoutes);
  api.use('/admin', adminRoutes);
  api.use('/orders', orderRoutes);
  api.use('/returns', returnRoutes);
  app.use('/api', api);
  app.use((err: any, _req: any, res: any, _next: any) => {
    res.status(500).json({ success: false, message: 'Internal error', detail: String(err?.message || err) });
  });
  return app;
}

interface Layer { route?: { path: string; methods: Record<string, boolean>; stack: Array<{ handle: any }> }; handle?: any }

/** Every concrete route registered on a router (recursing into nested routers) with its handler chain. */
export function collectRoutes(router: any, prefix = ''): Array<{ method: string; path: string; handlers: any[] }> {
  const out: Array<{ method: string; path: string; handlers: any[] }> = [];
  for (const layer of (router.stack || []) as Layer[]) {
    if (layer.route) {
      const method = Object.keys(layer.route.methods)[0]?.toUpperCase();
      out.push({ method, path: prefix + layer.route.path, handlers: layer.route.stack.map((l) => l.handle) });
    } else if (layer.handle?.stack) {
      out.push(...collectRoutes(layer.handle, prefix));
    }
  }
  return out;
}
