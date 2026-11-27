import { useState } from "react";
import {
  Check,
  FileText,
  Heart,
  Hourglass,
  Info,
  Layers,
  Leaf,
  MapPin,
  Package,
  Ruler,
  ShoppingBag,
  Sparkles,
  Sprout,
  Store,
  Tag,
} from "lucide-react";
import { getKeyBenefits } from "./productBenefits";

const card = "rounded-2xl border border-[#f1dfd2] bg-gradient-to-br from-[#fff7ef] to-[#fffaf5] shadow-[0_6px_18px_rgba(240,120,40,0.07)]";
const CHIP_COLORS = ["text-[#2e9b3c]", "text-[#7c3aed]", "text-[#2e9b3c]", "text-[#f96e15]", "text-[#2563eb]", "text-[#e5173f]"];

function SectionHead({ Icon, title, subtitle, solid = false }) {
  return (
    <div className="flex items-center gap-4">
      <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-xl ${solid ? "bg-[#f96e15] text-white" : "text-[#f96e15]"}`}>
        <Icon size={solid ? 26 : 34} strokeWidth={solid ? 2 : 1.6} />
      </span>
      <div>
        <h2 className="font-display text-xl font-black text-[#2b1208]">{title}</h2>
        <p className="text-sm text-[#5b4a40]">{subtitle}</p>
      </div>
    </div>
  );
}

function DetailRow({ Icon, label, children, shaded }) {
  return (
    <div className={`flex items-center gap-4 rounded-lg px-3 py-2.5 ${shaded ? "bg-[#f9efe6]" : ""}`}>
      <span className="grid h-8 w-8 shrink-0 place-items-center text-[#f96e15]"><Icon size={20} strokeWidth={1.7} /></span>
      <span className="w-[44%] text-sm font-medium text-[#2b1208]">{label}</span>
      <span className="min-w-0 flex-1 text-sm font-extrabold text-[#2b1208]">{children}</span>
    </div>
  );
}

const Pill = ({ tone, children }) => (
  <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-0.5 text-sm font-extrabold ${tone === "bad" ? "bg-[#fde0e0] text-[#c8231f]" : "bg-[#dcf5d2] text-[#14501c]"}`}>{children}</span>
);

const withUnit = (raw, unit) => {
  if (!raw) return "";
  const s = String(raw).trim();
  return /[a-zA-Z]$/.test(s) ? s : `${s}${unit}`;
};

