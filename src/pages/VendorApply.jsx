import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  BadgeCheck, Calendar, Check, ChevronDown, CreditCard, FileText, Headphones, Info, Landmark, Loader2,
  Lock, Mail, MapPin, Package, Phone, Rocket, Send, ShieldCheck, Store, TrendingUp, Upload, User, Users,
  Wallet, X, Eye,
} from "lucide-react";
import api from "../services/api";
import { INDIAN_STATES, STATE_CITIES, STATE_DISTRICTS } from "../data/indianLocations";
import storefrontImg from "./images/vendor.png";
import grainImg from "./images/sell-on.png";

/* ───────────────────────── constants & validation ───────────────────────── */

const SERIF = { fontFamily: "'Playfair Display', Georgia, 'Times New Roman', serif" };

const MAX_FILE_BYTES = 2 * 1024 * 1024;
const OK_MIME = ["application/pdf", "image/jpeg", "image/png"];
const OK_EXT = { "application/pdf": ["pdf"], "image/jpeg": ["jpg", "jpeg"], "image/png": ["png"] };
// first bytes of a real PDF / PNG / JPEG (a renamed file fails this check)
const FILE_SIGNATURES = {
  "application/pdf": [0x25, 0x50, 0x44, 0x46],
  "image/png": [0x89, 0x50, 0x4e, 0x47],
  "image/jpeg": [0xff, 0xd8, 0xff],
};
const extOf = (name) => (name.split(".").pop() || "").toLowerCase();

const EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/;
const GSTIN_RE = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const PAN_RE = /^[A-Z]{5}\d{4}[A-Z]$/;
const OWNER_RE = /^[A-Za-z][A-Za-z .]*$/;
const BUSINESS_RE = /^[A-Za-z][A-Za-z .&'-]*$/;
const PLACE_RE = /^[A-Za-z][A-Za-z .'-]*$/;
const ADDRESS_RE = /^[A-Za-z0-9 ,.\-/#&()']+$/;

const CATEGORIES = [
  "Grains & Flours", "Pulses & Lentils", "Spices & Masalas", "Dry Fruits & Nuts", "Oils & Ghee",
  "Organic Produce", "Snacks & Namkeen", "Beverages", "Home Care", "Personal Care", "Other",
];
const YEARS = ["Less than 1 year", "1 - 3 years", "3 - 5 years", "5 - 10 years", "More than 10 years"];

const INITIAL_FORM = {
  businessName: "", ownerName: "", email: "", phone: "", category: "", description: "",
  gstin: "", panNumber: "", fssaiNumber: "", yearsInBusiness: "",
  address: "", state: "", city: "", district: "", pincode: "",
};

// What the user is allowed to type in each field (anything else is dropped as they type).
const lettersFirst = (v) => v.replace(/^[^A-Za-z]+/, "").replace(/\s{2,}/g, " ");
const clean = {
  businessName: (v) => lettersFirst(v.replace(/[^A-Za-z .&'-]/g, "")).slice(0, 100),
  ownerName: (v) => lettersFirst(v.replace(/[^A-Za-z .]/g, "")).slice(0, 80),
  email: (v) => v.replace(/\s/g, "").slice(0, 120),
  phone: (v) => v.replace(/\D/g, "").slice(0, 10),
  description: (v) => v.slice(0, 300),
  gstin: (v) => v.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 15),
  panNumber: (v) => v.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10),
  fssaiNumber: (v) => v.replace(/\D/g, "").slice(0, 14),
  address: (v) => v.replace(/[^A-Za-z0-9 ,.\-/#&()']/g, "").replace(/^\s+/, "").replace(/\s{2,}/g, " ").slice(0, 300),
  district: (v) => lettersFirst(v.replace(/[^A-Za-z .'-]/g, "")).slice(0, 60),
  city: (v) => lettersFirst(v.replace(/[^A-Za-z .'-]/g, "")).slice(0, 60),
  pincode: (v) => v.replace(/\D/g, "").slice(0, 6),
};

const validators = {
  businessName: (v) => {
    const s = v.trim();
    if (!s) return "Enter your store / business name";
    if (s.length < 2) return "Business name must be at least 2 characters";
    if (!BUSINESS_RE.test(s)) return "Only letters, spaces and . & ' - are allowed";
    return "";
  },
  ownerName: (v) => {
    const s = v.trim();
    if (!s) return "Enter the owner's full name";
    if (s.length < 2) return "Name must be at least 2 characters";
    if (!OWNER_RE.test(s)) return "Only letters, spaces and dots are allowed";
    return "";
  },
  email: (v) => {
    const s = v.trim();
    if (!s) return "Enter your business e-mail";
    if (!EMAIL_RE.test(s)) return "Enter a valid e-mail address";
    return "";
  },
  phone: (v) => {
    if (!v) return "Enter your mobile number";
    if (v.length < 10) return "Mobile number must be 10 digits";
    if (!/^[6-9]\d{9}$/.test(v)) return "Indian mobile numbers start with 6, 7, 8 or 9";
    return "";
  },
  category: (v) => (v ? "" : "Select what you sell"),
  gstin: (v, f) => {
    if (!v) return "";
    if (!GSTIN_RE.test(v)) return "Enter a valid 15-character GSTIN";
    if (PAN_RE.test(f.panNumber) && v.slice(2, 12) !== f.panNumber) return "GSTIN does not match the PAN entered";
    return "";
  },
  panNumber: (v, f) => {
    if (!v) return "";
    if (!PAN_RE.test(v)) return "Enter a valid 10-character PAN (e.g. ABCDE1234F)";
    if (GSTIN_RE.test(f.gstin) && f.gstin.slice(2, 12) !== v) return "PAN does not match the GSTIN entered";
    return "";
  },
  fssaiNumber: (v) => (!v || /^\d{14}$/.test(v) ? "" : "FSSAI license number must be 14 digits"),
  address: (v) => {
    const s = v.trim();
    if (!s) return "Enter your pickup address";
    if (s.length < 5) return "Address must be at least 5 characters";
    if (!ADDRESS_RE.test(s)) return "Only letters, numbers and , . - / # & ( ) are allowed";
    return "";
  },
  state: (v) => (v ? "" : "Select your state"),
  city: (v) => {
    const s = v.trim();
    if (!s) return "Enter or select your city";
    if (s.length < 2 || !PLACE_RE.test(s)) return "City can contain only letters";
    return "";
  },
  district: (v) => {
    const s = v.trim();
    if (!s) return "Select your district";
    if (s.length < 2 || !PLACE_RE.test(s)) return "District can contain only letters";
    return "";
  },
  pincode: (v) => (/^[1-9]\d{5}$/.test(v) ? "" : "Enter a valid 6-digit pincode"),
};

const REQUIRED_FIELDS = ["businessName", "ownerName", "email", "phone", "category", "address", "state", "city", "district", "pincode"];
const OPTIONAL_REG_FIELDS = ["gstin", "panNumber", "fssaiNumber"];

const DOCS = [
  { key: "gst_certificate", label: "GST Certificate", hint: "Upload a valid GST certificate (PDF/JPG/PNG)", icon: Landmark },
  { key: "pan_card", label: "PAN Card", hint: "Upload a clear PAN card copy", icon: CreditCard },
  { key: "id_proof", label: "Owner ID Proof", hint: "Aadhaar, Passport, Voter ID or Driving License", icon: User },
  { key: "address_proof", label: "Business Address Proof", hint: "Electricity bill, lease agreement or property document", icon: Store },
  { key: "fssai_license", label: "FSSAI / Trade License (Food Vendors)", hint: "Upload your FSSAI license (if applicable)", icon: BadgeCheck },
  { key: "bank_proof", label: "Cancelled Cheque / Bank Proof", hint: "For payment settlement and verification", icon: Landmark },
];

const WHY_ITEMS = [
  { icon: Users, text: "Reach more customers across your city" },
  { icon: Wallet, text: "Get secure & timely payments" },
  { icon: Package, text: "Easy product & inventory management" },
  { icon: Headphones, text: "Dedicated vendor support" },
  { icon: TrendingUp, text: "Grow with a trusted local brand" },
];

const SEAL_CLIP =
  "polygon(50.0% 0.0%,61.1% 8.5%,75.0% 6.7%,80.4% 19.6%,93.3% 25.0%,91.5% 38.9%,100.0% 50.0%,91.5% 61.1%,93.3% 75.0%,80.4% 80.4%,75.0% 93.3%,61.1% 91.5%,50.0% 100.0%,38.9% 91.5%,25.0% 93.3%,19.6% 80.4%,6.7% 75.0%,8.5% 61.1%,0.0% 50.0%,8.5% 38.9%,6.7% 25.0%,19.6% 19.6%,25.0% 6.7%,38.9% 8.5%)";

const formatSize = (bytes) => (bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

/* ───────────────────────── small presentational pieces ───────────────────────── */

function Label({ htmlFor, children, required, tag }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 block text-[13px] font-extrabold text-[#2a1a10]">
      {children}
      {required && <span className="text-red-500"> *</span>}
      {tag && <span className="ml-1 text-[11px] font-semibold text-[#9a8a80]">{tag}</span>}
    </label>
  );
}

function ErrorText({ children }) {
  if (!children) return null;
  return <span role="alert" className="mt-1 block text-[12px] font-semibold text-red-600">{children}</span>;
}

function InputBox({ icon: Icon, prefix, error, right, readOnly, ...props }) {
  return (
    <div
      className={`flex h-[46px] items-center gap-2.5 rounded-[10px] border px-3.5 transition focus-within:border-[#ea6d17] focus-within:shadow-[0_0_0_4px_rgba(234,109,23,0.12)] ${
        error ? "border-red-400" : "border-[#ecd9c8]"
      } ${readOnly || props.disabled ? "bg-[#f8efe6]" : "bg-white/85"}`}
    >
      {Icon && <Icon size={16} className="shrink-0 text-[#8a7a70]" />}
      {prefix && <span className="shrink-0 border-r border-[#ecd9c8] pr-2.5 text-[14px] font-bold text-[#2f2119]">{prefix}</span>}
      <input
        {...props}
        readOnly={readOnly}
        className="min-w-0 flex-1 bg-transparent text-[14px] font-semibold text-[#2f2119] outline-none placeholder:font-medium placeholder:text-[#aa9a90] disabled:cursor-not-allowed"
      />
      {right}
    </div>
  );
}

function SelectBox({ icon: Icon, error, children, ...props }) {
  return (
    <div
      className={`relative flex h-[46px] items-center gap-2.5 rounded-[10px] border bg-white/85 px-3.5 transition focus-within:border-[#ea6d17] focus-within:shadow-[0_0_0_4px_rgba(234,109,23,0.12)] ${
        error ? "border-red-400" : "border-[#ecd9c8]"
      } ${props.disabled ? "opacity-60" : ""}`}
    >
      {Icon && <Icon size={16} className="shrink-0 text-[#8a7a70]" />}
      <select
        {...props}
        className="h-full min-w-0 flex-1 appearance-none bg-transparent pr-6 text-[14px] font-semibold text-[#2f2119] outline-none disabled:cursor-not-allowed"
      >
        {children}
      </select>
      <ChevronDown size={16} className="pointer-events-none absolute right-3.5 text-[#8a7a70]" />
    </div>
  );
}

function SectionCard({ innerRef, icon: Icon, title, subtitle, locked, right, children }) {
  return (
    <fieldset disabled={locked} className="min-w-0 border-0 p-0">
      <section
        ref={innerRef}
        className={`scroll-mt-28 rounded-[22px] border border-[#f1e0d0] bg-gradient-to-b from-[#fff3e8] to-[#fffaf5] p-5 shadow-[0_14px_36px_rgba(120,72,36,0.08)] sm:p-7 ${locked ? "opacity-75" : ""}`}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3.5">
            <span className="grid h-[46px] w-[46px] shrink-0 place-items-center rounded-[13px] bg-[#fde6d2] text-[#ea6d17]">
              <Icon size={22} />
            </span>
            <div>
              <h2 style={SERIF} className="text-[21px] font-bold leading-tight text-[#2a1409]">{title}</h2>
              <p className="mt-0.5 text-[12.5px] text-[#8a7a70]">{subtitle}</p>
            </div>
          </div>
          {locked ? (
            <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-[#f3e6da] px-3 py-1.5 text-[11px] font-black text-[#8a6a55]">
              <Lock size={12} /> Verify e-mail to unlock
            </span>
          ) : right}
        </div>
        <div className="mt-6">{children}</div>
      </section>
    </fieldset>
  );
}

/* ───────────────────────── page ───────────────────────── */

export default function VendorApply() {
  const [form, setForm] = useState(INITIAL_FORM);
  const [touched, setTouched] = useState({});
  const [serverErrors, setServerErrors] = useState({});
  const [files, setFiles] = useState({});
  const [fileErrors, setFileErrors] = useState({});
  const [previews, setPreviews] = useState({}); // key -> { status: "loading" | "ready", progress, url, isImage }
  const [uploadProgress, setUploadProgress] = useState({}); // key -> 0..100 while the form is being sent
  const [overallPct, setOverallPct] = useState(0);
  const previewUrls = useRef({});
  const readTokens = useRef({});
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState("");
  const [done, setDone] = useState(false);

  const [emailStep, setEmailStep] = useState("idle"); // idle | sending | sent | verifying | verified
  const [otpDigits, setOtpDigits] = useState(["", "", "", "", "", ""]);
  const [verificationToken, setVerificationToken] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const [emailNote, setEmailNote] = useState({ type: "", text: "" });

  const [activeStep, setActiveStep] = useState(1);
  const sectionRefs = useRef([null, null, null, null]);
  const otpRefs = useRef([]);

  const verified = emailStep === "verified" && !!verificationToken;
  const otp = otpDigits.join("");
  const otpShown = emailStep === "sent" || emailStep === "verifying";
  const emailBusy = emailStep === "sending" || emailStep === "verifying";
  // every official district of the selected state
  const districtOptions = form.state ? STATE_DISTRICTS[form.state] || [] : [];
  const citySuggestions = form.state ? STATE_CITIES[form.state] || [] : [];
  const docsLoading = Object.values(previews).some((p) => p.status === "loading");

  const errorOf = (name) => serverErrors[name] || (touched[name] ? validators[name](form[name] ?? "", form) : "");

  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const id = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);

  // highlight the stepper step whose section is currently on screen
  useEffect(() => {
    const onScroll = () => {
      let current = 1;
      sectionRefs.current.forEach((el, i) => {
        if (el && el.getBoundingClientRect().top <= 240) current = i + 1;
      });
      setActiveStep(current);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [done]);

  const touch = (name) => setTouched((prev) => (prev[name] ? prev : { ...prev, [name]: true }));

  const resetVerification = () => {
    setEmailStep("idle");
    setOtpDigits(["", "", "", "", "", ""]);
    setVerificationToken("");
    setCooldown(0);
    setEmailNote({ type: "", text: "" });
  };

  const setField = (name, raw) => {
    const value = clean[name] ? clean[name](raw) : raw;
    if (name === "email" && emailStep !== "idle") resetVerification();
    setForm((prev) => ({
      ...prev,
      [name]: value,
      ...(name === "state" ? { district: "", city: "" } : {}),
      ...(name === "district" ? { city: "" } : {}),
    }));
    if (name === "state") setTouched((prev) => ({ ...prev, district: false, city: false }));
    if (name === "district") setTouched((prev) => ({ ...prev, city: false }));
    setServerErrors((prev) => {
      if (!prev[name]) return prev;
      const next = { ...prev };
      delete next[name];
      return next;
    });
    if (name === "state" || name === "category" || name === "district" || name === "yearsInBusiness") touch(name);
  };

  const onBlurField = (name) => () => {
    touch(name);
    // tidy trailing spaces once the user leaves the field
    if (typeof form[name] === "string" && form[name] !== form[name].trim()) {
      setForm((prev) => ({ ...prev, [name]: prev[name].trim() }));
    }
  };

  /* ── e-mail OTP ── */
  const sendOtp = async () => {
    touch("email");
    if (validators.email(form.email)) return;
    const email = form.email.trim().toLowerCase();
    setEmailStep("sending");
    setEmailNote({ type: "", text: "" });
    try {
      const { data } = await api.post("/vendors/email-otp/send", { email }, { timeout: 90000, _retry: true });
      setEmailStep("sent");
      setOtpDigits(["", "", "", "", "", ""]);
      setCooldown(data.resendAfterSeconds || 30);
      setEmailNote({ type: "ok", text: data.message || `We sent a 6-digit code to ${email}.` });
      setTimeout(() => otpRefs.current[0]?.focus(), 50);
    } catch (err) {
      const res = err?.response?.data;
      if (!err?.response && err?.code === "ECONNABORTED") {
        // the server answered too slowly: the e-mail may still be on its way
        setEmailStep("sent");
        setCooldown(30);
        setEmailNote({
          type: "warn",
          text: "The server is taking longer than usual. If the code e-mail arrives, enter it below — otherwise use Resend OTP once the timer ends.",
        });
        return;
      }
      setEmailStep(emailStep === "sent" ? "sent" : "idle");
      if (res?.retryAfter) setCooldown(res.retryAfter);
      setEmailNote({
        type: "error",
        text: res?.message || (err?.response ? "Could not send the code. Please try again." : "Cannot reach the server. Check your connection and try again."),
      });
    }
  };

  const verifyOtp = async () => {
    if (!/^\d{6}$/.test(otp)) {
      setEmailNote({ type: "error", text: "Enter the 6-digit code." });
      return;
    }
    setEmailStep("verifying");
    setEmailNote({ type: "", text: "" });
    try {
      const { data } = await api.post(
        "/vendors/email-otp/verify",
        { email: form.email.trim().toLowerCase(), otp },
        { timeout: 30000, _retry: true },
      );
      setVerificationToken(data.verificationToken);
      setEmailStep("verified");
      setOtpDigits(["", "", "", "", "", ""]);
      setEmailNote({ type: "ok", text: "E-mail verified. You can now fill in Registration, Pickup Address and Documents." });
    } catch (err) {
      setEmailStep("sent");
      setEmailNote({ type: "error", text: err?.response?.data?.message || "Could not verify the code. Please try again." });
    }
  };

  const setDigit = (i, raw) => {
    const digits = raw.replace(/\D/g, "");
    if (!digits) {
      setOtpDigits((prev) => { const next = [...prev]; next[i] = ""; return next; });
      return;
    }
    setOtpDigits((prev) => {
      const next = [...prev];
      digits.slice(0, 6 - i).split("").forEach((ch, k) => { next[i + k] = ch; });
      return next;
    });
    otpRefs.current[Math.min(5, i + digits.length)]?.focus();
  };

  /* ── documents ── */
  useEffect(() => () => Object.values(previewUrls.current).forEach((u) => URL.revokeObjectURL(u)), []);

  const clearPreview = (key) => {
    readTokens.current[key] = (readTokens.current[key] || 0) + 1; // cancels a read that is still running
    if (previewUrls.current[key]) {
      URL.revokeObjectURL(previewUrls.current[key]);
      delete previewUrls.current[key];
    }
    setPreviews((prev) => { const next = { ...prev }; delete next[key]; return next; });
  };

  const pickFile = (key, file) => {
    if (!file) return;
    let message = "";
    if (!OK_MIME.includes(file.type) || !OK_EXT[file.type].includes(extOf(file.name))) {
      message = "Wrong file format. Only PDF, JPG or PNG files are allowed";
    } else if (file.size === 0) {
      message = "This file is empty. Please choose another file";
    } else if (file.size > MAX_FILE_BYTES) {
      message = `File is too large (${formatSize(file.size)}). The maximum allowed size is 2 MB`;
    }

    // whatever was chosen before is replaced by this pick (valid or not)
    clearPreview(key);
    setFiles((prev) => { const next = { ...prev }; delete next[key]; return next; });
    setFileErrors((prev) => ({ ...prev, [key]: message }));
    if (message) return;

    // read the file (with progress), check it really is a PDF / JPG / PNG, then show the preview
    const token = (readTokens.current[key] || 0) + 1;
    readTokens.current[key] = token;
    const stale = () => readTokens.current[key] !== token;
    setPreviews((prev) => ({ ...prev, [key]: { status: "loading", progress: 0 } }));

    const reader = new FileReader();
    reader.onprogress = (e) => {
      if (stale() || !e.lengthComputable) return;
      const progress = Math.round((e.loaded / e.total) * 100);
      setPreviews((prev) => (prev[key]?.status === "loading" ? { ...prev, [key]: { ...prev[key], progress } } : prev));
    };
    reader.onerror = () => {
      if (stale()) return;
      clearPreview(key);
      setFileErrors((prev) => ({ ...prev, [key]: "Could not read this file. Please try another one" }));
    };
    reader.onload = () => {
      if (stale()) return;
      const head = new Uint8Array(reader.result, 0, 4);
      const sig = FILE_SIGNATURES[file.type];
      if (!sig.every((b, i) => head[i] === b)) {
        clearPreview(key);
        setFileErrors((prev) => ({ ...prev, [key]: "This file is damaged or is not a real PDF, JPG or PNG" }));
        return;
      }
      const url = URL.createObjectURL(file);
      previewUrls.current[key] = url;
      setFiles((prev) => ({ ...prev, [key]: file }));
      setPreviews((prev) => ({ ...prev, [key]: { status: "ready", progress: 100, url, isImage: file.type.startsWith("image/") } }));
    };
    reader.readAsArrayBuffer(file);
  };

  const removeFile = (key) => {
    clearPreview(key);
    setFiles((prev) => { const next = { ...prev }; delete next[key]; return next; });
    setFileErrors((prev) => ({ ...prev, [key]: "" }));
  };

  /* ── submit ── */
  const submit = async (e) => {
    e.preventDefault();
    setServerError("");
    if (!verified) {
      touch("email");
      setEmailNote({ type: "error", text: "Verify your business e-mail with the OTP before submitting." });
      document.getElementById("vendor-email")?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    if (docsLoading) {
      setServerError("Please wait until your documents finish loading.");
      return;
    }
    const allTouched = {};
    [...REQUIRED_FIELDS, ...OPTIONAL_REG_FIELDS].forEach((n) => { allTouched[n] = true; });
    setTouched((prev) => ({ ...prev, ...allTouched }));
    const invalid = [...REQUIRED_FIELDS, ...OPTIONAL_REG_FIELDS].some((n) => validators[n](form[n] ?? "", form));
    if (invalid || Object.values(fileErrors).some(Boolean)) {
      setTimeout(() => document.querySelector("[data-error='true']")?.scrollIntoView({ behavior: "smooth", block: "center" }), 50);
      return;
    }

    const body = new FormData();
    Object.entries(form).forEach(([k, v]) => body.append(k, k === "phone" ? `+91${v}` : v.trim()));
    body.set("email", form.email.trim().toLowerCase());
    body.append("emailVerificationToken", verificationToken);
    Object.entries(files).forEach(([k, file]) => body.append(k, file));

    const fileList = Object.entries(files);
    const fileBytes = fileList.reduce((sum, [, f]) => sum + f.size, 0);
    setUploadProgress({});
    setOverallPct(0);

    setSubmitting(true);
    try {
      await api.post("/vendors/apply", body, {
        timeout: 120000,
        _retry: true,
        onUploadProgress: (e) => {
          if (!e.total) return;
          setOverallPct(Math.min(100, Math.round((e.loaded / e.total) * 100)));
          // the text fields go first, then the files in the order they were appended
          let start = Math.max(0, e.total - fileBytes);
          const next = {};
          fileList.forEach(([k, f]) => {
            next[k] = Math.max(0, Math.min(100, Math.round(((e.loaded - start) / f.size) * 100)));
            start += f.size;
          });
          setUploadProgress(next);
        },
      });
      setDone(true);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      setUploadProgress({});
      setOverallPct(0);
      const res = err?.response?.data;
      if (res?.code === "EMAIL_NOT_VERIFIED") {
        resetVerification();
        setEmailNote({ type: "error", text: "Your e-mail verification expired. Please verify again." });
      }
      if (Array.isArray(res?.errors)) {
        const map = {};
        const docMap = {};
        res.errors.forEach((x) => {
          if (!x.field) return;
          if (DOCS.some((d) => d.key === x.field)) docMap[x.field] = x.message;
          else map[x.field] = x.message;
        });
        setServerErrors(map);
        if (Object.keys(docMap).length) setFileErrors((prev) => ({ ...prev, ...docMap }));
      }
      setServerError(res?.message || (err?.response ? "Could not submit your application. Please try again." : "Cannot reach the server. Check your connection and try again."));
    } finally {
      setSubmitting(false);
    }
  };

  const stepComplete = [
    verified && !["businessName", "ownerName", "phone", "category"].some((n) => validators[n](form[n], form)),
    verified && !OPTIONAL_REG_FIELDS.some((n) => validators[n](form[n], form)) &&
      !!(form.gstin || form.panNumber || form.fssaiNumber || form.yearsInBusiness),
    verified && ["address", "state", "city", "district", "pincode"].every((n) => !validators[n](form[n], form)),
    verified && Object.keys(files).length > 0,
  ];
  const STEP_LABELS = ["Business Details", "Registration", "Pickup Address", "Documents"];
  const goToStep = (i) => sectionRefs.current[i]?.scrollIntoView({ behavior: "smooth", block: "start" });

  if (done) {
    return (
      <main className="grid min-h-[70vh] place-items-center bg-[#fff7f0] px-4 py-16">
        <div className="max-w-[520px] rounded-[18px] border border-[#eaded6] bg-white p-10 text-center shadow-[0_24px_60px_rgba(66,36,18,0.1)]">
          <Check size={56} className="mx-auto text-emerald-500" />
          <h1 className="mt-5 text-[24px] font-black tracking-[-0.02em] text-[#2a1409]">Application received</h1>
          <p className="mt-3 text-[14px] leading-6 text-[#6d5e55]">
            Thanks! Our team will review your details and documents. Once approved, we will e-mail your vendor
            user ID, a temporary password and the login link to <strong>{form.email}</strong>.
          </p>
          <Link to="/" className="mt-7 inline-flex h-11 items-center rounded-full bg-[#c35416] px-7 text-[14px] font-black text-white">Back to store</Link>
        </div>
      </main>
    );
  }

  const noteColor = { ok: "text-emerald-700", error: "text-red-600", warn: "text-amber-700" };

  return (
    <main className="min-h-screen bg-gradient-to-b from-[#fff1e5] via-[#fff7f0] to-[#fffaf6]">
      {/* Hero */}
      <header className="px-4 pt-10 sm:px-6 sm:pt-14 lg:px-8">
        <div className="mx-auto grid max-w-[1240px] items-center gap-6 md:grid-cols-2">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full bg-white px-3.5 py-1.5 text-[12px] font-extrabold text-[#2a1409] shadow-[0_6px_16px_rgba(120,72,36,0.1)]">
              <Store size={14} className="text-[#ea6d17]" /> Become a Vendor
            </span>
            <h1 style={SERIF} className="mt-4 text-[40px] font-black leading-[1.05] text-[#2a1409] sm:text-[52px]">
              Sell on <span className="text-[#ea6d17]">Machinichi</span>
            </h1>
            <p className="mt-3 max-w-[470px] text-[15.5px] leading-relaxed text-[#5f5650]">
              Grow your business with a trusted platform for pure, organic and everyday essentials.
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-5 sm:gap-7">
              {[
                { icon: TrendingUp, a: "More", b: "Customers" },
                { icon: ShieldCheck, a: "Secure", b: "Payments" },
                { icon: Rocket, a: "Business", b: "Growth" },
              ].map(({ icon: Icon, a, b }) => (
                <div key={b} className="flex items-center gap-2.5">
                  <span className="grid h-[46px] w-[46px] place-items-center rounded-full border border-[#f6d3b3] bg-[#fff4ea] text-[#ea6d17] shadow-[0_6px_14px_rgba(234,109,23,0.12)]">
                    <Icon size={21} />
                  </span>
                  <span className="text-[13px] font-extrabold leading-tight text-[#2a1409]">{a}<br />{b}</span>
                </div>
              ))}
            </div>
          </div>
          <div>
            <img src={storefrontImg} alt="" className="mx-auto block h-auto w-full max-w-[380px] md:ml-auto" />
          </div>
        </div>
      </header>

      {/* Stepper */}
      <nav aria-label="Application steps" className="mx-auto mt-8 grid max-w-[640px] grid-cols-4 px-4">
        {STEP_LABELS.map((label, i) => {
          const isActive = activeStep === i + 1;
          const isDone = stepComplete[i];
          return (
            <button key={label} type="button" onClick={() => goToStep(i)} className="relative flex flex-col items-center gap-2 text-center">
              {i < 3 && (
                <span
                  aria-hidden="true"
                  className={`absolute left-[calc(50%+22px)] top-[17px] h-[2px] w-[calc(100%-44px)] ${isDone ? "bg-[#ea6d17]" : "bg-[#eadccf]"}`}
                />
              )}
              <span
                className={`relative z-10 grid h-[36px] w-[36px] place-items-center rounded-full border-2 text-[14px] font-black transition ${
                  isActive || isDone ? "border-[#ea6d17] bg-[#ea6d17] text-white shadow-[0_6px_14px_rgba(234,109,23,0.3)]" : "border-[#e6d6c8] bg-white text-[#8a7a70]"
                }`}
              >
                {isDone && !isActive ? <Check size={17} strokeWidth={3} /> : i + 1}
              </span>
              <span className={`text-[12px] font-extrabold ${isActive ? "text-[#ea6d17]" : "text-[#8a7a70]"}`}>{label}</span>
            </button>
          );
        })}
      </nav>

      {/* Form */}
      <form onSubmit={submit} noValidate className="mx-auto max-w-[1240px] px-4 pb-20 pt-8 sm:px-6 lg:px-8">
        <div className="grid items-start gap-7 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="space-y-6">
            {/* 1 · Business details */}
            <SectionCard
              innerRef={(el) => { sectionRefs.current[0] = el; }}
              icon={Store}
              title="Business Details"
              subtitle="Tell us about your store and what you sell."
            >
              <div className="grid gap-5 sm:grid-cols-2">
                <div data-error={errorOf("businessName") ? "true" : undefined}>
                  <Label htmlFor="vendor-business" required>Store / Business Name</Label>
                  <InputBox
                    id="vendor-business" icon={Store} value={form.businessName} placeholder="Enter your store or business name"
                    error={errorOf("businessName")} autoComplete="organization"
                    onChange={(e) => setField("businessName", e.target.value)} onBlur={onBlurField("businessName")}
                  />
                  <ErrorText>{errorOf("businessName")}</ErrorText>
                </div>
                <div data-error={errorOf("ownerName") ? "true" : undefined}>
                  <Label htmlFor="vendor-owner" required>Owner Full Name</Label>
                  <InputBox
                    id="vendor-owner" icon={User} value={form.ownerName} placeholder="Enter owner's full name"
                    error={errorOf("ownerName")} autoComplete="name"
                    onChange={(e) => setField("ownerName", e.target.value)} onBlur={onBlurField("ownerName")}
                  />
                  <ErrorText>{errorOf("ownerName")}</ErrorText>
                </div>

                <div className="sm:col-span-2" data-error={errorOf("email") ? "true" : undefined}>
                  <Label htmlFor="vendor-email" required>Business Email</Label>
                  <div className="flex flex-col gap-3 sm:flex-row">
                    <div className="min-w-0 flex-1">
                      <InputBox
                        id="vendor-email" type="email" icon={Mail} value={form.email} placeholder="you@yourbusiness.com"
                        error={errorOf("email")} autoComplete="email" readOnly={verified}
                        onChange={(e) => setField("email", e.target.value)} onBlur={onBlurField("email")}
                        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); if (!verified && !emailBusy && cooldown <= 0) sendOtp(); } }}
                        right={verified ? (
                          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-black text-emerald-700">
                            <Check size={13} strokeWidth={3} /> Verified
                          </span>
                        ) : null}
                      />
                    </div>
                    {verified ? (
                      <button type="button" onClick={resetVerification}
                        className="h-[46px] shrink-0 rounded-full border border-[#ea6d17] bg-white px-6 text-[13.5px] font-extrabold text-[#ea6d17] transition hover:bg-[#fff4ea]">
                        Change e-mail
                      </button>
                    ) : (
                      <button type="button" onClick={sendOtp} disabled={emailBusy || cooldown > 0}
                        className="flex h-[46px] shrink-0 items-center justify-center gap-2 rounded-full border border-[#ea6d17] bg-white px-6 text-[13.5px] font-extrabold text-[#ea6d17] transition hover:bg-[#fff4ea] disabled:cursor-not-allowed disabled:opacity-55">
                        {emailStep === "sending" ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
                        {otpShown ? (cooldown > 0 ? `Resend in ${cooldown}s` : "Resend OTP") : "Send OTP"}
                      </button>
                    )}
                  </div>
                  <ErrorText>{errorOf("email")}</ErrorText>

                  {otpShown && !verified && (
                    <div className="mt-4 rounded-[14px] border border-[#f1dfcf] bg-white/70 p-4">
                      <p className="text-[13px] font-semibold text-[#6d5e55]">Enter the 6-digit code we sent to <strong className="text-[#2a1409]">{form.email.trim()}</strong>.</p>
                      <div className="mt-3 flex items-center gap-2">
                        {otpDigits.map((d, i) => (
                          <input
                            key={i}
                            ref={(el) => { otpRefs.current[i] = el; }}
                            type="text" inputMode="numeric" autoComplete={i === 0 ? "one-time-code" : "off"}
                            value={d} aria-label={`Verification code digit ${i + 1}`}
                            onChange={(e) => setDigit(i, e.target.value)}
                            onFocus={(e) => e.target.select()}
                            onPaste={(e) => { e.preventDefault(); setDigit(i, e.clipboardData.getData("text")); }}
                            onKeyDown={(e) => {
                              if (e.key === "Backspace" && !otpDigits[i] && i > 0) {
                                setOtpDigits((prev) => { const next = [...prev]; next[i - 1] = ""; return next; });
                                otpRefs.current[i - 1]?.focus();
                              }
                              if (e.key === "Enter") { e.preventDefault(); verifyOtp(); }
                            }}
                            className="h-[48px] w-[42px] rounded-[10px] border border-[#ecd9c8] bg-white text-center font-mono text-[20px] font-black text-[#2a1409] outline-none focus:border-[#ea6d17] focus:shadow-[0_0_0_4px_rgba(234,109,23,0.12)] sm:w-[46px]"
                          />
                        ))}
                        <button type="button" onClick={verifyOtp} disabled={otp.length !== 6 || emailBusy}
                          className="ml-2 flex h-[48px] items-center justify-center gap-2 rounded-full bg-[#ea6d17] px-6 text-[13.5px] font-extrabold text-white shadow-[0_8px_18px_rgba(234,109,23,0.25)] transition hover:bg-[#d85f0c] disabled:cursor-not-allowed disabled:opacity-50">
                          {emailStep === "verifying" && <Loader2 size={15} className="animate-spin" />}
                          Verify
                        </button>
                      </div>
                    </div>
                  )}
                  {emailNote.text && (
                    <p role={emailNote.type === "error" ? "alert" : "status"} className={`mt-3 text-[13px] font-semibold ${noteColor[emailNote.type] || ""}`}>
                      {emailNote.text}
                    </p>
                  )}
                </div>

                <div data-error={errorOf("phone") ? "true" : undefined}>
                  <Label htmlFor="vendor-phone" required>Mobile Number</Label>
                  <InputBox
                    id="vendor-phone" type="tel" inputMode="numeric" icon={Phone} prefix="+91" value={form.phone}
                    placeholder="Enter 10-digit mobile number" error={errorOf("phone")} autoComplete="tel-national"
                    onChange={(e) => setField("phone", e.target.value)} onBlur={onBlurField("phone")}
                  />
                  <ErrorText>{errorOf("phone")}</ErrorText>
                </div>
                <div data-error={errorOf("category") ? "true" : undefined}>
                  <Label htmlFor="vendor-category" required>What do you sell?</Label>
                  <SelectBox id="vendor-category" value={form.category} error={errorOf("category")}
                    onChange={(e) => setField("category", e.target.value)} onBlur={onBlurField("category")}>
                    <option value="">Select product category</option>
                    {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </SelectBox>
                  <ErrorText>{errorOf("category")}</ErrorText>
                </div>

                <div className="sm:col-span-2">
                  <Label htmlFor="vendor-about" tag="(optional)">About Your Business</Label>
                  <div className="rounded-[10px] border border-[#ecd9c8] bg-white/85 px-3.5 pb-2 pt-3 transition focus-within:border-[#ea6d17] focus-within:shadow-[0_0_0_4px_rgba(234,109,23,0.12)]">
                    <textarea
                      id="vendor-about" rows={3} value={form.description} maxLength={300}
                      onChange={(e) => setField("description", e.target.value)}
                      placeholder="Briefly describe your business, products and specialities (optional)"
                      className="w-full resize-none bg-transparent text-[14px] font-semibold text-[#2f2119] outline-none placeholder:font-medium placeholder:text-[#aa9a90]"
                    />
                    <div className="text-right text-[12px] text-[#8a7a70]">{form.description.length} / 300</div>
                  </div>
                </div>
              </div>
            </SectionCard>

            {/* 2 · Registration */}
            <SectionCard
              innerRef={(el) => { sectionRefs.current[1] = el; }}
              icon={FileText}
              title="Registration"
              subtitle="Provide your business registration details."
              locked={!verified}
            >
              <div className="grid gap-5 sm:grid-cols-2">
                <div data-error={errorOf("gstin") ? "true" : undefined}>
                  <Label htmlFor="vendor-gstin" tag="(optional)">GSTIN</Label>
                  <InputBox id="vendor-gstin" icon={FileText} value={form.gstin} placeholder="Enter 15-character GSTIN"
                    error={errorOf("gstin")} autoCapitalize="characters"
                    onChange={(e) => setField("gstin", e.target.value)} onBlur={onBlurField("gstin")} />
                  <ErrorText>{errorOf("gstin")}</ErrorText>
                </div>
                <div data-error={errorOf("panNumber") ? "true" : undefined}>
                  <Label htmlFor="vendor-pan" tag="(optional)">PAN</Label>
                  <InputBox id="vendor-pan" icon={CreditCard} value={form.panNumber} placeholder="Enter 10-character PAN"
                    error={errorOf("panNumber")} autoCapitalize="characters"
                    onChange={(e) => setField("panNumber", e.target.value)} onBlur={onBlurField("panNumber")} />
                  <ErrorText>{errorOf("panNumber")}</ErrorText>
                </div>
                <div data-error={errorOf("fssaiNumber") ? "true" : undefined}>
                  <Label htmlFor="vendor-fssai">FSSAI License No. (if applicable)</Label>
                  <InputBox id="vendor-fssai" icon={BadgeCheck} inputMode="numeric" value={form.fssaiNumber} placeholder="Enter 14-digit FSSAI license number"
                    error={errorOf("fssaiNumber")}
                    onChange={(e) => setField("fssaiNumber", e.target.value)} onBlur={onBlurField("fssaiNumber")} />
                  <ErrorText>{errorOf("fssaiNumber")}</ErrorText>
                </div>
                <div>
                  <Label htmlFor="vendor-years">Years in Business</Label>
                  <SelectBox id="vendor-years" icon={Calendar} value={form.yearsInBusiness} onChange={(e) => setField("yearsInBusiness", e.target.value)}>
                    <option value="">Select duration</option>
                    {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
                  </SelectBox>
                </div>
              </div>
            </SectionCard>

            {/* 3 · Pickup address */}
            <SectionCard
              innerRef={(el) => { sectionRefs.current[2] = el; }}
              icon={MapPin}
              title="Pickup Address"
              subtitle="Where should we pick up your products?"
              locked={!verified}
            >
              <div className="grid gap-5 sm:grid-cols-2">
                <div className="sm:col-span-2" data-error={errorOf("address") ? "true" : undefined}>
                  <Label htmlFor="vendor-address" required>Address</Label>
                  <InputBox id="vendor-address" icon={MapPin} value={form.address} placeholder="Enter complete pickup address"
                    error={errorOf("address")} autoComplete="street-address"
                    onChange={(e) => setField("address", e.target.value)} onBlur={onBlurField("address")} />
                  <ErrorText>{errorOf("address")}</ErrorText>
                </div>
                <div data-error={errorOf("state") ? "true" : undefined}>
                  <Label htmlFor="vendor-state" required>State</Label>
                  <SelectBox id="vendor-state" value={form.state} error={errorOf("state")}
                    onChange={(e) => setField("state", e.target.value)} onBlur={onBlurField("state")}>
                    <option value="">Select state</option>
                    {INDIAN_STATES.map((s) => <option key={s.name} value={s.name}>{s.name}</option>)}
                  </SelectBox>
                  <ErrorText>{errorOf("state")}</ErrorText>
                </div>
                <div data-error={errorOf("district") ? "true" : undefined}>
                  <Label htmlFor="vendor-district" required>District</Label>
                  <SelectBox id="vendor-district" value={form.district} disabled={!form.state} error={errorOf("district")}
                    onChange={(e) => setField("district", e.target.value)} onBlur={onBlurField("district")}>
                    <option value="">{form.state ? "Select district" : "Select state first"}</option>
                    {districtOptions.map((d) => <option key={d} value={d}>{d}</option>)}
                  </SelectBox>
                  <ErrorText>{errorOf("district")}</ErrorText>
                </div>
                <div data-error={errorOf("city") ? "true" : undefined}>
                  <Label htmlFor="vendor-city" required>City</Label>
                  <InputBox id="vendor-city" list="vendor-city-options" value={form.city} disabled={!form.district}
                    placeholder={form.district ? "Select or type your city / town" : "Select district first"}
                    error={errorOf("city")} autoComplete="off"
                    onChange={(e) => setField("city", e.target.value)} onBlur={onBlurField("city")} />
                  <datalist id="vendor-city-options">
                    {[...new Set([form.district, ...citySuggestions].filter(Boolean))].map((c) => <option key={c} value={c} />)}
                  </datalist>
                  <ErrorText>{errorOf("city")}</ErrorText>
                </div>
                <div data-error={errorOf("pincode") ? "true" : undefined}>
                  <Label htmlFor="vendor-pincode" required>Pincode</Label>
                  <InputBox id="vendor-pincode" inputMode="numeric" value={form.pincode} placeholder="Enter 6-digit pincode"
                    error={errorOf("pincode")} autoComplete="postal-code"
                    onChange={(e) => setField("pincode", e.target.value)} onBlur={onBlurField("pincode")} />
                  <ErrorText>{errorOf("pincode")}</ErrorText>
                </div>
              </div>
            </SectionCard>

            {/* 4 · Documents */}
            <SectionCard
              innerRef={(el) => { sectionRefs.current[3] = el; }}
              icon={FileText}
              title="Documents"
              subtitle="Upload the documents you have to verify your business (all optional)."
              locked={!verified}
              right={(
                <span className="inline-flex items-center gap-2 rounded-full bg-[#fbeee2] px-3.5 py-2 text-[12px] font-semibold text-[#4a3a30]">
                  <Info size={14} className="text-[#6d5e55]" /> Accepted files: PDF, JPG, PNG
                  <span className="text-[#d9c3b0]">|</span> Max size: 2 MB each
                </span>
              )}
            >
              <div className="space-y-3">
                {DOCS.map(({ key, label, hint, icon: Icon }) => {
                  const file = files[key];
                  const err = fileErrors[key];
                  const pv = previews[key];
                  const loading = pv?.status === "loading";
                  const upPct = uploadProgress[key];
                  const uploading = submitting && !!file;
                  const locked = !verified || loading || submitting;
                  return (
                    <div key={key} data-error={err ? "true" : undefined}
                      className={`flex flex-wrap items-center gap-3.5 rounded-[14px] border bg-white px-4 py-3.5 shadow-[0_6px_16px_rgba(120,72,36,0.05)] ${err ? "border-red-400" : "border-[#f1e0d0]"}`}>
                      {file && pv?.url ? (
                        <a href={pv.url} target="_blank" rel="noopener noreferrer" aria-label={`Preview ${label}`} title="Open preview"
                          className="grid h-[48px] w-[48px] shrink-0 place-items-center overflow-hidden rounded-[13px] border border-[#f1e0d0] bg-[#fde6d2] text-[#ea6d17]">
                          {pv.isImage
                            ? <img src={pv.url} alt={`${label} preview`} className="h-full w-full object-cover" />
                            : <span className="flex flex-col items-center text-[10px] font-black leading-none"><FileText size={20} />PDF</span>}
                        </a>
                      ) : (
                        <span className="grid h-[48px] w-[48px] shrink-0 place-items-center rounded-[13px] bg-[#fde6d2] text-[#ea6d17]">
                          {loading ? <Loader2 size={22} className="animate-spin" /> : <Icon size={22} />}
                        </span>
                      )}
                      <div className="min-w-0 flex-1 basis-[180px]">
                        <p className="text-[15px] font-extrabold text-[#1f130d]">{label}</p>
                        <p className={`text-[12.5px] ${err ? "font-semibold text-red-600" : file ? "truncate font-semibold text-emerald-700" : "text-[#6d5e55]"}`}>
                          {err || (loading ? "Loading your file\u2026" : file ? `${file.name} \u00b7 ${formatSize(file.size)}` : hint)}
                        </p>
                      </div>
                      {file && pv?.url && (
                        <a href={pv.url} target="_blank" rel="noopener noreferrer"
                          className="inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[12.5px] font-extrabold text-[#ea6d17] transition hover:bg-[#fff1e6]">
                          <Eye size={15} /> Preview
                        </a>
                      )}
                      {(file || err) && !loading && (
                        <button type="button" onClick={() => removeFile(key)} disabled={submitting} aria-label={`Remove ${label}`}
                          className="grid h-8 w-8 place-items-center rounded-full text-[#8a7a70] transition hover:bg-[#fff1e6] hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40">
                          <X size={16} />
                        </button>
                      )}
                      <label className={`flex h-[42px] items-center gap-2 rounded-[10px] border border-dashed border-[#f0a266] bg-[#fffaf5] px-5 text-[13.5px] font-extrabold text-[#ea6d17] transition ${!locked ? "cursor-pointer hover:bg-[#fff1e6]" : "cursor-not-allowed opacity-60"}`}>
                        <Upload size={15} /> {file || err ? "Replace" : "Choose File"}
                        <input type="file" className="sr-only" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" disabled={locked}
                          onChange={(e) => { pickFile(key, e.target.files?.[0]); e.target.value = ""; }} />
                      </label>
                      <span className="hidden h-8 w-px bg-[#eadccf] sm:block" />
                      <span className={`hidden sm:block ${file && !err ? "text-emerald-600" : err ? "text-red-500" : "text-[#8a7a70]"}`}>
                        {file && !err ? <Check size={20} strokeWidth={3} /> : <FileText size={20} />}
                      </span>

                      {loading && (
                        <div className="basis-full" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pv.progress}>
                          <div className="mb-1 flex justify-between text-[11.5px] font-bold text-[#8a7a70]"><span>Loading file</span><span>{pv.progress}%</span></div>
                          <div className="h-1.5 overflow-hidden rounded-full bg-[#f3e6da]"><div className="h-full rounded-full bg-[#ea6d17] transition-all" style={{ width: `${pv.progress}%` }} /></div>
                        </div>
                      )}
                      {uploading && (
                        <div className="basis-full" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={upPct ?? 0}>
                          <div className="mb-1 flex justify-between text-[11.5px] font-bold text-[#8a7a70]">
                            <span>{(upPct ?? 0) >= 100 ? "Uploaded \u2013 waiting for the server\u2026" : "Uploading\u2026"}</span><span>{upPct ?? 0}%</span>
                          </div>
                          <div className="h-1.5 overflow-hidden rounded-full bg-[#f3e6da]"><div className={`h-full rounded-full transition-all ${(upPct ?? 0) >= 100 ? "bg-emerald-500" : "bg-[#ea6d17]"}`} style={{ width: `${upPct ?? 0}%` }} /></div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="mt-7 flex flex-col items-end gap-3">
                {serverError && (
                  <p role="alert" className="w-full rounded-[10px] border border-red-200 bg-red-50 px-4 py-3 text-[13px] font-semibold text-red-700">{serverError}</p>
                )}
                <button type="submit" disabled={submitting || !verified || docsLoading}
                  title={verified ? undefined : "Verify your business e-mail first"}
                  className="flex h-[50px] items-center justify-center gap-2 rounded-full bg-gradient-to-r from-[#f57f1f] to-[#e05e0a] px-10 text-[14px] font-extrabold text-white shadow-[0_12px_24px_rgba(234,109,23,0.3)] transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0">
                  {submitting && <Loader2 size={17} className="animate-spin" />}
                  {submitting && Object.keys(files).length > 0 ? `Uploading\u2026 ${overallPct}%` : "Submit Application"}
                </button>
              </div>
            </SectionCard>
          </div>

          {/* Sidebar */}
          <aside className="self-start lg:sticky lg:top-24">
            <div className="overflow-hidden rounded-[24px] border border-[#f1e0d0] bg-gradient-to-b from-[#fff3e8] to-[#fffaf5] shadow-[0_14px_36px_rgba(120,72,36,0.1)]">
              <div className="p-5 pb-3">
                <div className="flex items-center gap-3">
                  <span
                    className="grid h-[54px] w-[54px] shrink-0 place-items-center bg-gradient-to-br from-[#ff9a45] to-[#ea6d17] text-white"
                    style={{ clipPath: SEAL_CLIP }}
                  >
                    <Check size={26} strokeWidth={3.2} />
                  </span>
                  <h2 style={SERIF} className="text-[22px] font-bold leading-tight text-[#1f130d]">
                    Why Sell on <span className="text-[#ea6d17]">Machinichi?</span>
                  </h2>
                </div>
                <ul className="mt-4 rounded-[16px] border border-[#f3e6da] bg-white px-3">
                  {WHY_ITEMS.map((item, i) => (
                    <li key={item.text} className={`flex items-center gap-3 py-3.5 ${i > 0 ? "border-t border-[#f0e2d5]" : ""}`}>
                      <span className="grid h-[44px] w-[44px] shrink-0 place-items-center rounded-[12px] bg-[#fff0e3] text-[#ea6d17]">
                        <item.icon size={20} />
                      </span>
                      <span className="text-[13.5px] font-bold leading-snug text-[#2a1b12]">{item.text}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <img src={grainImg} alt="" className="block h-auto w-full" />
            </div>
            <p className="mt-5 text-center text-[12.5px] text-[#8a7a70]">
              Already approved?{" "}
              <Link to="/vendor/login" className="font-black text-[#ea6d17] hover:underline">Vendor login</Link>
            </p>
          </aside>
        </div>
      </form>
    </main>
  );
}
