import { AsyncLocalStorage } from 'async_hooks';

/**
 * Per-request vendor context (multi-vendor marketplace).
 *
 * `authenticateVendor` runs the rest of a vendor request inside this store.
 * The Product model reads it when a NEW product is validated, so every product a
 * vendor creates is stamped with that vendor's business id automatically — without
 * touching the shared admin controllers. Outside vendor requests the store is
 * undefined, so admin / storefront behaviour is unchanged.
 */
export interface TenantStore {
  vendorId: string; // Business _id
  userId: string;   // vendor User _id
}

export const tenantContext = new AsyncLocalStorage<TenantStore>();

export const getTenant = (): TenantStore | undefined => tenantContext.getStore();
