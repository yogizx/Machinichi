import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
dotenv.config();

let _transporter: nodemailer.Transporter | null = null;
let _isMock = false;

const logTransport = {
  name: 'log-transport',
  version: '1.0.0',
  send: (mail: any, callback: any) => {
    const envelope = mail.data.envelope || mail.message.getEnvelope();
    const messageId = mail.message.getHeader('message-id') || 'mock-message-id';
    console.log(`\n=================== [MOCK EMAIL LOG] ===================`);
    console.log(`From:    ${mail.data.from}`);
    console.log(`To:      ${mail.data.to}`);
    console.log(`Subject: ${mail.data.subject}`);
    console.log(`--------------------------------------------------------`);
    const htmlContent = mail.data.html || '';
    const textContent = mail.data.text || '';
    if (textContent) {
      console.log(textContent);
    } else {
      const cleanText = htmlContent
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '') // remove styles
        .replace(/<[^>]*>/g, ' ')                      // remove tags
        .replace(/\s+/g, ' ')                          // normalize spaces
        .trim();
      console.log(cleanText);
    }
    console.log(`========================================================\n`);

    const info = {
      envelope,
      messageId,
      accepted: [mail.data.to].flat(),
      rejected: [],
      pending: [],
      response: '250 OK'
    };
    callback(null, info);
  },
  verify: (callback: any) => {
    callback(null, true);
  }
};

const hasSmtpConfig = (): boolean => {
  return !!(
    process.env.SMTP_HOST &&
    process.env.SMTP_PORT &&
    process.env.SMTP_EMAIL &&
    process.env.SMTP_PASSWORD &&
    process.env.EMAIL_FROM
  );
};

const getTransporter = (): nodemailer.Transporter => {
  if (!_transporter) {
    if (!hasSmtpConfig()) {
      _isMock = true;
      _transporter = nodemailer.createTransport(logTransport as any);
    } else {
      _isMock = false;
      const host = process.env.SMTP_HOST || 'smtp.gmail.com';
      const port = Number(process.env.SMTP_PORT) || 587;
      if (host.includes('gmail.com')) {
        _transporter = nodemailer.createTransport({
          service: 'gmail',
          auth: {
            user: process.env.SMTP_EMAIL,
            pass: process.env.SMTP_PASSWORD,
          },
          connectionTimeout: 15000,
          greetingTimeout: 10000,
          socketTimeout: 15000,
        });
      } else {
        _transporter = nodemailer.createTransport({
          host,
          port,
          secure: port === 465,
          requireTLS: port === 587,
          auth: {
            user: process.env.SMTP_EMAIL,
            pass: process.env.SMTP_PASSWORD,
          },
          connectionTimeout: 15000,
          greetingTimeout: 10000,
          socketTimeout: 15000,
        });
      }
    }
  }
  return _transporter;
};

export const verifySmtpConfig = async (): Promise<boolean> => {
  const smtpHost = process.env.SMTP_HOST;
  const smtpPort = process.env.SMTP_PORT;
  const smtpUser = process.env.SMTP_EMAIL;
  const smtpPass = process.env.SMTP_PASSWORD;
  const emailFrom = process.env.EMAIL_FROM;

  console.log(`[SMTP STARTUP] SMTP_HOST configured: ${smtpHost ? 'YES' : 'NO'}`);
  console.log(`[SMTP STARTUP] SMTP_PORT configured: ${smtpPort ? 'YES' : 'NO'}`);
  console.log(`[SMTP STARTUP] SMTP_EMAIL configured: ${smtpUser ? 'YES' : 'NO'}`);
  console.log(`[SMTP STARTUP] SMTP_PASSWORD configured: ${smtpPass ? 'YES' : 'NO'}`);
  console.log(`[SMTP STARTUP] EMAIL_FROM configured: ${emailFrom ? 'YES' : 'NO'}`);

  if (!hasSmtpConfig()) {
    console.warn(`[SMTP STARTUP] Missing SMTP settings. Emails will not be sent until the SMTP configuration is corrected.`);
    _isMock = true;
    _transporter = null;
    return false;
  }

  try {
    _isMock = false;
    _transporter = null;
    const transporter = getTransporter();
    await transporter.verify();
    console.log(`[SMTP STARTUP] CONNECTION SUCCESSFUL - SMTP is ready`);
    return true;
  } catch (err: any) {
    console.error(`[SMTP STARTUP] CONNECTION FAILED - Reason: ${err.message}`);
    if (process.env.SMTP_HOST?.includes('gmail.com') && /Username and Password not accepted/i.test(err.message)) {
      console.error('[SMTP STARTUP] Gmail authentication failed. Verify SMTP_EMAIL and SMTP_PASSWORD are correct and use a valid Gmail App Password if 2-Step Verification is enabled.');
    }
    _transporter = null;
    return false;
  }
};

