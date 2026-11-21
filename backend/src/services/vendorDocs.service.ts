import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { cloudinary, isCloudinaryConfigured } from '../config/cloudinary';
import { IBusinessDocument, VendorDocType } from '../models/Business';

/**
 * Vendor KYC documents (GST certificate, PAN, ID proof ...).
 *
 * These are sensitive, so they are NOT stored in the public /uploads folder or as public
 * Cloudinary assets:
 *   - Cloudinary configured  -> uploaded with type "authenticated" (needs a signed URL)
 *   - otherwise              -> saved to backend/private-uploads/vendor-docs (never served statically)
 * Only the admin endpoint in business.controller can hand them out.
 */
const LOCAL_DIR = path.join(__dirname, '../../private-uploads/vendor-docs');

export const ALLOWED_DOC_MIME = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
export const MAX_DOC_BYTES = 2 * 1024 * 1024;

const EXT_BY_MIME: Record<string, string> = {
  'application/pdf': '.pdf',
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

export async function storeVendorDocument(
  file: Express.Multer.File,
  type: VendorDocType,
  label?: string,
): Promise<IBusinessDocument> {
  const ext = EXT_BY_MIME[file.mimetype] || '';
  const id = crypto.randomBytes(16).toString('hex');
  const base = {
    type,
    label,
    originalName: path.basename(file.originalname).slice(0, 150),
    mimeType: file.mimetype,
    size: file.size,
    uploadedAt: new Date(),
  };

  if (isCloudinaryConfigured) {
    const isPdf = file.mimetype === 'application/pdf';
    const result: any = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder: 'machinichi/vendor-docs',
          type: 'authenticated',
          resource_type: isPdf ? 'raw' : 'image',
          public_id: isPdf ? `${id}${ext}` : id, // raw assets keep their extension in the public id
        },
        (err, res) => (err ? reject(err) : resolve(res)),
      );
      stream.end(file.buffer);
    });
    return { ...base, storage: 'cloudinary', publicId: result.public_id, resourceType: result.resource_type } as IBusinessDocument;
  }

  fs.mkdirSync(LOCAL_DIR, { recursive: true });
  const filename = `${id}${ext}`;
  fs.writeFileSync(path.join(LOCAL_DIR, filename), file.buffer);
  return { ...base, storage: 'local', filename } as IBusinessDocument;
}

export type DocumentAccess =
  | { kind: 'url'; url: string }
  | { kind: 'file'; absolutePath: string; mimeType: string; downloadName: string }
  | { kind: 'missing' };

export function getVendorDocumentAccess(doc: IBusinessDocument): DocumentAccess {
  if (doc.storage === 'cloudinary' && doc.publicId) {
    const url = cloudinary.url(doc.publicId, {
      resource_type: doc.resourceType || 'image',
      type: 'authenticated',
      sign_url: true,
      secure: true,
    });
    return { kind: 'url', url };
  }
  if (doc.storage === 'local' && doc.filename) {
    // basename() guards against a tampered filename escaping the folder
    const absolutePath = path.join(LOCAL_DIR, path.basename(doc.filename));
    if (fs.existsSync(absolutePath)) {
      return { kind: 'file', absolutePath, mimeType: doc.mimeType, downloadName: doc.originalName };
    }
  }
  return { kind: 'missing' };
}
