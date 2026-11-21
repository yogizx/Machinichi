import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { KeyRound, Loader2 } from "lucide-react";
import api from "../../services/api";

const STRONG = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;

// Shown right after the first login: the e-mailed temporary password must be replaced.
export default function VendorChangePassword({ onChanged }) {
  const navigate = useNavigate();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (!STRONG.test(next)) {
      setError("Use at least 8 characters with upper & lower case letters, a number and a special character.");
      return;
    }
    if (next !== confirm) {
      setError("The new passwords do not match.");
      return;
    }
    setLoading(true);
    try {
      const { data } = await api.post(
        "/vendor/auth/change-password",
        { currentPassword: current, newPassword: next },
        { _retry: true }
      );
      if (data.accessToken) localStorage.setItem("accessToken", data.accessToken);
      if (data.refreshToken) localStorage.setItem("refreshToken", data.refreshToken);
      onChanged?.();
      navigate("/vendor/dashboard", { replace: true });
    } catch (err) {
      setError(err.response?.data?.message || "Could not change the password. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const inputClass =
    "h-12 w-full rounded-[10px] border border-[#dfcfc3] bg-[#fcf8f4] px-4 text-[14px] font-semibold text-[#2f2119] outline-none transition placeholder:text-[#aa9a90] focus:border-[#c35416] focus:shadow-[0_0_0_4px_rgba(195,84,22,0.1)]";

  return (
    <div className="grid min-h-screen place-items-center bg-[#fff7f0] px-4 py-10">
      <form onSubmit={submit} noValidate
        className="w-full max-w-[440px] rounded-[18px] border border-[#eaded6] bg-white p-8 shadow-[0_24px_60px_rgba(66,36,18,0.12)]">
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-[10px] bg-[#fff1e8] text-[#c7470a]"><KeyRound size={20} /></span>
          <div>
            <h1 className="text-[20px] font-black tracking-[-0.02em] text-[#2a1409]">Set a new password</h1>
            <p className="text-[12px] text-[#8a7a70]">Replace the temporary password from your e-mail to continue.</p>
          </div>
        </div>

        <div className="mt-6 space-y-4">
          <input className={inputClass} type="password" placeholder="Temporary password" value={current}
            onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" autoFocus />
          <input className={inputClass} type="password" placeholder="New password" value={next}
            onChange={(e) => setNext(e.target.value)} autoComplete="new-password" />
          <input className={inputClass} type="password" placeholder="Confirm new password" value={confirm}
            onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
        </div>

        {error && (
          <p role="alert" className="mt-4 rounded-[10px] border border-red-200 bg-red-50 px-4 py-3 text-[13px] font-semibold text-red-700">{error}</p>
        )}

        <button type="submit" disabled={loading}
          className="mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[#c35416] text-[14px] font-black text-white shadow-[0_10px_22px_rgba(195,84,22,0.25)] transition hover:-translate-y-0.5 disabled:opacity-60 disabled:hover:translate-y-0">
          {loading && <Loader2 size={17} className="animate-spin" />}
          Update password
        </button>
      </form>
    </div>
  );
}