const BRAND = {
  name: 'Machinichi',
  tagline: 'The Modern General Store',
  primaryColor: '#ad4d00',
  secondaryColor: '#3a1100',
  bgLight: '#f6efe7',
  bgCard: '#ffffff',
  textDark: '#17120f',
  textMuted: '#6f7b91',
  accent: '#a68135',
};

// Escapes text that came from a user before it is placed into the HTML of an e-mail.
const escapeHtml = (value: string): string =>
  String(value ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as Record<string, string>
  )[c]);

const clientUrl = (): string => process.env.CLIENT_URL || 'http://localhost:5173';

const emailHead = `
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light only">
<title>${BRAND.name}</title>`;

const emailStyles = `
<style>
  body, table, td, p, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
  body { margin: 0; padding: 0; width: 100% !important; background-color: ${BRAND.bgLight}; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; -webkit-font-smoothing: antialiased; }
  table { border-collapse: collapse; }
  .greeting { margin: 0 0 10px; font-size: 24px; font-weight: 800; letter-spacing: -0.02em; line-height: 1.25; color: ${BRAND.textDark}; }
  .text { margin: 0 0 16px; font-size: 15px; line-height: 1.7; color: #3d3834; }
  .text-muted { margin: 0 0 16px; font-size: 13px; line-height: 1.6; color: ${BRAND.textMuted}; }
  .cta-wrapper { text-align: center; margin: 28px 0; }
  .cta { display: inline-block; padding: 15px 42px; background-color: ${BRAND.primaryColor}; color: #ffffff !important; text-decoration: none; border-radius: 999px; font-size: 16px; font-weight: 800; letter-spacing: 0.02em; }
  .pill { display: inline-block; padding: 8px 16px; background-color: #fff3e6; border: 1px solid #f3dcc4; border-radius: 999px; font-size: 13px; font-weight: 700; color: #8a3b00; }
  .security-badge { background-color: #fff8f0; border: 1px solid #f0e4d6; border-left: 4px solid ${BRAND.primaryColor}; border-radius: 10px; padding: 14px 16px; margin: 24px 0; font-size: 13px; line-height: 1.6; color: ${BRAND.textMuted}; }
  .security-badge strong { color: ${BRAND.secondaryColor}; }
  .support-section { margin-top: 24px; padding-top: 18px; border-top: 1px solid #efe5da; }
  .support-text { margin: 0; font-size: 13px; line-height: 1.6; color: ${BRAND.textMuted}; }
  a { color: ${BRAND.primaryColor}; }
  @media only screen and (max-width: 480px) {
    .px { padding-left: 20px !important; padding-right: 20px !important; }
    .otp-cell { width: 40px !important; height: 52px !important; font-size: 26px !important; }
    .greeting { font-size: 21px !important; }
  }
</style>`;

// The one-time code, one digit per box (inline styles: e-mail clients ignore most CSS).
const otpDigitsHtml = (otp: string): string => {
  const digits = String(otp).split('');
  const cells = digits.map((d, i) => `
      <td class="otp-cell" align="center" width="48" height="60" bgcolor="#fbf5ef" style="width:48px;height:60px;background-color:#fbf5ef;border:2px solid #ecd9c6;border-radius:12px;font-family:'SFMono-Regular',Consolas,'Courier New',monospace;font-size:30px;font-weight:900;color:${BRAND.primaryColor};">${escapeHtml(d)}</td>${i < digits.length - 1 ? '<td width="8" style="width:8px;font-size:0;line-height:0;">&nbsp;</td>' : ''}`).join('');
  return `<table role="presentation" align="center" cellpadding="0" cellspacing="0" border="0" style="margin:28px auto;"><tr>${cells}</tr></table>`;
};

