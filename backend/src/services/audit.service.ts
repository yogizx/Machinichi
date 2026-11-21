import type { Request } from 'express';
import { Types } from 'mongoose';
import { AdminAuditLog } from '../models/AdminAuditLog';

/**
 * Server-side audit trail. Never throws (an audit failure must not break the request), never stores secrets.
 */

export interface AuditInput {
  actorId?: string | Types.ObjectId | null;
  targetUserId?: string | Types.ObjectId | null;
  action: string;
  module: string;
  outcome?: 'success' | 'denied' | 'failure';
  resourceId?: string;
  metadata?: Record<string, any>;
  req?: Request;
}

const SECRET_KEY = /pass(word)?|token|secret|otp|code|authorization|cookie|hash|recovery|mfa/i;
const MAX_DEPTH = 4;
const MAX_STRING = 300;
const MAX_ARRAY = 100;

/** Replaces the value of any key that looks like a credential, and bounds the size of what is stored. */
export function redact(value: any, depth = 0): any {
  if (value === null || value === undefined) return value;
  if (depth > MAX_DEPTH) return '[TRUNCATED]';
  if (typeof value === 'string') return value.length > MAX_STRING ? `${value.slice(0, MAX_STRING)}…` : value;
  if (typeof value !== 'object') return value;
  if (value instanceof Date) return value;
  if (value instanceof Types.ObjectId) return String(value);
  if (Array.isArray(value)) return value.slice(0, MAX_ARRAY).map((v) => redact(v, depth + 1));
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(value)) {
    out[k] = SECRET_KEY.test(k) ? '[REDACTED]' : redact(v, depth + 1);
  }
  return out;
}

export const clientIp = (req?: Request): string | undefined => {
  if (!req) return undefined;
  // req.ip honours Express' "trust proxy" setting; reading X-Forwarded-For directly would be spoofable.
  return req.ip || req.socket?.remoteAddress || undefined;
};

const asObjectId = (id?: string | Types.ObjectId | null): Types.ObjectId | undefined => {
  if (!id) return undefined;
  const s = String(id);
  return Types.ObjectId.isValid(s) && /^[a-f\d]{24}$/i.test(s) ? new Types.ObjectId(s) : undefined;
};

export async function recordAudit(input: AuditInput): Promise<void> {
  try {
    await AdminAuditLog.create({
      actorId: asObjectId(input.actorId),
      targetUserId: asObjectId(input.targetUserId),
      action: input.action,
      module: input.module,
      outcome: input.outcome || 'success',
      resourceId: input.resourceId,
      ipAddress: clientIp(input.req),
      userAgent: input.req?.headers?.['user-agent']?.toString().slice(0, 300),
      metadata: input.metadata ? redact(input.metadata) : undefined,
    });
  } catch (err: any) {
    console.error('[AUDIT] Failed to write audit record:', err?.message || err);
  }
}
