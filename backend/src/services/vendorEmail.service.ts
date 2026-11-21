import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
import { buildVendorOtpEmail } from './vendorOtpTemplate';
dotenv.config();

/**
 * Vendor onboarding e-mails. Uses the same SMTP_* / EMAIL_FROM settings as email.service.ts
 * (kept in its own file so the existing customer e-mails are untouched).
 * Without SMTP settings: production throws (so the admin / applicant is told the mail did not go out),
 * development prints the mail to the console like the existing mock transport.
 */
const hasSmtpConfig = (): boolean =>
  !!(process.env.SMTP_HOST && process.env.SMTP_PORT && process.env.SMTP_EMAIL && process.env.SMTP_PASSWORD && process.env.EMAIL_FROM);

let transporter: nodemailer.Transporter | null = null;
const getTransporter = (): nodemailer.Transporter => {
  if (transporter) return transporter;
  const host = process.env.SMTP_HOST || 'smtp.gmail.com';
  const port = Number(process.env.SMTP_PORT) || 587;
  const auth = { user: process.env.SMTP_EMAIL, pass: process.env.SMTP_PASSWORD };
  const timeouts = { connectionTimeout: 15000, greetingTimeout: 10000, socketTimeout: 15000 };
  transporter = host.includes('gmail.com')
    ? nodemailer.createTransport({ service: 'gmail', auth, ...timeouts })
    : nodemailer.createTransport({ host, port, secure: port === 465, requireTLS: port === 587, auth, ...timeouts });
  return transporter;
};

const esc = (v: string): string =>
  String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export const getVendorLoginUrl = (): string =>
  `${(process.env.CLIENT_URL || 'http://localhost:5173').replace(/\/+$/, '')}/vendor/login`;

// Sends (or, without SMTP in development, prints) one mail. Throws when it could not be delivered.
const deliver = async (opts: {
  to: string;
  subject: string;
  text: string;
  html: string;
  attachments?: nodemailer.SendMailOptions['attachments'];
}): Promise<void> => {
  if (!hasSmtpConfig()) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('SMTP configuration missing in environment variables');
    }
    console.log(`\n=========== [MOCK VENDOR EMAIL] ===========\nTo: ${opts.to}\nSubject: ${opts.subject}\n${opts.text}\n===========================================\n`);
    return;
  }

  const info = await getTransporter().sendMail({
    from: `"Machinichi" <${process.env.EMAIL_FROM}>`,
    to: opts.to,
    subject: opts.subject,
    text: opts.text,
    html: opts.html,
    attachments: opts.attachments,
  });
  if (!(info.accepted && info.accepted.includes(opts.to))) {
    throw new Error('Recipient was not accepted by SMTP server');
  }
};

export interface VendorCredentialsMail {
  to: string;
  ownerName: string;
  storeName: string;
  vendorCode: string;
  tempPassword: string;
  isReset?: boolean;
}

export const sendVendorCredentialsEmail = async (m: VendorCredentialsMail): Promise<void> => {
  const loginUrl = getVendorLoginUrl();
  const subject = m.isReset
    ? 'Your Machinichi vendor login has been reset'
    : 'Your Machinichi vendor account is approved';

  const text = [
    `Hello ${m.ownerName},`,
    '',
    m.isReset
      ? `Your Machinichi vendor login for "${m.storeName}" has been reset by our team.`
      : `Congratulations! "${m.storeName}" has been approved as a Machinichi vendor.`,
    '',
    `Login page : ${loginUrl}`,
    `User ID    : ${m.vendorCode}   (you can also sign in with ${m.to})`,
    `Temporary password : ${m.tempPassword}`,
    '',
    'You will be asked to set a new password the first time you sign in.',
    'Please do not share this e-mail with anyone.',
    '',
    'Machinichi Team',
  ].join('\n');

  const html = `<!DOCTYPE html><html><body style="margin:0;background:#fbf5ef;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;">
  <div style="max-width:520px;margin:32px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 8px 30px rgba(0,0,0,.06);">
    <div style="padding:28px 32px 0;text-align:center;">
      <div style="font-size:28px;font-weight:900;color:#17120f;">Machinichi<span style="color:#ad4d00;">.</span></div>
      <div style="font-size:13px;color:#6f7b91;margin-top:4px;">Vendor Portal</div>
    </div>
    <div style="padding:24px 32px 8px;">
      <p style="font-size:16px;font-weight:700;color:#17120f;margin:0 0 12px;">Hello ${esc(m.ownerName)},</p>
      <p style="font-size:15px;line-height:1.6;color:#3d3834;margin:0 0 16px;">
        ${m.isReset
          ? `Your vendor login for <strong>${esc(m.storeName)}</strong> has been reset by our team.`
          : `Congratulations! <strong>${esc(m.storeName)}</strong> has been approved as a Machinichi vendor.`}
        Use the details below to sign in.
      </p>
      <table style="width:100%;border-collapse:collapse;background:#f8f2ec;border-radius:12px;">
        <tr><td style="padding:12px 16px;font-size:12px;color:#6f7b91;text-transform:uppercase;letter-spacing:.08em;">User ID</td>
            <td style="padding:12px 16px;font-size:16px;font-weight:800;color:#3a1100;font-family:Consolas,monospace;">${esc(m.vendorCode)}</td></tr>
        <tr><td style="padding:12px 16px;font-size:12px;color:#6f7b91;text-transform:uppercase;letter-spacing:.08em;">Temporary password</td>
            <td style="padding:12px 16px;font-size:16px;font-weight:800;color:#3a1100;font-family:Consolas,monospace;">${esc(m.tempPassword)}</td></tr>
      </table>
      <p style="font-size:13px;color:#6f7b91;margin:12px 0 0;">You can also sign in with your e-mail address (${esc(m.to)}).</p>
      <div style="text-align:center;margin:26px 0;">
        <a href="${esc(loginUrl)}" style="display:inline-block;padding:14px 36px;background:#ad4d00;color:#fff;text-decoration:none;border-radius:40px;font-size:16px;font-weight:800;">Open vendor login</a>
      </div>
      <p style="font-size:13px;line-height:1.5;color:#6f7b91;margin:0 0 20px;">
        For your security you will be asked to choose a new password the first time you sign in. Never share this e-mail.
      </p>
    </div>
    <div style="background:#f8f2ec;padding:18px 32px;text-align:center;font-size:12px;color:#a79d96;">
      Machinichi &mdash; The Modern General Store &middot; <a href="mailto:support@machinichi.com" style="color:#ad4d00;text-decoration:none;">support@machinichi.com</a>
    </div>
  </div></body></html>`;

  await deliver({ to: m.to, subject, text, html });
};

// 6-digit code that proves the applicant owns the business e-mail address.
// The layout lives in vendorOtpTemplate.ts (images from backend/public/email-assets are attached inline).
export const sendVendorOtpEmail = async (to: string, otp: string, validMinutes: number): Promise<void> => {
  const subject = `${otp} is your Machinichi vendor verification code`;
  const { html, text, attachments } = await buildVendorOtpEmail(otp, validMinutes);
  await deliver({ to, subject, text, html, attachments });
};
