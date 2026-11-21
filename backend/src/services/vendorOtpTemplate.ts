import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import type { SendMailOptions } from 'nodemailer';
import { cloudinary, isCloudinaryConfigured } from '../config/cloudinary';

/**
 * "Verify Your Email Address" mail for the public vendor application form.
 * Table-based layout (works in Gmail / Outlook / Apple Mail). Every picture is attached inline (cid:)
 * so it shows without depending on a public URL. Illustrations come from backend/public/email-assets;
 * they are shrunk once (and cached) so the mail stays small and sends quickly.
 *
 * "Copy Code": mail apps never run JavaScript, so the button opens the small page
 * public/email-assets/copy-code.html (served at /api/email-assets/copy-code.html). That page copies the
 * code to the clipboard and turns the button green with "Copied". The code travels in the URL #fragment,
 * which browsers never send to any server.
 */

// backend/src/services -> backend/public/email-assets (same depth when compiled to backend/dist/services)
const ASSET_DIR = path.resolve(__dirname, '../../public/email-assets');

const esc = (v: string): string =>
  String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

type Attachments = NonNullable<SendMailOptions['attachments']>;

export interface VendorOtpMail {
  html: string;
  text: string;
  attachments: Attachments;
}

// width = 2x the size it is shown at in the mail (sharp, retina-sharp but light)
const FILE_ASSETS: Array<{ file: string; cid: string; width: number }> = [
  { file: 'envelope-illustration.png', cid: 'mch-envelope', width: 660 },
  { file: 'leaf-asset.png', cid: 'mch-leaf', width: 260 },
  { file: 'windmill-bg.png', cid: 'mch-windmill', width: 260 },
  { file: 'grain-bags-footer.png', cid: 'mch-footer', width: 1200 },
];

const shrunk = new Map<string, Promise<Buffer | null>>();
const getShrunk = (file: string, width: number): Promise<Buffer | null> => {
  const key = `${file}@${width}`;
  let job = shrunk.get(key);
  if (!job) {
    job = sharp(path.join(ASSET_DIR, file))
      .resize({ width, withoutEnlargement: true })
      .png({ compressionLevel: 9, palette: true, quality: 85, effort: 7 })
      .toBuffer()
      .catch((err: any) => {
        console.warn(`[VENDOR OTP] could not shrink ${file}:`, err?.message);
        return null; // the original file is attached instead
      });
    shrunk.set(key, job);
  }
  return job;
};

// Public address of the copy page (the backend serves /api/email-assets).
const getApiBase = (): string =>
  (process.env.API_URL || process.env.API_BASE_URL || `http://localhost:${process.env.PORT || 3000}`)
    .replace(/\/+$/, '')
    .replace(/\/api$/, '');

// Mail apps can only load pictures from a public https address (never localhost).
const getHostedBase = (): string | null => {
  const base = getApiBase();
  return /^https:\/\//i.test(base) && !/^https:\/\/(localhost|127\.0\.0\.1)/i.test(base) ? base : null;
};

// Gmail lists pictures that are attached to a mail as attachments ("noname"). A picture that lives at a public
// https address is not an attachment, so when Cloudinary is configured each picture is uploaded there once
// (fixed public id, so it is never uploaded twice) and the mail only links to it. Works from localhost too.
const cloudUrls = new Map<string, Promise<string | null>>();
const getCloudinaryUrl = (cid: string, data: Buffer): Promise<string | null> => {
  let job = cloudUrls.get(cid);
  if (!job) {
    job = new Promise<string | null>((resolve) => {
      cloudinary.uploader
        .upload_stream(
          { folder: 'machinichi/email', public_id: `${cid}-v1`, resource_type: 'image', overwrite: false },
          (err: any, result: any) => {
            if (err || !result?.secure_url) {
              console.warn(`[VENDOR OTP] could not upload ${cid} to Cloudinary:`, err?.message || 'no url returned');
              cloudUrls.delete(cid); // try again on the next mail
              return resolve(null);
            }
            resolve(result.secure_url as string);
          },
        )
        .end(data);
    });
    cloudUrls.set(cid, job);
  }
  return job;
};

export const getCopyCodeUrl = (otp: string): string => `${getApiBase()}/api/email-assets/copy-code.html#${otp}`;

