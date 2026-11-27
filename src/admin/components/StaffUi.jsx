import { useEffect } from 'react';
import { AlertTriangle, X, Loader2 } from 'lucide-react';

/** Small shared UI pieces for the Staff & Access Management screens (Machinichi design system). */

export const apiErrorMessage = (err, fallback = 'Something went wrong. Please try again.') => {
  const data = err?.response?.data;
  if (data?.errors?.length) return data.errors.map((e) => `${e.field ? `${e.field}: ` : ''}${e.message}`).join(' · ');
  return data?.message || fallback;
};

export const formatDate = (value, withTime = false) => {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return withTime
    ? d.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

export function PageHeader({ title, subtitle, action }) {
  return (
    <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 className="font-['Playfair_Display',serif] text-[30px] font-black tracking-[-0.02em] text-[#27201c]">{title}</h1>
        {subtitle && <p className="mt-1 text-[14px] text-[#796d66]">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function PrimaryButton({ children, className = '', ...props }) {
  return (
    <button
      type="button"
      {...props}
      className={`inline-flex h-11 items-center justify-center gap-2 rounded-full bg-[#fd761a] px-6 text-[13px] font-black text-white shadow-[0_10px_22px_rgba(253,118,26,0.25)] transition hover:-translate-y-0.5 hover:bg-[#ea6d17] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0 ${className}`}
    >
      {children}
    </button>
  );
}

export function SecondaryButton({ children, className = '', ...props }) {
  return (
    <button
      type="button"
      {...props}
      className={`inline-flex h-11 items-center justify-center gap-2 rounded-full border border-[#eadfd7] bg-white px-5 text-[13px] font-black text-[#5a3322] transition hover:border-[#fd761a] hover:text-[#ad4d00] disabled:cursor-not-allowed disabled:opacity-60 ${className}`}
    >
      {children}
    </button>
  );
}

export function Spinner({ className = 'py-16' }) {
  return (
    <div className={`flex items-center justify-center ${className}`}>
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#eadfd7] border-t-[#fd761a]" />
    </div>
  );
}

export function ErrorBanner({ message, onRetry }) {
  if (!message) return null;
  return (
    <div role="alert" className="mb-5 flex items-start justify-between gap-3 rounded-[10px] border border-[#f1c8bd] bg-[#fff4f0] px-4 py-3 text-[14px] font-semibold text-[#9b2f15]">
      <span className="flex items-start gap-2"><AlertTriangle size={16} className="mt-0.5 shrink-0" />{message}</span>
      {onRetry && <button type="button" onClick={onRetry} className="shrink-0 text-[13px] font-black underline">Retry</button>}
    </div>
  );
}

export function SuccessBanner({ message }) {
  if (!message) return null;
  return (
    <div role="status" className="mb-5 rounded-[10px] border border-emerald-200 bg-emerald-50 px-4 py-3 text-[14px] font-semibold text-emerald-800">
      {message}
    </div>
  );
}

export function Modal({ title, onClose, children, footer, wide = false, busy = false }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !busy) onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, busy]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label={title}>
      <div className={`flex max-h-[92vh] w-full flex-col rounded-[16px] bg-white shadow-[0_24px_60px_rgba(25,12,6,0.28)] ${wide ? 'max-w-5xl' : 'max-w-lg'}`}>
        <div className="flex items-center justify-between border-b border-[#eadfd7] px-6 py-4">
          <h2 className="text-[20px] font-black text-[#27201c]">{title}</h2>
          <button type="button" onClick={onClose} disabled={busy} className="flex h-8 w-8 items-center justify-center rounded-full text-[#796d66] hover:bg-[#fff8f1] disabled:opacity-50" aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div className="overflow-y-auto px-6 py-5">{children}</div>
        {footer && <div className="flex flex-wrap items-center justify-end gap-3 border-t border-[#eadfd7] px-6 py-4">{footer}</div>}
      </div>
    </div>
  );
}

export function ConfirmDialog({ title, message, confirmLabel = 'Confirm', danger = false, busy = false, onConfirm, onCancel, children }) {
  return (
    <Modal
      title={title}
      onClose={onCancel}
      busy={busy}
      footer={(
        <>
          <SecondaryButton onClick={onCancel} disabled={busy}>Cancel</SecondaryButton>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={`inline-flex h-11 items-center justify-center gap-2 rounded-full px-6 text-[13px] font-black text-white transition disabled:opacity-60 ${danger ? 'bg-[#b3361b] hover:bg-[#8f2a15]' : 'bg-[#fd761a] hover:bg-[#ea6d17]'}`}
          >
            {busy && <Loader2 size={15} className="animate-spin" />}
            {confirmLabel}
          </button>
        </>
      )}
    >
      <p className="text-[14px] leading-6 text-[#5a3322]">{message}</p>
      {children}
    </Modal>
  );
}

export const inputClass =
  'w-full rounded-[10px] border border-[#eadfd7] bg-white px-4 py-2.5 text-[14px] text-[#27201c] outline-none placeholder:text-[#b6a79e] focus:border-[#fd761a] focus:shadow-[0_0_0_4px_rgba(253,118,26,0.1)] disabled:bg-[#fbf8f5] disabled:text-[#988b84]';

export function Field({ label, hint, error, children }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[12px] font-black uppercase tracking-[0.08em] text-[#5a3322]">{label}</span>
      {children}
      {hint && !error && <span className="mt-1 block text-[12px] text-[#988b84]">{hint}</span>}
      {error && <span className="mt-1 block text-[12px] font-semibold text-[#b3361b]">{error}</span>}
    </label>
  );
}
