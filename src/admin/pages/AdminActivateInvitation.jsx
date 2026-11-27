import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, Copy, ShieldCheck, Smartphone } from 'lucide-react';
import { ErrorBanner, Field, PrimaryButton, Spinner, apiErrorMessage, inputClass } from '../components/StaffUi';
import api from '../../services/api';
import { qrMatrix, qrPath } from '../../utils/qr';

/**
 * QR code for the authenticator setup. It is drawn in the browser from the otpauth:// link the server returned -
 * the secret is never sent to any QR-code web service. Always black on white with a quiet zone so every scanner
 * reads it, regardless of the page theme.
 */
function QrCode({ value }) {
  const qr = useMemo(() => {
    try {
      const matrix = qrMatrix(value);
      return { size: matrix.length + 8, path: qrPath(matrix, 4) };
    } catch {
      return null;
    }
  }, [value]);

  if (!qr) return null;
  return (
    <svg
      viewBox={`0 0 ${qr.size} ${qr.size}`}
      role="img"
      aria-label="QR code for setting up your authenticator app"
      shapeRendering="crispEdges"
      className="h-52 w-52 rounded-[12px] border border-[#eadfd7] bg-white"
    >
      <rect width={qr.size} height={qr.size} fill="#ffffff" />
      <path d={qr.path} fill="#000000" />
    </svg>
  );
}

/**
 * Public page opened from the invitation e-mail:  /admin/activate-invitation#token=...
 * 1. validate the single-use link   2. choose a password   3. enrol an authenticator app   4. save recovery codes
 * The token lives in the URL fragment (never sent to a server) and is removed from the address bar immediately.
 */