const buildHtml = (content: string, preheader = '') => `
<!DOCTYPE html>
<html lang="en">
<head>${emailHead}${emailStyles}</head>
<body style="margin:0;padding:0;background-color:${BRAND.bgLight};">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(preheader)}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${BRAND.bgLight}" style="background-color:${BRAND.bgLight};">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:560px;">
          <tr>
            <td align="center" bgcolor="${BRAND.secondaryColor}" style="background-color:${BRAND.secondaryColor};border-radius:20px 20px 0 0;padding:32px 24px 28px;">
              <div style="font-size:32px;font-weight:900;letter-spacing:-0.03em;line-height:1;color:#ffffff;">${BRAND.name}<span style="color:#ff9b45;">.</span></div>
              <div style="margin-top:10px;font-size:11px;font-weight:700;letter-spacing:0.2em;text-transform:uppercase;color:#d9c3ad;">${BRAND.tagline}</div>
            </td>
          </tr>
          <tr><td height="4" bgcolor="${BRAND.primaryColor}" style="height:4px;line-height:4px;font-size:0;background-color:${BRAND.primaryColor};">&nbsp;</td></tr>
          <tr>
            <td class="px" bgcolor="#ffffff" style="background-color:#ffffff;padding:38px 44px 14px;">
              ${content}
            </td>
          </tr>
          <tr>
            <td align="center" bgcolor="#faf5ef" style="background-color:#faf5ef;border-top:1px solid #efe5da;border-radius:0 0 20px 20px;padding:26px 32px;">
              <p style="margin:0 0 6px;font-size:13px;font-weight:700;color:${BRAND.secondaryColor};">${BRAND.name} &mdash; ${BRAND.tagline}</p>
              <p style="margin:0;font-size:12px;line-height:1.7;color:#8d837b;">If you didn&rsquo;t request this email, you can safely ignore it or <a href="mailto:support@machinichi.com" style="color:${BRAND.primaryColor};text-decoration:underline;">contact support</a>.</p>
              <p style="margin:14px 0 0;font-size:11px;color:#b3a9a1;">&copy; ${new Date().getFullYear()} ${BRAND.name}. All rights reserved.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

export const sendWelcomeEmail = async (to: string, userName: string) => {
  console.log(`[EMAIL] Welcome email function called`);
  console.log(`[EMAIL] User name: ${userName}`);

  const maskedTo = to.includes('@')
    ? to.split('@')[0].slice(0, 1) + '***@' + to.split('@')[1]
    : '***';
  console.log(`[EMAIL] Recipient: ${maskedTo}`);

  console.log(`[EMAIL] SMTP_HOST configured: ${process.env.SMTP_HOST ? 'YES' : 'NO'}`);
  console.log(`[EMAIL] SMTP_PORT configured: ${process.env.SMTP_PORT ? 'YES' : 'NO'}`);
  console.log(`[EMAIL] SMTP_EMAIL configured: ${process.env.SMTP_EMAIL ? 'YES' : 'NO'}`);
  console.log(`[EMAIL] SMTP_PASSWORD configured: ${process.env.SMTP_PASSWORD ? 'YES' : 'NO'}`);
  console.log(`[EMAIL] EMAIL_FROM configured: ${process.env.EMAIL_FROM ? 'YES' : 'NO'}`);

  if (!hasSmtpConfig()) {
    console.error(`[EMAIL] WELCOME EMAIL FAILED`);
    console.error(`[EMAIL] Reason: One or more SMTP environment variables are missing or invalid`);
    throw new Error('SMTP configuration missing in environment variables');
  }

  const content = `
    <p class="greeting">Hello ${escapeHtml(userName)},</p>
    <p class="text">Welcome to our Machinichi Shop!</p>
    <p class="text">Your account has been created successfully.</p>
    <p class="text">You can now sign in to your Machinichi account using your registered email address and password.</p>
    <p class="text">Thank you for joining Machinichi.</p>
    <div class="cta-wrapper">
      <a href="${clientUrl()}/signin" class="cta">Sign In to Your Account</a>
    </div>
    <p class="text" style="margin-top: 24px;">Regards,<br><strong>Machinichi Team</strong></p>
  `;

  console.log(`[EMAIL] Connecting to SMTP...`);
  const transporter = getTransporter();

  try {
    await transporter.verify();
    console.log(`[EMAIL] SMTP authentication: SUCCESS`);
  } catch (verifyError: any) {
    console.error(`[EMAIL] WELCOME EMAIL FAILED`);
    console.error(`[EMAIL] Error Code: ${verifyError.code || 'UNKNOWN'}`);
    console.error(`[EMAIL] Reason: ${verifyError.message}`);
    throw verifyError;
  }

  console.log(`[EMAIL] Sending welcome email...`);
  const info = await transporter.sendMail({
    from: `"${BRAND.name}" <${process.env.EMAIL_FROM}>`,
    to,
    subject: `Welcome to Machinichi – Your Account Has Been Created Successfully`,
    html: buildHtml(content, 'Your Machinichi account is ready. Sign in and start shopping.'),
  });

  const accepted = !!(info.accepted && info.accepted.includes(to));
  console.log(`[EMAIL] Recipient accepted: ${accepted ? 'YES' : 'NO'}`);
  console.log(`[EMAIL] Message ID: ${info.messageId || 'none'}`);

  if (!accepted) {
    console.error(`[EMAIL] WELCOME EMAIL FAILED`);
    console.error(`[EMAIL] Reason: Recipient was not accepted by SMTP server`);
    throw new Error('Recipient was not accepted by SMTP server');
  }

  console.log(`[EMAIL] WELCOME EMAIL SENT SUCCESSFULLY`);
};

export const sendPasswordResetEmail = async (to: string, resetLink: string, userName?: string) => {
  const greeting = userName ? `Hello ${escapeHtml(userName)},` : 'Hello,';
  const content = `
    <p class="greeting">${greeting}</p>
    <p class="text">We received a request to reset the password for your ${BRAND.name} account. Click the button below to create a new password.</p>
    <p class="text-muted">This link expires in <strong>30 minutes</strong>. If you don't use it within that time, you'll need to request a new one.</p>
    <div class="cta-wrapper">
      <a href="${resetLink}" class="cta">Reset Password</a>
    </div>
    <div class="security-badge">
      <span style="font-size:18px;">🔒</span>
      <span>If you didn't request this, please ignore this email. Your account remains secure.</span>
    </div>
    <div class="support-section">
      <p class="support-text">Need help? <a href="mailto:support@machinichi.com">Contact our support team</a> and we'll be happy to assist.</p>
    </div>
  `;

  await getTransporter().sendMail({
    from: `"${BRAND.name}" <${process.env.EMAIL_FROM}>`,
    to,
    subject: `Reset Your ${BRAND.name} Password`,
    html: buildHtml(content, 'Use the button inside to choose a new password. The link expires in 30 minutes.'),
  });
};

export const sendResetSuccessEmail = async (to: string, userName?: string) => {
  const greeting = userName ? `Hello ${escapeHtml(userName)},` : 'Hello,';
  const content = `
    <p class="greeting">${greeting}</p>
    <p class="text">Your ${BRAND.name} password has been changed successfully.</p>
    <p class="text">If you made this change, no further action is needed. If you did <strong>not</strong> change your password, please secure your account immediately.</p>
    <div class="cta-wrapper">
      <a href="${clientUrl()}/signin" class="cta">Sign In</a>
    </div>
    <div class="security-badge">
      <span style="font-size:18px;">✅</span>
      <span>This is a security confirmation. Keep this email for your records.</span>
    </div>
    <div class="support-section">
      <p class="support-text">If you suspect unauthorized access, contact <a href="mailto:support@machinichi.com">support@machinichi.com</a> immediately.</p>
    </div>
  `;

  await getTransporter().sendMail({
    from: `"${BRAND.name}" <${process.env.EMAIL_FROM}>`,
    to,
    subject: `Password Changed Successfully — ${BRAND.name}`,
    html: buildHtml(content, 'Your password was changed. If this was not you, secure your account now.'),
  });
};

export const sendEmailVerificationEmail = async (to: string, otp: string, userName?: string) => {
  const greeting = userName ? `Hello ${escapeHtml(userName)},` : 'Hello,';
  const content = `
    <p class="greeting">${greeting}</p>
    <p class="text">Thank you for joining ${BRAND.name}! Please verify your email address using the code below.</p>
    ${otpDigitsHtml(otp)}
    <p class="text-muted">This code expires in <strong>10 minutes</strong>. Do not share this code with anyone.</p>
    <div class="security-badge">
      <span style="font-size:18px;">🛡️</span>
      <span>We will never ask for your password or OTP via email or phone.</span>
    </div>
  `;

  await getTransporter().sendMail({
    from: `"${BRAND.name}" <${process.env.EMAIL_FROM}>`,
    to,
    subject: `Verify Your Email — ${BRAND.name}`,
    html: buildHtml(content, 'Your Machinichi email verification code. It expires in 10 minutes.'),
  });
};

// Signup OTP: sent to the e-mail address the user typed. Valid for 5 minutes.
export const sendSignupOtpEmail = async (to: string, otp: string) => {
  if (!hasSmtpConfig() && process.env.NODE_ENV === 'production') {
    throw new Error('SMTP configuration missing in environment variables');
  }

  const content = `
    <p class="greeting">Verify your email address</p>
    <p class="text">Enter the code below on the ${BRAND.name} sign-up page to confirm your email and finish creating your account.</p>
    ${otpDigitsHtml(otp)}
    <div style="text-align:center;margin:0 0 6px;">
      <span class="pill">&#9201;&nbsp; Valid for 5 minutes</span>
    </div>
    <div class="security-badge">
      <strong>Never share this code.</strong> ${BRAND.name} will never ask for your OTP or password by email, phone or chat.
    </div>
    <p class="text-muted">Didn&rsquo;t try to create an account? You can safely ignore this email &mdash; no account will be created without this code.</p>
  `;

  const info = await getTransporter().sendMail({
    from: `"${BRAND.name}" <${process.env.EMAIL_FROM}>`,
    to,
    subject: `Your ${BRAND.name} verification code`,
    text: `Your ${BRAND.name} verification code is ${otp}. It is valid for 5 minutes. Do not share it with anyone.`,
    html: buildHtml(content, `Your ${BRAND.name} verification code - valid for 5 minutes.`),
  });

  if (!(info.accepted && info.accepted.includes(to))) {
    throw new Error('Recipient was not accepted by SMTP server');
  }
};

export const sendGoogleWelcomeEmail = async (to: string, userName: string) => {
  const content = `
    <p class="greeting">Welcome to ${BRAND.name}, ${escapeHtml(userName)}!</p>
    <p class="text">You've successfully signed in with Google. Your account is now linked and ready to use.</p>
    <p class="text">Explore our premium collection of dry fruits, traditional snacks, and everyday essentials curated just for you.</p>
    <div class="cta-wrapper">
      <a href="${clientUrl()}" class="cta">Explore Store</a>
    </div>
    <div class="security-badge">
      <span style="font-size:18px;">🛡️</span>
      <span>This account uses Google authentication. Manage your sign-in methods from your account settings.</span>
    </div>
  `;

  await getTransporter().sendMail({
    from: `"${BRAND.name}" <${process.env.EMAIL_FROM}>`,
    to,
    subject: `Welcome to ${BRAND.name} — Google Sign-In Successful!`,
    html: buildHtml(content),
  });
};

export const sendOTPEmail = async (to: string, otp: string, purpose: string) => {
  const subject = purpose === 'password_reset'
    ? `Reset Your ${BRAND.name} Password`
    : `Verify Your Email — ${BRAND.name}`;

  const content = `
    <p class="text">${purpose === 'password_reset' ? 'Use the code below to reset your password.' : 'Use the code below to verify your account.'}</p>
    ${otpDigitsHtml(otp)}
    <p class="text-muted">This code expires in <strong>10 minutes</strong>. Do not share this code with anyone.</p>
    <div class="security-badge">
      <span style="font-size:18px;">🛡️</span>
      <span>We will never ask for your password or OTP via email or phone.</span>
    </div>
  `;

  await getTransporter().sendMail({
    from: `"${BRAND.name}" <${process.env.EMAIL_FROM}>`,
    to,
    subject,
    html: buildHtml(content),
  });
};

export const sendAnalyticsReportEmail = async (
  to: string,
  reportType: string,
  format: string,
  attachmentBuffer: Buffer,
  fileName: string
) => {
  console.log(`[EMAIL] sendAnalyticsReportEmail called for: ${to}`);

  if (!hasSmtpConfig()) {
    console.error(`[EMAIL] ANALYTICS REPORT EMAIL FAILED - SMTP configuration missing`);
    throw new Error('SMTP configuration missing in environment variables');
  }

  const emailBody = `Hello,

