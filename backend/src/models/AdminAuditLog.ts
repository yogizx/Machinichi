import mongoose, { Schema } from 'mongoose';

/**
 * Append-only audit trail of security-relevant administrative events.
 *
 * SECURITY:
 *  - Records are written only by the server (services/audit.service.ts). There is no API to edit or delete them.
 *  - Mongoose middleware below refuses updates and deletes made through the application, so even a coding
 *    mistake or an injected request cannot rewrite history. (For defence in depth, also give the application's
 *    MongoDB user insert + find rights only on this collection - see docs/RBAC_DEPLOYMENT.md.)
 *  - Secrets (passwords, OTPs, tokens) are redacted before a record is created.
 */
export interface IAdminAuditLog extends mongoose.Document {
  actorId?: mongoose.Types.ObjectId;     // absent when the actor is unknown (e.g. failed login for an unknown e-mail)
  targetUserId?: mongoose.Types.ObjectId;
  action: string;                        // e.g. 'sub_admin.invited', 'permission.added', 'authz.denied'
  module: string;                        // e.g. 'admin', 'product', 'auth'
  outcome: 'success' | 'denied' | 'failure';
  resourceId?: string;
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, any>;
  createdAt: Date;
}

const adminAuditLogSchema = new Schema<IAdminAuditLog>({
  actorId: { type: Schema.Types.ObjectId, ref: 'User', index: true },
  targetUserId: { type: Schema.Types.ObjectId, ref: 'User', index: true },
  action: { type: String, required: true, index: true },
  module: { type: String, required: true, index: true },
  outcome: { type: String, enum: ['success', 'denied', 'failure'], default: 'success', index: true },
  resourceId: { type: String },
  ipAddress: { type: String },
  userAgent: { type: String },
  metadata: { type: Schema.Types.Mixed },
}, { timestamps: { createdAt: true, updatedAt: false } });

adminAuditLogSchema.index({ createdAt: -1 });
adminAuditLogSchema.index({ actorId: 1, createdAt: -1 });
adminAuditLogSchema.index({ targetUserId: 1, createdAt: -1 });

const IMMUTABLE_MESSAGE = 'Audit logs are append-only and cannot be modified or deleted.';

const refuse = async function () {
  throw new Error(IMMUTABLE_MESSAGE);
};

// Existing documents may never be re-saved.
adminAuditLogSchema.pre('save', async function () {
  if (!this.isNew) throw new Error(IMMUTABLE_MESSAGE);
});

// Query-level writes (update / replace / delete) are refused outright.
const BLOCKED_QUERY_OPS = [
  'updateOne', 'updateMany', 'replaceOne',
  'findOneAndUpdate', 'findOneAndReplace', 'findOneAndDelete',
  'deleteOne', 'deleteMany',
] as const;
for (const op of BLOCKED_QUERY_OPS) {
  adminAuditLogSchema.pre(op as any, refuse as any);
}
// Document-level deleteOne()
adminAuditLogSchema.pre('deleteOne', { document: true, query: false } as any, refuse as any);

export const AdminAuditLog = mongoose.model<IAdminAuditLog>('AdminAuditLog', adminAuditLogSchema);
