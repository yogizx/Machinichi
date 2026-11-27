import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  BadgeCheck,
  Bell,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Crown,
  Heart,
  Home,
  Layers,
  Leaf,
  Maximize2,
  MapPin,
  Minus,
  Package,
  Palette,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  ShieldCheck,
  ShoppingBag,
  ShoppingCart,
  Sparkles,
  Sprout,
  Star,
  Truck,
  X,
} from "lucide-react";
import api from "../../services/api";
import { TRUST_BAR_ICONS } from "../../utils/trustBarIcons";
import boxImg from "../../pages/images/out of box.png";
import { getKeyBenefits } from "./productBenefits";

/* ───────────── helpers (all values are derived from real product data) ───────────── */

const toNum = (v) => {
  const n = Number(String(v ?? "").replace(/[^\d.]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

const stripHtml = (v) => String(v || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

// "3-5 days" -> today + 5 days.  "24 hours" -> tomorrow.  "2 weeks" -> +14 days.  Unparseable text is shown as-is.
function estimateDelivery(raw) {
  const text = String(raw || "").trim();
  if (!text) return "";
  const nums = (text.match(/\d+/g) || []).map(Number).filter((n) => n > 0 && n < 365);
  if (!nums.length) return text;
  let days = Math.max(...nums);
  if (/week/i.test(text)) days *= 7;
  else if (/hour|hr/i.test(text)) days = 1;
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
}

// Price per kg / litre, only when a pack weight can really be read from the product data.
function perUnitPrice(price, label, selected) {
  const sources = [label, selected?.measurement?.packageWeight, selected?.productHighlights?.quantity, selected?.size];
  for (const src of sources) {
    const m = String(src || "").match(/(\d+(?:\.\d+)?)\s*(kg|kgs|g|gm|gms|gram|grams|l|ltr|litre|liter|ml)\b/i);
    if (!m) continue;
    const qty = Number(m[1]);
    const unit = m[2].toLowerCase();
    if (!qty || !price) continue;
    if (/^(kg|kgs)$/.test(unit)) return `₹${Math.round(price / qty)} / kg`;
    if (/^(g|gm|gms|gram|grams)$/.test(unit)) return `₹${Math.round((price / qty) * 1000)} / kg`;
    if (/^(l|ltr|litre|liter)$/.test(unit)) return `₹${Math.round(price / qty)} / L`;
    if (unit === "ml") return `₹${Math.round((price / qty) * 1000)} / L`;
  }
  return "";
}

const GROUP_LABELS = { material: "Type", color: "Colour", size: "Size", unit: "Pack Size" };

const GROUP_META = {
  material: { Icon: Layers, hint: "Choose your preferred type" },
  color: { Icon: Palette, hint: "Pick your favorite variant" },
  size: { Icon: ShoppingBag, hint: "Choose the right quantity" },
  unit: { Icon: Package, hint: "Select a value pack that suits your need" },
};

function VariantRow({ group, selectedOptionIdMap, onSelectOption }) {
  const ref = useRef(null);
  const meta = GROUP_META[group.type] || { Icon: Layers, hint: "" };
  const scroll = (dir) => ref.current?.scrollBy({ left: dir * 220, behavior: "smooth" });
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-[#f4e3d6] bg-gradient-to-r from-[#fff3ea] to-[#fff8f2] p-3">
      <div className="flex w-[110px] shrink-0 items-center gap-2.5">
        <meta.Icon size={26} strokeWidth={1.7} className="shrink-0 text-[#f96e15]" />
        <div className="min-w-0">
          <p className="text-base font-extrabold leading-tight text-[#2b1208]">{GROUP_LABELS[group.type] || group.label}</p>
          <p className="mt-0.5 text-[11px] leading-tight text-[#6b5a4f]">{meta.hint}</p>
        </div>
      </div>
      <button type="button" aria-label="Scroll left" onClick={() => scroll(-1)} className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-white text-[#2b1208] shadow-sm"><ChevronLeft size={14} /></button>
      <div ref={ref} className="flex min-w-0 flex-1 gap-2.5 overflow-x-auto py-1.5 pr-1 [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: "none" }}>
        {group.options.map((opt) => {
          const isSelected = selectedOptionIdMap[group.type] === opt.id;
          const own = opt.variantObj?.images?.[0];
          const ownUrl = typeof own === "string" ? own : own?.url;
          const colorCode = group.type === "color" ? opt.variantObj?.colorValue || opt.variantObj?.color : "";
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => onSelectOption(group.type, opt)}
              className={`relative flex shrink-0 items-center gap-2.5 rounded-xl border px-3 py-2 text-left transition ${
                isSelected ? "border-[#f96e15] bg-[#fff1e4]" : "border-[#eadfd7] bg-white hover:border-[#d6c6b9]"
              }`}
            >
              {ownUrl ? (
                <img src={ownUrl} alt={opt.label} className="h-10 w-10 shrink-0 rounded-full object-cover" />
              ) : colorCode ? (
                <span className="h-8 w-8 shrink-0 rounded-full border border-gray-300" style={{ backgroundColor: colorCode }} />
              ) : null}
              <span className="min-w-0">
                <span className="block whitespace-nowrap text-sm font-extrabold text-[#2b1208]">{opt.label}</span>
                <span className="block max-w-[120px] truncate text-[11px] text-[#6b5a4f]">{opt.variantObj?.description || opt.price}</span>
              </span>
              {isSelected && (
                <span className="absolute -right-1.5 -top-1.5 grid h-5 w-5 place-items-center rounded-full bg-[#f96e15] text-white"><Check size={12} strokeWidth={3} /></span>
              )}
            </button>
          );
        })}
      </div>
      <button type="button" aria-label="Scroll right" onClick={() => scroll(1)} className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-white text-[#2b1208] shadow-sm"><ChevronRight size={14} /></button>
    </div>
  );
}

function InfoRow({ Icon, title, sub, verified }) {
  return (
    <div className="flex items-center gap-3 py-2.5">
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[#fde9d9] text-[#d9640f]"><Icon size={21} /></span>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 text-[15px] font-extrabold leading-tight text-[#2b1208]">{title}{verified && <BadgeCheck size={17} className="fill-[#24a336] text-white" />}</p>
        {sub && <p className="text-sm text-[#5b4a40]">{sub}</p>}
      </div>
      <ChevronRight size={18} className="shrink-0 text-[#2b1208]" />
    </div>
  );
}

const orangeBtn =
  "bg-gradient-to-b from-[#ff8a1f] to-[#f05a00] text-white shadow-[0_10px_22px_rgba(240,90,0,0.28)] transition hover:brightness-105 active:scale-[0.99]";
const outlineBtn =
  "border border-[#e8c9b0] bg-white/80 text-[#2b1208] shadow-sm transition hover:bg-white";

function Stepper({ quantity, setQuantity }) {
  return (
    <div className="flex h-11 items-center rounded-full border border-[#e3d8cf] bg-white px-2 shadow-sm">
      <button type="button" aria-label="Decrease quantity" onClick={() => setQuantity((q) => Math.max(1, q - 1))} className="grid h-8 w-9 place-items-center text-[#2b1208]">
        <Minus size={16} />
      </button>
      <span className="w-9 text-center text-base font-bold text-[#2b1208]">{quantity}</span>
      <button type="button" aria-label="Increase quantity" onClick={() => setQuantity((q) => q + 1)} className="grid h-8 w-9 place-items-center text-[#2b1208]">
        <Plus size={16} />
      </button>
    </div>
  );
}

function Stars({ value, size = 18 }) {
  return (
    <div className="flex text-[#f9a825]">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star key={i} size={size} fill={i < Math.round(value) ? "currentColor" : "none"} stroke={i < Math.round(value) ? "none" : "#dcd2c9"} />
      ))}
    </div>
  );
}

const scrollToReviews = () =>
  document.getElementById("customer-reviews")?.scrollIntoView({ behavior: "smooth", block: "start" });

/* ───────────── component ───────────── */

export default function ProductHero({
  selected,
  product,
  title,
  galleryThumbs,
  activeImage,
  setActiveImage,
  reviewAverage,
  reviewTotal,
  activePrice,
  activeOldPrice,
  activeSelectedOption,
  groups,
  selectedOptionIdMap,
  onSelectOption,
  quantity,
  setQuantity,
  isOutOfStock,
  isLowStock,
  availableStock,
  onAddToCart,
  isAdded,
  isFavorite,
  onToggleFavorite,
  isUserSignedIn,
  addressLoading,
  userAddress,
  deliveryAddressText,
  onDeliveryClick,
}) {
  const navigate = useNavigate();
  const productId = selected._id || selected.id;

  /* ── own data: categories (breadcrumb), seller, highlights bar ── */
  const [cats, setCats] = useState([]);
  const [seller, setSeller] = useState(null);
  const [trustBar, setTrustBar] = useState({ items: [], isActive: true });

  useEffect(() => {
    let alive = true;
    api.get("/categories/all").then(({ data }) => alive && Array.isArray(data?.data) && setCats(data.data)).catch(() => {});
    api.get("/banners/trust-bar").then(({ data }) => {
      const d = data?.data;
      if (alive && d && Array.isArray(d.items)) setTrustBar({ items: d.items, isActive: d.isActive !== false });
    }).catch(() => {});
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!productId) return undefined;
    let alive = true;
    setSeller(null);
    api.get(`/vendors/seller/${productId}`).then((res) => alive && setSeller(res.data?.data || null)).catch(() => alive && setSeller(null));
    return () => { alive = false; };
  }, [productId]);

  const crumbs = useMemo(() => {
    if (!cats.length) return [];
    const byId = new Map(cats.map((c) => [String(c._id), c]));
    const catId = String(selected.category?._id || selected.category || "");
    const subId = String(selected.subCategory?._id || selected.subCategory || "");
    const leafId = subId && byId.has(subId) ? subId : catId;
    const chain = [];
    let cur = byId.get(leafId);
    let guard = 0;
    while (cur && guard++ < 6) {
      chain.unshift(cur);
      const pid = cur.parentCategory?._id || cur.parentCategory;
      cur = pid ? byId.get(String(pid)) : null;
    }
    if (subId && catId && byId.has(subId) && byId.has(catId) && !chain.some((c) => String(c._id) === catId)) {
      chain.unshift(byId.get(catId));
    }
    return chain;
  }, [cats, selected.category, selected.subCategory]);

  /* ── gallery (images + product videos) ── */
  const videos = useMemo(
    () => (Array.isArray(selected.videos) ? selected.videos.map((v) => v?.url).filter(Boolean) : []),
    [selected.videos]
  );
  const [activeVideo, setActiveVideo] = useState(null);
  const [lightbox, setLightbox] = useState(false);
  const stripRef = useRef(null);

  const items = useMemo(
    () => [...galleryThumbs.map((url) => ({ type: "image", url })), ...videos.map((url) => ({ type: "video", url }))],
    [galleryThumbs, videos]
  );
  const currentIndex = Math.max(
    0,
    items.findIndex((it) => (activeVideo ? it.type === "video" && it.url === activeVideo : it.type === "image" && it.url === activeImage))
  );
  const showItem = (it) => {
    if (!it) return;
    if (it.type === "video") setActiveVideo(it.url);
    else { setActiveVideo(null); setActiveImage(it.url); }
  };
  const step = (dir) => showItem(items[(currentIndex + dir + items.length) % items.length]);

  useEffect(() => { setActiveVideo(null); }, [productId]);

  /* ── badges ── */
  const badges = useMemo(() => {
    const list = [];
    const seen = new Set();
    const add = (label, kind) => {
      const text = String(label || "").trim();
      const key = text.toLowerCase().replace(/[\s-]/g, "");
      if (!text || seen.has(key)) return;
      seen.add(key);
      list.push({ label: text, kind });
    };
    if (selected.isBestSeller) add("Bestseller", "best");
    (selected.badges || []).forEach((b) => (/best\s*-?\s*seller/i.test(b) ? add("Bestseller", "best") : add(b, "tag")));
    const organic = selected.productHighlights?.organic;
    if (organic === true || organic === "true") add("Organic", "tag");
    if (selected.productHighlights?.dietType) add(selected.productHighlights.dietType, "diet");
    list.sort((a, b) => ["best", "tag", "diet"].indexOf(a.kind) - ["best", "tag", "diet"].indexOf(b.kind));
    return list.slice(0, 4);
  }, [selected]);

  const badgeStyle = {
    best: { cls: "bg-[#fde6cf] text-[#7a3a0a]", Icon: Crown, icon: "text-[#f96e15]" },
    tag: { cls: "bg-[#dcf5d2] text-[#14501c]", Icon: Leaf, icon: "text-[#2e9b3c]" },
    diet: { cls: "bg-[#e4e1fb] text-[#2a1f8f]", Icon: Sprout, icon: "text-[#5b4ce0]" },
  };

  /* ── prices ── */
  const priceNum = toNum(activePrice);
  const oldNum = toNum(activeOldPrice);
  const discount = oldNum > priceNum && priceNum > 0 ? Math.round(((oldNum - priceNum) / oldNum) * 100) : 0;
  const perUnit = perUnitPrice(priceNum, activeSelectedOption?.label, selected);

  const description = stripHtml(selected.shortDescription);
  const benefits = getKeyBenefits(selected).slice(0, 4);
  const bullets = (selected.aboutThisProduct || []).filter(Boolean).slice(0, 3);

  /* ── delivery ── */
  const city = userAddress?.city;
  const pin = userAddress?.pincode;
  const deliverTo = !isUserSignedIn
    ? "Enter delivery address"
    : addressLoading
      ? "Loading your address…"
      : userAddress
        ? city || pin
          ? `Deliver to ${[city, pin].filter(Boolean).join(" ")}`
          : deliveryAddressText
        : "Add your delivery address";
  const changeLabel = !isUserSignedIn ? "Login / Add" : userAddress ? "Change" : "Add Address";
  const expected = estimateDelivery(selected.deliveryTime);
  const returnable = selected.returnPolicy?.isReturnable !== false;
  const returnDays = selected.returnPolicy?.returnPeriodDays || 7;

  /* ── notify me (needs POST /products/:id/notify-me on the backend) ── */
  const [notify, setNotify] = useState({ state: "idle", message: "" });
  const handleNotify = async () => {
    if (!isUserSignedIn) {
      navigate(`/signin?redirect=${encodeURIComponent(window.location.pathname)}`);
      return;
    }
    setNotify({ state: "loading", message: "" });
    try {
      await api.post(`/products/${productId}/notify-me`, { variantSku: activeSelectedOption?.variantObj?.sku || undefined });
      setNotify({ state: "done", message: "" });
    } catch (err) {
      setNotify({ state: "error", message: err?.response?.data?.message || "Could not set up the alert. Please try again later." });
    }
  };
  const notifyBtn = (
    <div>
      <button
        type="button"
        onClick={handleNotify}
        disabled={notify.state === "loading" || notify.state === "done"}
        className={`flex h-14 w-full items-center justify-center gap-3 rounded-full px-5 text-lg font-bold ${orangeBtn} disabled:cursor-default disabled:opacity-80`}
      >
        <Bell size={22} />
        <span>
          {notify.state === "done" ? "You'll be notified" : notify.state === "loading" ? "Please wait…" : "Notify Me When Available"}
        </span>
      </button>
      {notify.state === "error" && <p className="mt-2 text-center text-xs font-semibold text-[#d93025]">{notify.message}</p>}
    </div>
  );
  const wishlistBtn = (
    <button type="button" onClick={onToggleFavorite} className={`flex h-12 w-full items-center justify-center gap-2.5 rounded-full text-base font-bold ${outlineBtn}`}>
      <Heart size={20} className={isFavorite ? "fill-[#f96e15] text-[#f96e15]" : ""} />
      {isFavorite ? "In Wishlist" : "Add to Wishlist"}
    </button>
  );

  return (
    <section className="mx-auto max-w-[1360px] px-4 pb-8 pt-5 sm:px-6 lg:px-8">
      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb" className="mb-5 flex flex-wrap items-center gap-2 text-sm text-[#5b4a40]">
        <Link to="/" className="flex items-center gap-2 hover:text-[#f96e15]"><Home size={16} className="text-[#d9640f]" /> Home</Link>
        {crumbs.map((c) => (
          <span key={c._id} className="flex items-center gap-2">
            <ChevronRight size={14} className="text-[#f96e15]" />
            <Link to={`/product?category=${encodeURIComponent(c.name)}`} className="hover:text-[#f96e15]">{c.name}</Link>
          </span>
        ))}
        <ChevronRight size={14} className="text-[#f96e15]" />
        <span className="font-extrabold text-[#2b1208]">{title}</span>
      </nav>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)_380px]">
        {/* ───── Col 1: gallery ───── */}
        <div className="flex flex-col-reverse gap-4 sm:flex-row">
          <div className="flex shrink-0 flex-row items-center gap-3 sm:w-[76px] sm:flex-col">
            <div
              ref={stripRef}
              className="flex gap-3 overflow-x-auto sm:max-h-[420px] sm:flex-col sm:overflow-y-auto sm:overflow-x-hidden [&::-webkit-scrollbar]:hidden"
              style={{ scrollbarWidth: "none" }}
            >
              {items.map((it, idx) => (
                <button
                  key={`${it.type}-${idx}`}
                  type="button"
                  onClick={() => showItem(it)}
                  className={`relative h-[70px] w-[70px] shrink-0 overflow-hidden rounded-xl border-2 bg-[#1d120c] transition ${
                    idx === currentIndex ? "border-[#f96e15]" : "border-transparent opacity-85 hover:opacity-100"
                  }`}
                >
                  {it.type === "image" ? (
                    <img src={it.url} alt={`Thumbnail ${idx + 1}`} className="h-full w-full object-cover" />
                  ) : (
                    <>
                      <video src={it.url} className="h-full w-full object-cover" muted preload="metadata" />
                      <span className="absolute inset-0 grid place-items-center bg-black/30">
                        <span className="grid h-7 w-7 place-items-center rounded-full bg-white text-[#2b1208]"><Play size={13} fill="currentColor" /></span>
                      </span>
                    </>
                  )}
                </button>
              ))}
            </div>
            {items.length > 5 && (
              <button
                type="button"
                aria-label="Scroll thumbnails"
                onClick={() => stripRef.current?.scrollBy({ top: 150, left: 150, behavior: "smooth" })}
                className="hidden h-9 w-9 shrink-0 place-items-center rounded-full border border-gray-200 bg-white text-gray-700 shadow-sm hover:bg-gray-50 sm:grid"
              >
                <ChevronDown size={20} />
              </button>
            )}
          </div>

          <div className="relative min-h-[360px] flex-1 overflow-hidden rounded-[22px] bg-[#1d120c] shadow-md sm:min-h-[480px]">
            {activeVideo ? (
              <video key={activeVideo} src={activeVideo} controls autoPlay className="absolute inset-0 h-full w-full bg-black object-contain" />
            ) : (
              <img src={activeImage} alt={title} className="absolute inset-0 h-full w-full object-cover" />
            )}

            <button
              type="button"
              aria-label={isFavorite ? "Remove from wishlist" : "Add to wishlist"}
              onClick={onToggleFavorite}
              className="absolute right-4 top-4 z-10 grid h-11 w-11 place-items-center rounded-full bg-white/95 text-[#2b1208] shadow-md transition hover:scale-105"
            >
              <Heart size={21} className={isFavorite ? "fill-[#f96e15] text-[#f96e15]" : ""} />
            </button>

            {items.length > 1 && (
              <>
                <button type="button" aria-label="Previous image" onClick={() => step(-1)} className="absolute left-3 top-1/2 z-10 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full bg-white/95 shadow-md hover:bg-white">
                  <ChevronLeft size={20} />
                </button>
                <button type="button" aria-label="Next image" onClick={() => step(1)} className="absolute right-3 top-1/2 z-10 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full bg-white/95 shadow-md hover:bg-white">
                  <ChevronRight size={20} />
                </button>
                <div className="absolute bottom-5 left-1/2 z-10 flex -translate-x-1/2 gap-2">
                  {items.map((_, i) => (
                    <button key={i} type="button" aria-label={`Show item ${i + 1}`} onClick={() => showItem(items[i])} className={`h-2.5 w-2.5 rounded-full ${i === currentIndex ? "bg-[#f96e15]" : "bg-white/70"}`} />
                  ))}
                </div>
              </>
            )}

            <button type="button" aria-label="Expand image" onClick={() => setLightbox(true)} className="absolute bottom-4 right-4 z-10 grid h-11 w-11 place-items-center rounded-full bg-white/95 shadow-md hover:bg-white">
              <Maximize2 size={19} />
            </button>
          </div>
        </div>

        {/* ───── Col 2: info ───── */}
        <div className="flex min-w-0 flex-col">
          {badges.length > 0 && (
            <div className="flex flex-wrap items-center gap-2.5">
              {badges.map((b) => {
                const s = badgeStyle[b.kind];
                return (
                  <span key={b.label} className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-bold ${s.cls}`}>
                    <s.Icon size={15} className={s.icon} /> {b.label}
                  </span>
                );
              })}
            </div>
          )}

          <h1 className="font-display mt-4 text-4xl font-black leading-tight tracking-tight text-[#2b1208] sm:text-5xl">{title}</h1>
          {description && <p className="mt-2 max-w-[520px] text-base leading-relaxed text-[#4a3d35]">{description}</p>}

          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
            {reviewTotal > 0 ? (
              <div className="flex items-center gap-2.5">
                <Stars value={reviewAverage} />
                <span className="text-base font-extrabold text-[#2b1208]">{reviewAverage.toFixed(1)}</span>
                <span className="text-sm text-[#4a3d35]">({reviewTotal} {reviewTotal === 1 ? "Rating" : "Ratings"})</span>
              </div>
            ) : (
              <span className="text-sm font-semibold text-[#4a3d35]">No ratings yet</span>
            )}
            <span className="hidden h-5 w-px bg-[#cfc3ba] sm:block" />
            <button type="button" onClick={scrollToReviews} className="inline-flex items-center gap-2 text-sm font-bold text-[#f96e15] underline decoration-[#f96e15]/60 underline-offset-4">
              <Pencil size={16} /> Write a Review
            </button>
          </div>

          {benefits.length > 0 && (
            <div
              className="mt-5 grid rounded-2xl border border-[#f1dfd2] bg-gradient-to-r from-[#fff3ea] to-[#fff8f2] py-3"
              style={{ gridTemplateColumns: `repeat(${benefits.length}, minmax(0, 1fr))` }}
            >
              {benefits.map((b, i) => (
                <div key={b.label} className={`flex flex-col items-center gap-1.5 px-2 text-center ${i > 0 ? "border-l border-[#ecd5c2]" : ""}`}>
                  <b.Icon size={28} strokeWidth={1.6} className="text-[#f96e15]" />
                  <span className="text-xs font-bold leading-tight text-[#2b1208]">{b.label}</span>
                </div>
              ))}
            </div>
          )}

          {!isOutOfStock && isLowStock && (
            <p className="mt-3 text-base font-extrabold text-[#f96e15]">Only {availableStock} {availableStock === 1 ? "product" : "products"} left</p>
          )}

          {groups.length > 0 && (
            <div className="mt-4 space-y-3">
              {groups.map((group) => (
                <VariantRow key={group.type} group={group} selectedOptionIdMap={selectedOptionIdMap} onSelectOption={onSelectOption} />
              ))}
            </div>
          )}

          {bullets.length > 0 && (
            <div className="mt-4 rounded-2xl border border-[#f1dfd2] bg-gradient-to-r from-[#fff3ea] to-[#fff8f2] p-4">
              <div className="flex items-center gap-2.5">
                <span className="grid h-7 w-7 place-items-center rounded-full bg-[#f96e15] text-white"><Sparkles size={15} /></span>
                <h3 className="font-display text-lg font-black text-[#2b1208]">Product Highlights</h3>
              </div>
              <ul className="mt-3 space-y-2">
                {bullets.map((t, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-sm text-[#2b1208]">
                    <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[#f96e15] text-white"><Check size={12} strokeWidth={3} /></span>
                    {t}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* ───── Col 3: availability + delivery cards ───── */}
        <div className="space-y-4 lg:col-span-2 xl:col-span-1">
          {isOutOfStock ? (
            <div className="rounded-[26px] border border-[#f1dfd2] bg-gradient-to-b from-[#fff3ea] to-[#fdeadd] p-5 text-center shadow-sm">
              <div className="text-left">
                <span className="inline-flex items-center gap-1 rounded-full bg-[#fde0e0] px-2.5 py-0.5 text-xs font-bold text-[#c8231f]"><X size={12} strokeWidth={3} /> Out of Stock</span>
              </div>
              <img src={boxImg} alt="Out of stock" className="mx-auto h-[120px] w-auto object-contain" />
              <h3 className="mt-2 text-2xl font-extrabold text-[#2b1208]">Currently <span className="text-[#f05a00]">Out of Stock</span></h3>
              <p className="mt-1 text-sm text-[#5b4a40]">This product is temporarily unavailable.</p>
              <div className="mt-4 space-y-3">{notifyBtn}{wishlistBtn}</div>
            </div>
          ) : (
            <div className="rounded-[26px] border border-[#f1dfd2] bg-gradient-to-b from-[#fff3ea] to-[#fdeadd] p-5 shadow-sm">
              <span className="inline-flex items-center gap-1 rounded-full bg-[#dcf5d2] px-2.5 py-0.5 text-xs font-bold text-[#14681f]"><Check size={12} strokeWidth={3} /> In Stock</span>
              <div className="mt-2 flex flex-wrap items-baseline gap-3">
                <span className="font-display text-5xl font-black text-[#2b1208]">{activePrice}</span>
                {oldNum > priceNum && <span className="text-xl font-semibold text-gray-400 line-through">{activeOldPrice}</span>}
                {discount > 0 && <span className="rounded-full bg-[#dcf5d2] px-2.5 py-0.5 text-sm font-extrabold text-[#14681f]">{discount}% Off</span>}
              </div>
              <p className="mt-1 text-sm text-[#5b4a40]">Inclusive of all taxes{perUnit ? ` · ${perUnit}` : ""}</p>

              <div className="mt-4 flex items-center gap-4">
                <span className="text-base font-extrabold text-[#2b1208]">Quantity:</span>
                <Stepper quantity={quantity} setQuantity={setQuantity} />
              </div>

              <div className="mt-4 space-y-3">
                <button type="button" onClick={onAddToCart} className={`flex h-14 w-full items-center justify-center gap-3 rounded-2xl px-5 text-lg font-bold ${orangeBtn}`}>
                  <ShoppingCart size={22} />
                  <span className="flex-1 text-left sm:flex-none">{isAdded ? "Added!" : "Add to Cart"}</span>
                  <ChevronRight size={20} />
                </button>
                {wishlistBtn}
              </div>
            </div>
          )}

          <div className="rounded-[26px] border border-[#eadfd7] bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between gap-3 border-b border-[#f1e9e2] pb-3">
              <div className="flex min-w-0 items-center gap-3">
                <MapPin size={24} className="shrink-0 fill-[#f9a03f] text-[#f96e15]" />
                <span className="truncate text-base font-extrabold text-[#2b1208]">{deliverTo}</span>
              </div>
              <button type="button" onClick={onDeliveryClick} className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-[#e8f0ff] px-3.5 py-1.5 text-sm font-bold text-[#2563eb] hover:bg-[#2563eb] hover:text-white">
                <Pencil size={14} /> {changeLabel}
              </button>
            </div>

            <div className="divide-y divide-[#f1e9e2]">
              {seller?.storeName && <InfoRow Icon={ShieldCheck} title={`Sold by ${seller.storeName}`} sub="Trusted Seller" verified />}
              <InfoRow Icon={RefreshCw} title={returnable ? `${returnDays} Days Return & Refund` : "Non-returnable"} sub={returnable ? "Hassle-free returns" : ""} />
              <InfoRow Icon={CreditCard} title="Secure Payments" sub="UPI, Cards, Net Banking & Wallets" />
              {expected && <InfoRow Icon={Truck} title="Fast & Reliable Delivery" sub={`Expected by ${expected}${selected.freeShipping ? " · Free shipping" : ""}`} />}
            </div>
          </div>
        </div>
      </div>

      {/* ───── highlights bar (admin: /admin/banner-images) ───── */}
      {trustBar.isActive && trustBar.items.length > 0 && (
        <ul className="mt-8 grid grid-cols-2 gap-x-4 gap-y-5 rounded-2xl border border-[#f1dfd2] bg-gradient-to-r from-[#fff1e4] to-[#fff7ef] px-5 py-4 lg:grid-flow-col lg:auto-cols-fr lg:gap-y-0">
          {trustBar.items.map((item, i) => {
            const Icon = TRUST_BAR_ICONS[item.icon]?.Icon || Leaf;
            return (
              <li key={`${item.title}-${i}`} className={`flex min-w-0 items-center gap-3 lg:justify-center lg:px-3 ${i > 0 ? "lg:border-l lg:border-[#ecd5c2]" : ""}`}>
                <Icon aria-hidden="true" className="shrink-0 text-[#f96e15]" size={32} strokeWidth={1.6} />
                <div className="min-w-0">
                  <p className="truncate text-sm font-extrabold text-[#2b1208]">{item.title}</p>
                  {item.subtitle ? <p className="truncate text-xs text-[#5b4a40]">{item.subtitle}</p> : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/* ───── lightbox ───── */}
      {lightbox && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/85 p-4" onClick={() => setLightbox(false)}>
          <button type="button" aria-label="Close" className="absolute right-5 top-5 grid h-11 w-11 place-items-center rounded-full bg-white text-[#2b1208]" onClick={() => setLightbox(false)}>
            <X size={22} />
          </button>
          {items.length > 1 && (
            <>
              <button type="button" aria-label="Previous" className="absolute left-4 grid h-11 w-11 place-items-center rounded-full bg-white" onClick={(e) => { e.stopPropagation(); step(-1); }}><ChevronLeft size={22} /></button>
              <button type="button" aria-label="Next" className="absolute right-4 grid h-11 w-11 place-items-center rounded-full bg-white" onClick={(e) => { e.stopPropagation(); step(1); }}><ChevronRight size={22} /></button>
            </>
          )}
          <div onClick={(e) => e.stopPropagation()} className="max-h-full max-w-[92vw]">
            {activeVideo ? (
              <video src={activeVideo} controls autoPlay className="max-h-[88vh] max-w-full rounded-xl" />
            ) : (
              <img src={activeImage} alt={title} className="max-h-[88vh] max-w-full rounded-xl object-contain" />
            )}
          </div>
        </div>
      )}
    </section>
  );
}