export default function AdminActivateInvitation() {
  const [step, setStep] = useState('checking'); // checking | invalid | password | mfa | done
  const [token, setToken] = useState('');
  const [invite, setInvite] = useState(null);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [setup, setSetup] = useState(null);
  const [code, setCode] = useState('');
  const [recoveryCodes, setRecoveryCodes] = useState([]);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const t = params.get('token') || '';
    // Remove the token from the address bar / history straight away.
    window.history.replaceState(null, '', window.location.pathname);
    if (!t) { setStep('invalid'); return; }
    setToken(t);
    api.post('/admin/staff/invitations/validate', { token: t })
      .then(({ data }) => { setInvite(data.data); setStep('password'); })
      .catch((err) => { setError(apiErrorMessage(err, 'This invitation is invalid or has expired.')); setStep('invalid'); });
  }, []);

  const checks = [
    { ok: password.length >= 12, text: 'At least 12 characters' },
    { ok: [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((r) => r.test(password)).length >= 3, text: 'Three of: lowercase, uppercase, number, symbol' },
    { ok: confirm.length > 0 && password === confirm, text: 'Both passwords match' },
  ];

  const startSetup = async () => {
    setError('');
    if (!checks.every((c) => c.ok)) { setError('Please meet all password requirements.'); return; }
    setBusy(true);
    try {
      const { data } = await api.post('/admin/staff/invitations/start', { token, password });
      setSetup(data.data);
      setPassword('');
      setConfirm('');
      setStep('mfa');
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not continue.'));
    } finally { setBusy(false); }
  };

  const finish = async () => {
    setError('');
    if (!/^\d{6}$/.test(code)) { setError('Enter the 6-digit code from your authenticator app.'); return; }
    setBusy(true);
    try {
      const { data } = await api.post('/admin/staff/invitations/complete', { setupToken: setup.setupToken, code });
      setRecoveryCodes(data.recoveryCodes || []);
      setSetup(null);
      setStep('done');
    } catch (err) {
      setError(apiErrorMessage(err, 'That code was not accepted.'));
    } finally { setBusy(false); }
  };

  const copy = async (text, key) => {
    try { await navigator.clipboard.writeText(text); setCopied(key); setTimeout(() => setCopied(''), 2000); } catch { /* clipboard unavailable */ }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#fffaf5] px-4 py-10">
      <div className="w-full max-w-lg rounded-[20px] border border-[#eadfd7] bg-white p-8 shadow-[0_24px_60px_rgba(80,40,10,0.1)]">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#fff1e4] text-[#ad4d00]"><ShieldCheck size={24} /></div>
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[#ad4d00]">Machinichi Admin</p>
            <h1 className="font-['Playfair_Display',serif] text-[26px] font-black text-[#27201c]">Activate your account</h1>
          </div>
        </div>

        {step === 'checking' && <Spinner className="py-10" />}

        {step === 'invalid' && (
          <div className="py-4 text-center">
            <p className="text-[15px] font-bold text-[#27201c]">{error || 'This invitation is invalid or has expired.'}</p>
            <p className="mt-2 text-[13px] text-[#796d66]">Invitation links work once. Ask your administrator to send a new one.</p>
            <Link to="/admin/login" className="mt-6 inline-block text-[13px] font-black text-[#ad4d00] underline">Go to sign in</Link>
          </div>
        )}

        {step === 'password' && invite && (
          <div>
            <p className="text-[14px] leading-6 text-[#5a3322]">Hello <b>{invite.fullName}</b>, you have been invited as <b>{invite.roleName}</b> ({invite.email}). Choose a password to continue.</p>
            <div className="mt-5 space-y-4">
              <ErrorBanner message={error} />
              <Field label="New password"><input className={inputClass} type="password" autoComplete="new-password" value={password} maxLength={128} onChange={(e) => setPassword(e.target.value)} /></Field>
              <Field label="Confirm password"><input className={inputClass} type="password" autoComplete="new-password" value={confirm} maxLength={128} onChange={(e) => setConfirm(e.target.value)} /></Field>
              <ul className="space-y-1 text-[12px]">
                {checks.map((c) => <li key={c.text} className={c.ok ? 'font-bold text-emerald-700' : 'text-[#988b84]'}>{c.ok ? '✓' : '○'} {c.text}</li>)}
              </ul>
              <PrimaryButton className="w-full" onClick={startSetup} disabled={busy}>{busy ? 'Please wait…' : 'Continue'}</PrimaryButton>
            </div>
          </div>
        )}

        {step === 'mfa' && setup && (
          <div>
            <div className="flex items-start gap-3 rounded-[12px] bg-[#fff8f1] p-4 text-[13px] leading-5 text-[#5a3322]">
              <Smartphone size={20} className="mt-0.5 shrink-0 text-[#ad4d00]" />
              <p>Two-step verification is required. Open an authenticator app (Google Authenticator, Microsoft Authenticator, Authy…) and <b>scan the QR code</b> below. This screen is valid for {Math.round(setup.expiresInSeconds / 60)} minutes.</p>
            </div>

            <div className="mt-5 flex flex-col items-center">
              <QrCode value={setup.otpauthUrl} />
              <p className="mt-2 text-[12px] font-semibold text-[#796d66]">Scan this code with your authenticator app</p>
            </div>

            <div className="mt-5">
              <p className="text-[12px] font-black uppercase tracking-[0.08em] text-[#5a3322]">Can’t scan? Enter this setup key instead</p>
              <div className="mt-1.5 flex items-center gap-2">
                <code className="flex-1 break-all rounded-[10px] border border-[#eadfd7] bg-[#fbf8f5] px-3 py-2.5 font-mono text-[14px] tracking-wider text-[#27201c]">{setup.manualKey.match(/.{1,4}/g)?.join(' ')}</code>
                <button type="button" onClick={() => copy(setup.manualKey, 'key')} className="flex h-10 w-10 items-center justify-center rounded-full border border-[#eadfd7] text-[#5a3322] hover:border-[#fd761a]" aria-label="Copy setup key"><Copy size={16} /></button>
              </div>
              {copied === 'key' && <p className="mt-1 text-[12px] font-bold text-emerald-700">Copied</p>}
              <a href={setup.otpauthUrl} className="mt-2 inline-block text-[12px] font-bold text-[#ad4d00] underline">Using this phone? Open directly in your authenticator app</a>
            </div>
            <div className="mt-5 space-y-4">
              <ErrorBanner message={error} />
              <Field label="6-digit code from the app">
                <input className={`${inputClass} text-center font-mono text-[20px] tracking-[0.4em]`} inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} placeholder="••••••" />
              </Field>
              <p className="text-[12px] leading-5 text-[#796d66]">Codes depend on the time. If a correct-looking code is rejected, make sure date &amp; time are set to <b>automatic</b> on your phone and on the computer that runs the server.</p>
              <PrimaryButton className="w-full" onClick={finish} disabled={busy}>{busy ? 'Verifying…' : 'Verify and activate'}</PrimaryButton>
            </div>
          </div>
        )}

        {step === 'done' && (
          <div>
            <div className="flex items-center gap-2 text-emerald-700"><CheckCircle2 size={22} /><p className="text-[16px] font-black">Your account is active</p></div>
            <p className="mt-3 text-[13px] leading-6 text-[#5a3322]">Save these recovery codes somewhere safe. Each works once if you lose your phone. <b>They are shown only now.</b></p>
            <div className="mt-3 grid grid-cols-2 gap-2 rounded-[12px] border border-[#eadfd7] bg-[#fbf8f5] p-4 font-mono text-[14px] text-[#27201c]">
              {recoveryCodes.map((c) => <span key={c}>{c}</span>)}
            </div>
            <button type="button" onClick={() => copy(recoveryCodes.join('\n'), 'codes')} className="mt-2 text-[12px] font-bold text-[#ad4d00] underline">{copied === 'codes' ? 'Copied' : 'Copy all codes'}</button>
            <label className="mt-5 flex items-center gap-2 text-[13px] font-semibold text-[#5a3322]">
              <input type="checkbox" className="h-4 w-4 accent-[#ad4d00]" checked={saved} onChange={(e) => setSaved(e.target.checked)} /> I have saved my recovery codes
            </label>
            <Link to="/admin/login" aria-disabled={!saved} onClick={(e) => { if (!saved) e.preventDefault(); }}
              className={`mt-5 inline-flex h-11 w-full items-center justify-center rounded-full text-[13px] font-black text-white ${saved ? 'bg-[#fd761a] hover:bg-[#ea6d17]' : 'cursor-not-allowed bg-[#e6c9b3]'}`}>
              Continue to sign in
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
