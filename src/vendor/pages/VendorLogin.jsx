import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Eye, EyeOff, Loader2, LogIn, ShieldCheck } from "lucide-react";
import api from "../../services/api";
import logo from "../../admin/images/machinichi.png";

export default function VendorLogin({ onVendorLogin }) {
  const navigate = useNavigate();
  const [userId, setUserId] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    if (!userId.trim() || !password) {
      setError("Enter your vendor user ID (or e-mail) and password.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      // _retry: a wrong password must not trigger the silent token-refresh flow
      const { data } = await api.post(
        "/vendor/auth/login",
        { userId: userId.trim(), password },
        { _retry: true }
      );
      localStorage.setItem("accessToken", data.accessToken);
      if (data.refreshToken) localStorage.setItem("refreshToken", data.refreshToken);
      onVendorLogin?.(!!data.mustChangePassword);
      navigate(data.mustChangePassword ? "/vendor/change-password" : "/vendor/dashboard", { replace: true });
    } catch (err) {
      setError(err.response?.data?.message || "Could not sign in. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const inputClass =
    "h-12 w-full rounded-[10px] border border-[#dfcfc3] bg-[#fcf8f4] px-4 text-[14px] font-semibold text-[#2f2119] outline-none transition placeholder:text-[#aa9a90] focus:border-[#c35416] focus:shadow-[0_0_0_4px_rgba(195,84,22,0.1)]";

  return (
    <div className="grid min-h-screen place-items-center bg-[#fff7f0] px-4 py-10">
      <div className="w-full max-w-[440px] rounded-[18px] border border-[#eaded6] bg-white p-8 shadow-[0_24px_60px_rgba(66,36,18,0.12)]">
        <div className="flex items-center gap-4">
          <span className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-[12px] bg-black">
            <img src={logo} alt="Machinichi" className="h-14 w-14 object-contain" />
          </span>
          <div>
            <h1 className="text-[22px] font-black tracking-[-0.03em] text-[#2a1409]">Vendor Login</h1>
            <p className="text-[12px] font-black uppercase tracking-[0.12em] text-[#a04a0c]">Machinichi Seller Portal</p>
          </div>
        </div>

        <form onSubmit={submit} className="mt-7 space-y-4" noValidate>
          <label className="block">
            <span className="mb-1.5 block text-[12px] font-black uppercase tracking-[0.08em] text-[#8a7a70]">User ID or e-mail</span>
            <input className={inputClass} value={userId} onChange={(e) => setUserId(e.target.value)}
              placeholder="e.g. VND-4F7K2Q" autoComplete="username" autoFocus />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-[12px] font-black uppercase tracking-[0.08em] text-[#8a7a70]">Password</span>
            <div className="relative">
              <input className={`${inputClass} pr-12`} type={showPassword ? "text" : "password"} value={password}
                onChange={(e) => setPassword(e.target.value)} placeholder="Your password" autoComplete="current-password" />
              <button type="button" onClick={() => setShowPassword((s) => !s)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9a8a80] transition hover:text-[#c35416]">
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </label>

          {error && (
            <p role="alert" className="rounded-[10px] border border-red-200 bg-red-50 px-4 py-3 text-[13px] font-semibold text-red-700">{error}</p>
          )}

          <button type="submit" disabled={loading}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[#c35416] text-[14px] font-black text-white shadow-[0_10px_22px_rgba(195,84,22,0.25)] transition hover:-translate-y-0.5 disabled:opacity-60 disabled:hover:translate-y-0">
            {loading ? <Loader2 size={17} className="animate-spin" /> : <LogIn size={17} />}
            Sign in
          </button>
        </form>

        <p className="mt-6 flex items-start gap-2 text-[12px] leading-5 text-[#8a7a70]">
          <ShieldCheck size={15} className="mt-0.5 shrink-0 text-[#c35416]" />
          Your user ID and temporary password were e-mailed to you when your store was approved.
        </p>
        <p className="mt-4 text-center text-[13px] text-[#6d5e55]">
          Not a vendor yet?{" "}
          <Link to="/become-a-vendor" className="font-black text-[#c35416] hover:underline">Apply to sell on Machinichi</Link>
        </p>
      </div>
    </div>
  );
}