export const buildVendorOtpEmail = async (otp: string, validMinutes: number): Promise<VendorOtpMail> => {
  const attachments: Attachments = [];
  const have = new Set<string>();
  const urls = new Map<string, string>();
  // Gmail lists every cid-attached picture as a mail attachment. When the API has a public https address the
  // pictures are loaded from it instead (light copies cached in public/email-assets/mail), so nothing is attached.
  const hostedBase = getHostedBase();

  for (const a of FILE_ASSETS) {
    const original = path.join(ASSET_DIR, a.file);
    if (!fs.existsSync(original)) continue;
    const small = await getShrunk(a.file, a.width);

    if (hostedBase && small) {
      try {
        const outDir = path.join(ASSET_DIR, 'mail');
        const outName = `${a.cid}.png`;
        const outFile = path.join(outDir, outName);
        if (!fs.existsSync(outFile)) {
          fs.mkdirSync(outDir, { recursive: true });
          fs.writeFileSync(outFile, small);
        }
        urls.set(a.cid, `${hostedBase}/api/email-assets/mail/${outName}`);
        have.add(a.cid);
        continue;
      } catch (err: any) {
        console.warn(`[VENDOR OTP] could not host ${a.file}, attaching it instead:`, err?.message);
      }
    }

    if (!hostedBase && isCloudinaryConfigured && small) {
      const url = await getCloudinaryUrl(a.cid, small);
      if (url) {
        urls.set(a.cid, url);
        have.add(a.cid);
        continue;
      }
    }

    // No filename on purpose: inline pictures that carry a filename are listed as "attachments" by Gmail.
    attachments.push(
      small
        ? { filename: false as const, content: small, contentType: 'image/png', cid: a.cid, contentDisposition: 'inline' }
        : { filename: false as const, path: original, contentType: 'image/png', cid: a.cid, contentDisposition: 'inline' },
    );
    have.add(a.cid);
  }

  const img = (cid: string, width: number, extra = '') =>
    have.has(cid)
      ? `<img src="${urls.get(cid) || `cid:${cid}`}" width="${width}" alt="" style="display:block;border:0;outline:none;height:auto;${extra}" />`
      : '';

  const SERIF = "Georgia,'Times New Roman',serif";
  const SANS = "'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

  const digitCells = otp
    .split('')
    .map(
      (d, i) =>
        `${i > 0 ? '<td width="10" style="font-size:0;line-height:0;">&nbsp;</td>' : ''}` +
        `<td width="50" height="60" align="center" valign="middle" bgcolor="#ffffff" style="width:50px;height:60px;background:#ffffff;border:1px solid #f0a266;border-radius:12px;font-family:${SERIF};font-size:32px;font-weight:700;color:#3a1a0a;">${esc(d)}</td>`,
    )
    .join('');

  // small rounded square with an orange glyph (plain text glyphs render in every mail client)
  const glyphBox = (glyph: string) =>
    `<td width="38" height="38" align="center" valign="middle" bgcolor="#fdeedd" style="width:38px;height:38px;background:#fdeedd;border-radius:10px;font-family:${SANS};font-size:20px;line-height:20px;font-weight:700;color:#ea6d17;">${glyph}</td>`;

  const infoItem = (glyph: string, content: string) => `
    <table role="presentation" cellpadding="0" cellspacing="0"><tr>
      ${glyphBox(glyph)}
      <td style="padding-left:12px;font-family:${SANS};font-size:15px;color:#3d3029;">${content}</td>
    </tr></table>`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="color-scheme" content="light" />
  <title>Verify Your Email Address - Machinichi</title>
</head>
<body style="margin:0;padding:0;background:#f6e6d8;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">Your Machinichi vendor verification code is ${esc(otp)}. Valid for ${validMinutes} minutes.</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#f6e6d8" style="background:#f6e6d8;">
    <tr><td align="center" style="padding:28px 12px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" bgcolor="#fffaf4" style="width:100%;max-width:600px;background:#fffaf4;border-radius:28px;overflow:hidden;box-shadow:0 18px 50px rgba(120,72,36,0.16);">

        <!-- leaf · wordmark · windmill -->
        <tr><td style="padding:0;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
            <td width="130" valign="top" align="left" style="line-height:0;font-size:0;">${img('mch-leaf', 130)}</td>
            <td valign="middle" align="center" style="padding:26px 0 0 0;">
              <div style="font-family:${SERIF};font-size:44px;font-weight:700;line-height:1;color:#4a1d0a;">Machini<span style="color:#ea6d17;">chi</span></div>
              <table role="presentation" cellpadding="0" cellspacing="0" align="center" style="margin-top:10px;"><tr>
                <td width="26" style="border-top:1px solid #d9a77c;font-size:0;line-height:0;">&nbsp;</td>
                <td style="padding:0 10px;font-family:${SANS};font-size:11px;letter-spacing:3px;color:#4a2c1a;white-space:nowrap;">The Modern General Store</td>
                <td width="26" style="border-top:1px solid #d9a77c;font-size:0;line-height:0;">&nbsp;</td>
              </tr></table>
            </td>
            <td width="130" valign="top" align="right" style="line-height:0;font-size:0;">${img('mch-windmill', 130, 'margin-left:auto;')}</td>
          </tr></table>
        </td></tr>

        <!-- envelope -->
        <tr><td align="center" style="padding:8px 24px 0 24px;line-height:0;font-size:0;">${img('mch-envelope', 330, 'margin:0 auto;')}</td></tr>

        <!-- Vendor Registration pill -->
        <tr><td align="center" style="padding:14px 40px 0 40px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
            <td style="border-top:1px solid #f0a266;font-size:0;line-height:0;">&nbsp;</td>
            <td width="1" style="padding:0 10px;white-space:nowrap;">
              <table role="presentation" cellpadding="0" cellspacing="0"><tr>
                <td bgcolor="#fdeedd" style="background:#fdeedd;border-radius:22px;padding:9px 22px;font-family:${SANS};font-size:15px;font-weight:700;color:#4a1d0a;white-space:nowrap;">Vendor Registration</td>
              </tr></table>
            </td>
            <td style="border-top:1px solid #f0a266;font-size:0;line-height:0;">&nbsp;</td>
          </tr></table>
        </td></tr>

        <!-- heading -->
        <tr><td align="center" style="padding:18px 32px 0 32px;">
          <h1 style="margin:0;font-family:${SERIF};font-size:36px;line-height:1.15;font-weight:700;color:#4a1d0a;">Verify Your Email Address</h1>
          <p style="margin:12px 0 0 0;font-family:${SANS};font-size:16px;line-height:1.55;color:#4a5568;">Use the one-time password (OTP) below to verify your email and complete your Machinichi vendor registration.</p>
        </td></tr>

        <!-- code panel -->
        <tr><td style="padding:24px 28px 0 28px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#fceedf" style="background:#fceedf;border-radius:20px;">
            <tr><td align="center" style="padding:24px 12px 0 12px;font-family:${SANS};font-size:17px;font-weight:700;color:#3a1a0a;">Your Verification Code</td></tr>
            <tr><td align="center" style="padding:16px 12px 28px 12px;">
              <table role="presentation" cellpadding="0" cellspacing="0" align="center"><tr>${digitCells}</tr></table>
            </td></tr>
          </table>
        </td></tr>

        <!-- valid / one-time -->
        <tr><td align="center" style="padding:22px 24px 0 24px;">
          <table role="presentation" cellpadding="0" cellspacing="0" align="center"><tr>
            <td>${infoItem('&#9719;', `Valid for <strong style="color:#ea6d17;">${validMinutes} minutes</strong>`)}</td>
            <td width="1" bgcolor="#ecd9c8" style="width:1px;background:#ecd9c8;font-size:0;">&nbsp;</td>
            <td style="padding-left:22px;">${infoItem('&#8635;', 'One-time use only')}</td>
          </tr></table>
        </td></tr>

        <!-- do not share -->
        <tr><td style="padding:18px 40px 0 40px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#fbeee2" style="background:#fbeee2;border-radius:16px;">
            <tr><td align="center" style="padding:12px 16px;">
              <table role="presentation" cellpadding="0" cellspacing="0" align="center"><tr>
                ${glyphBox('&#10003;')}
                <td style="padding-left:12px;font-family:${SANS};font-size:15px;color:#3a1a0a;">Please don&rsquo;t share this code with anyone.</td>
              </tr></table>
            </td></tr>
          </table>
        </td></tr>

        <!-- sign-off -->
        <tr><td align="left" style="padding:26px 40px 0 40px;">
          <div style="font-family:${SANS};font-size:16px;color:#3d3029;">Thanks,</div>
          <div style="margin-top:4px;font-family:${SERIF};font-size:22px;font-weight:700;color:#3a1a0a;">The Machinichi Team</div>
          <table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:8px;"><tr><td width="64" height="3" bgcolor="#ea6d17" style="width:64px;height:3px;background:#ea6d17;font-size:0;line-height:0;">&nbsp;</td></tr></table>
        </td></tr>

        <!-- footer artwork -->
        <tr><td style="padding:0;line-height:0;font-size:0;">${img('mch-footer', 600, 'width:100%;margin-top:-28px;')}</td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const text = [
    'Verify Your Email Address',
    '',
    `Your Machinichi vendor application verification code is: ${otp}`,
    `It is valid for ${validMinutes} minutes and can be used only once.`,
    '',
    'Please do not share this code with anyone.',
    'If you did not request this, you can ignore this e-mail.',
    '',
    'Thanks,',
    'The Machinichi Team',
  ].join('\n');

  return { html, text, attachments };
};