export default function ProductInfoSections({ selected, product, storeBrandName, activeDescription, highlightIcon }) {
  const [tab, setTab] = useState("description");
  const [expanded, setExpanded] = useState(false);

  const h = product.productHighlights || {};
  const benefits = getKeyBenefits(selected).slice(0, 6);
  const loveItems = (h.items || []).filter((i) => i?.title);
  const about = (product.aboutThisProduct || []).filter(Boolean);
  const features = (product.additionalFeatures || []).filter((f) => f?.label);

  const organicRaw = h.organic;
  const organic =
    organicRaw === undefined || organicRaw === null || organicRaw === ""
      ? null
      : organicRaw === true || organicRaw === "true" || /^yes$/i.test(String(organicRaw))
        ? "Yes"
        : organicRaw === false || organicRaw === "false" || /^no$/i.test(String(organicRaw))
          ? "No"
          : String(organicRaw);

  const rows = [
    { Icon: Tag, label: "Brand", value: storeBrandName },
    { Icon: Layers, label: "Type", value: h.type || product.category?.name },
    { Icon: ShoppingBag, label: "Quantity", value: h.quantity || product.availableSizes?.[0] },
    { Icon: Hourglass, label: "Maximum Shelf Life", value: h.maximumShelfLife },
    { Icon: Leaf, label: "Organic", value: organic, kind: "organic" },
    { Icon: Sprout, label: "Diet Type", value: h.dietType, kind: "diet" },
    { Icon: MapPin, label: "Country of Origin", value: h.countryOfOrigin || product.countryOfOrigin },
    { Icon: Store, label: "Seller", value: h.seller },
  ].filter((r) => r.value);

  const tabs = [
    { id: "description", label: "Product Description", Icon: FileText },
    ...(features.length ? [{ id: "features", label: "Additional Features", Icon: Sparkles }] : []),
  ];
  const activeTab = tabs.some((t) => t.id === tab) ? tab : "description";
  const longText = String(activeDescription || "").length > 280;
  const shownText = longText && !expanded ? `${String(activeDescription).slice(0, 280).trim()}…` : activeDescription;

  const weight = withUnit(product.measurement?.packageWeight || product.packageWeight || product.weight, "g") || "—";
  const height = withUnit(product.measurement?.height || product.dimensions?.height, " cm") || "—";
  const sizes = (product.measurement?.sizes?.length > 0 ? product.measurement.sizes : product.availableSizes?.length > 0 ? product.availableSizes : ["Default"]).join(" / ");
  const stats = [
    { Icon: ShoppingBag, label: "Package Weight", value: weight },
    { Icon: Ruler, label: "Height", value: height },
    { Icon: Layers, label: "No. of Items", value: product.measurement?.numberOfItems ?? 1 },
    { Icon: Package, label: "Available Size", value: sizes },
  ];

  return (
    <div className="mx-auto max-w-[1360px] space-y-5 px-4 py-6 sm:px-6 lg:px-8">
      {/* Product Highlights strip */}
      {benefits.length > 0 && (
        <section className={`${card} flex flex-col gap-4 px-6 py-4 lg:flex-row lg:items-center`}>
          <SectionHead Icon={Sparkles} solid title="Product Highlights" subtitle="Key benefits at a glance" />
          <ul className="flex flex-1 flex-wrap items-center gap-y-3 lg:justify-end">
            {benefits.map((b, i) => (
              <li key={b.label} className={`flex items-center gap-2.5 px-4 ${i > 0 ? "lg:border-l lg:border-[#ecd5c2]" : ""}`}>
                <b.Icon size={26} strokeWidth={1.6} className={CHIP_COLORS[i % CHIP_COLORS.length]} />
                <span className="text-sm font-bold leading-tight text-[#2b1208]">{b.label}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Product Details + Why You'll Love It */}
      {(rows.length > 0 || loveItems.length > 0) && (
        <div className={`grid gap-5 ${rows.length > 0 && loveItems.length > 0 ? "lg:grid-cols-[0.9fr_1.4fr]" : ""}`}>
          {rows.length > 0 && (
            <section className={`${card} p-6`}>
              <SectionHead Icon={Layers} title="Product Details" subtitle="Key specifications of this product" />
              <div className="mt-2 h-0.5 w-8 rounded bg-[#f96e15]" />
              <div className="mt-3">
                {rows.map((r, i) => (
                  <DetailRow key={r.label} Icon={r.Icon} label={r.label} shaded={i % 2 === 1}>
                    {r.kind === "organic" && (r.value === "Yes" || r.value === "No") ? (
                      <Pill tone={r.value === "No" ? "bad" : "good"}>{r.value}</Pill>
                    ) : r.kind === "diet" ? (
                      <Pill tone={/non/i.test(r.value) ? "bad" : "good"}><Leaf size={14} /> {r.value}</Pill>
                    ) : (
                      r.value
                    )}
                  </DetailRow>
                ))}
              </div>
            </section>
          )}

          {loveItems.length > 0 && (
            <section className={`${card} p-6`}>
              <SectionHead Icon={Heart} title="Why You’ll Love It" subtitle="Top reasons to choose this product" />
              <div className="mt-2 h-0.5 w-8 rounded bg-[#f96e15]" />
              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {loveItems.map((item, i) => (
                  <div key={`${item.title}-${i}`} className="rounded-2xl border border-[#f4e3d6] bg-white/70 p-4">
                    <span className="grid h-11 w-11 place-items-center rounded-xl bg-[#fde9d9] text-xl">{item.icon || highlightIcon(item.title)}</span>
                    <h3 className="mt-2 text-lg font-extrabold leading-tight text-[#2b1208]">{item.title}</h3>
                    {item.description && <p className="mt-1 text-sm leading-snug text-[#5b4a40]">{item.description}</p>}
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {/* About This Product strip */}
      {about.length > 0 && (
        <section className={`${card} flex flex-col gap-4 px-6 py-4 lg:flex-row lg:items-center`}>
          <div className="flex shrink-0 items-center gap-4 lg:border-r lg:border-[#ecd5c2] lg:pr-6">
            <span className="grid h-11 w-11 place-items-center rounded-full bg-[#f96e15] text-white"><Info size={24} /></span>
            <div>
              <h2 className="font-display text-xl font-black text-[#2b1208]">About This Product</h2>
              <p className="text-sm text-[#5b4a40]">What makes it special</p>
            </div>
          </div>
          <ul className="grid flex-1 gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
            {about.slice(0, 6).map((t, i) => (
              <li key={i} className="flex items-center gap-2.5 text-sm leading-tight text-[#2b1208]">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[#f96e15] text-white"><Check size={14} strokeWidth={3} /></span>
                {t}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Tabs */}
      <section className={`${card} overflow-hidden`}>
        <div className="flex flex-wrap border-b border-[#f1dfd2] bg-[#fdf3ea]">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`relative flex items-center gap-2.5 px-6 py-3.5 text-base font-extrabold transition ${
                activeTab === t.id ? "rounded-t-xl bg-gradient-to-b from-[#ff8a1f] to-[#f05a00] text-white" : "text-[#2b1208] hover:text-[#f96e15]"
              }`}
            >
              <t.Icon size={20} /> {t.label}
              {activeTab === t.id && <span className="absolute -bottom-1.5 left-1/2 h-3 w-3 -translate-x-1/2 rotate-45 bg-[#f05a00]" />}
            </button>
          ))}
        </div>
        <div className="p-6">
          {activeTab === "description" ? (
            <>
              <p className="whitespace-pre-line text-[15px] leading-relaxed text-[#2b1208]">{shownText}</p>
              {longText && (
                <button type="button" onClick={() => setExpanded((v) => !v)} className="mt-2 text-sm font-extrabold text-[#f96e15] underline underline-offset-4">
                  {expanded ? "Read Less" : "Read More"}
                </button>
              )}
              {selected.tags?.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-5 text-sm font-bold text-[#2b1208]">
                  {selected.tags.map((tag) => (
                    <span key={tag} className="flex items-center gap-2"><Tag size={15} className="text-[#f96e15]" /> {tag}</span>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {features.map((f, i) => (
                <div key={`${f.label}-${i}`} className="flex items-center gap-3 rounded-xl bg-white/70 px-4 py-3 text-sm">
                  <Sparkles size={18} className="shrink-0 text-[#f96e15]" />
                  <span className="font-extrabold text-[#2b1208]">{f.label}</span>
                  <span className="text-[#5b4a40]">: {f.value}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Measurement & Packaging */}
      <section className={`${card} flex flex-col gap-4 px-6 py-4 lg:flex-row lg:items-center`}>
        <div className="flex shrink-0 items-center gap-4 lg:border-r lg:border-[#ecd5c2] lg:pr-6">
          <Package size={36} strokeWidth={1.6} className="text-[#f96e15]" />
          <div>
            <h2 className="font-display text-xl font-black text-[#2b1208]">Measurement &amp; Packaging</h2>
            <p className="text-sm text-[#5b4a40]">Size, weight and packaging details</p>
          </div>
        </div>
        <div className="grid flex-1 grid-cols-2 gap-3 lg:grid-cols-4">
          {stats.map((s) => (
            <div key={s.label} className="flex items-center gap-3 rounded-xl bg-white/70 px-4 py-3 shadow-sm">
              <s.Icon size={28} strokeWidth={1.6} className="shrink-0 text-[#f96e15]" />
              <div className="min-w-0">
                <p className="text-xs text-[#2b1208]">{s.label}</p>
                <p className="truncate text-lg font-extrabold text-[#2b1208]">{s.value}</p>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