Your requested analytics report has been generated successfully.

Please find the attached report.

Report Type:
${reportType}

Format:
${format}

Generated Date:
${new Date().toLocaleString()}

Thank you,

Machinichi Team`;

  const transporter = getTransporter();
  await transporter.verify();

  const info = await transporter.sendMail({
    from: `"${BRAND.name}" <${process.env.EMAIL_FROM}>`,
    to,
    subject: `Machinichi Analytics Report`,
    text: emailBody,
    html: emailBody.replace(/\n/g, '<br>'),
    attachments: [
      {
        filename: fileName,
        content: attachmentBuffer,
      }
    ]
  });

  const accepted = !!(info.accepted && info.accepted.includes(to));
  if (!accepted) {
    throw new Error('Recipient was not accepted by SMTP server');
  }

  console.log(`[EMAIL] ANALYTICS REPORT EMAIL SENT SUCCESSFULLY to ${to}`);
};

export interface StaffInvitationEmail {
  fullName: string;
  roleName: string;
  inviteUrl: string;
  invitedByName?: string;
  expiresAt: Date;
}

// Staff invitation. The link carries a single-use token in the URL fragment (never sent to servers or logs).
// No password is ever e-mailed: the invitee chooses one and enrols an authenticator app on the activation page.
export const sendStaffInvitationEmail = async (to: string, data: StaffInvitationEmail) => {
  if (!hasSmtpConfig() && process.env.NODE_ENV === 'production') {
    // Never fall back to the console transport in production: it would print the invitation link into the logs.
    throw new Error('SMTP configuration missing in environment variables');
  }

  const hours = Math.max(1, Math.round((data.expiresAt.getTime() - Date.now()) / 3600000));
  const content = `
    <h1 class="greeting">You&rsquo;ve been invited to the ${BRAND.name} admin team</h1>
    <p class="text">Hello ${escapeHtml(data.fullName)},</p>
    <p class="text">${data.invitedByName ? `<strong>${escapeHtml(data.invitedByName)}</strong> has` : 'An administrator has'} invited you to join the ${BRAND.name} admin panel as <span class="pill">${escapeHtml(data.roleName)}</span>.</p>
    <p class="text">To activate your account you will choose a password and set up an authenticator app (two-step verification is required for all staff).</p>
    <div class="cta-wrapper"><a class="cta" href="${escapeHtml(data.inviteUrl)}">Activate my account</a></div>
    <p class="text-muted">This link can be used <strong>once</strong> and expires in about <strong>${hours} hours</strong>.</p>
    <div class="security-badge">
      <span><strong>Security notice:</strong> we will never send your password by email. If you were not expecting this invitation, ignore this message &mdash; the account stays inactive.</span>
    </div>
  `;

  await getTransporter().sendMail({
    from: `"${BRAND.name}" <${process.env.EMAIL_FROM}>`,
    to,
    subject: `You're invited to the ${BRAND.name} admin team`,
    html: buildHtml(content, `Activate your ${BRAND.name} admin account`),
  });
};

export const testTransporter = async () => {
  try {
    await getTransporter().verify();
    console.log('SMTP transporter is ready');
    return true;
  } catch (error) {
    console.error('SMTP transporter verification failed:', error);
    return false;
  }
};
