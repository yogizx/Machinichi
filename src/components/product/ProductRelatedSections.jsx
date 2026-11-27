import { useRef, useState } from "react";
import { Box, ChevronLeft, ChevronRight, Heart, Package, Plus, ShoppingBag, ShoppingCart, Star, Zap } from "lucide-react";

const card = "rounded-2xl border border-[#f1dfd2] bg-gradient-to-br from-[#fff7ef] to-[#fffaf5] shadow-[0_6px_18px_rgba(240,120,40,0.07)]";
const inr = (n) => `₹${Number(n || 0).toLocaleString("en-IN")}`;
const pct = (price, mrp) => (mrp > price && price > 0 ? Math.round(((mrp - price) / mrp) * 100) : 0);
const orangeBtn =
  "bg-gradient-to-b from-[#ff8a1f] to-[#f05a00] text-white shadow-[0_8px_18px_rgba(240,90,0,0.25)] transition hover:brightness-105 active:scale-[0.99]";

function Thumb({ src, alt, className = "" }) {
  return src ? (
    <img src={src} alt={alt} className={`object-contain ${className}`} />
  ) : (
    <div className={`grid place-items-center text-[#d8c7ba] ${className}`}><Package size={36} /></div>
  );
}

function FrequentlyBought({ items, onAddBundle }) {
  const [checked, setChecked] = useState({});
  const [busy, setBusy] = useState(false);
  const isOn = (id) => checked[id] !== false;
  const chosen = items.filter((i) => isOn(i.id));
  const total = chosen.reduce((s, i) => s + i.price, 0);
  const mrpTotal = chosen.reduce((s, i) => s + (i.mrp > i.price ? i.mrp : i.price), 0);
  const off = pct(total, mrpTotal);

  const add = async () => {
    if (!chosen.length || busy) return;
    setBusy(true);
    try {
      await onAddBundle(chosen.map((i) => i.id));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section>
      <div className="flex items-center gap-4">
        <span className="grid h-12 w-12 place-items-center rounded-xl bg-[#f96e15] text-white"><ShoppingCart size={24} /></span>
        <div>
          <h2 className="font-display text-2xl font-black text-[#2b1208]">Frequently Bought Together</h2>
          <p className="text-sm text-[#5b4a40]">Save more by buying these items together</p>
        </div>
      </div>

      <div className="mt-3 grid gap-4 lg:grid-cols-[1fr_340px]">
        <div className={`${card} flex flex-wrap items-center gap-x-4 gap-y-4 p-5`}>
          {items.map((it, i) => (
            <div key={it.id} className="flex items-center gap-4">
              <Thumb src={it.image} alt={it.name} className="h-[110px] w-[90px] shrink-0" />
              <div className="min-w-0">
                <p className="max-w-[170px] text-sm font-bold leading-tight text-[#2b1208]">{it.name}{it.size ? ` – ${it.size}` : ""}</p>
                <label className="mt-2 flex cursor-pointer items-center gap-2">
                  <input type="checkbox" checked={isOn(it.id)} onChange={() => setChecked((c) => ({ ...c, [it.id]: !isOn(it.id) }))} className="h-5 w-5 accent-[#f96e15]" />
                </label>
                <p className="mt-1 text-xl font-black text-[#2b1208]">{inr(it.price)}</p>
              </div>
              {i < items.length - 1 && (
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-[#f1dfd2] bg-white text-[#f96e15]"><Plus size={16} /></span>
              )}
            </div>
          ))}
        </div>

        <div className={`${card} p-5`}>
          <p className="flex items-center gap-3 text-base font-extrabold text-[#2b1208]">
            <ShoppingBag size={22} className="text-[#f96e15]" /> Buy all {chosen.length} {chosen.length === 1 ? "item" : "items"} together
          </p>
          <div className="mt-3 flex flex-wrap items-baseline gap-3">
            <span className="font-display text-4xl font-black text-[#2b1208]">{inr(total)}</span>
            {off > 0 && <span className="text-lg font-semibold text-gray-400 line-through">{inr(mrpTotal)}</span>}
            {off > 0 && <span className="rounded-lg bg-[#fde0e0] px-2.5 py-1 text-sm font-extrabold text-[#e5173f]">{off}% OFF</span>}
          </div>
          <button type="button" onClick={add} disabled={!chosen.length || busy} className={`mt-4 flex h-12 w-full items-center justify-center gap-2.5 rounded-xl text-base font-bold disabled:opacity-60 ${orangeBtn}`}>
            <ShoppingCart size={20} /> {busy ? "Adding…" : `Add ${chosen.length} to Cart`}
          </button>
        </div>
      </div>
    </section>
  );
}

function badgeFor(raw = {}) {
  if (raw.isBestSeller) return { label: "Bestseller", cls: "bg-[#f96e15]", Icon: Star };
  if (raw.isTrending) return { label: "Popular", cls: "bg-[#2e9b3c]", Icon: Zap };
  if (raw.isNewArrival) return { label: "New", cls: "bg-[#2563eb]", Icon: Zap };
  return null;
}

function Related({ items, favoriteProducts, onFavoriteToggle, onAdd, onOpen, onViewAll }) {
  const ref = useRef(null);
  const scroll = (dir) => ref.current?.scrollBy({ left: dir * 300, behavior: "smooth" });

  return (
    <section>
      <div className="flex flex-wrap items-center gap-4">
        <span className="grid h-12 w-12 place-items-center rounded-full bg-[#f96e15] text-white"><Box size={24} /></span>
        <div className="mr-auto">
          <h2 className="font-display text-2xl font-black text-[#2b1208]">Products Related to <span className="text-[#f96e15]">This Item</span></h2>
          <p className="text-sm text-[#5b4a40]">Discover more products you might love</p>
        </div>
        <button type="button" onClick={onViewAll} className="inline-flex items-center gap-2 rounded-full border border-[#f4b98c] bg-white/70 px-4 py-2 text-sm font-bold text-[#f96e15] hover:bg-white">
          View All Products <ChevronRight size={16} />
        </button>
        <button type="button" aria-label="Previous" onClick={() => scroll(-1)} className="grid h-10 w-10 place-items-center rounded-full bg-[#fde9d9] text-[#f96e15] hover:bg-[#fbd9bd]"><ChevronLeft size={20} /></button>
        <button type="button" aria-label="Next" onClick={() => scroll(1)} className="grid h-10 w-10 place-items-center rounded-full bg-[#f96e15] text-white hover:bg-[#e05d09]"><ChevronRight size={20} /></button>
      </div>

      <div ref={ref} className="mt-4 flex gap-4 overflow-x-auto pb-2 [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: "none" }}>
        {items.map((it) => {
          const badge = badgeFor(it.raw);
          const off = pct(it.price, it.mrp);
          const fav = favoriteProducts?.has?.(it.name);
          return (
            <div key={it._id || it.slug || it.name} className={`${card} relative flex w-[200px] shrink-0 flex-col p-3`}>
              {badge && (
                <span className={`absolute left-2 top-2 z-10 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold text-white ${badge.cls}`}>
                  <badge.Icon size={12} fill="currentColor" /> {badge.label}
                </span>
              )}
              <button type="button" aria-label="Wishlist" onClick={() => onFavoriteToggle(it.name, it._id)} className="absolute right-2 top-2 z-10 grid h-8 w-8 place-items-center rounded-full bg-white/90 text-[#2b1208] shadow-sm">
                <Heart size={16} className={fav ? "fill-[#f96e15] text-[#f96e15]" : ""} />
              </button>
              <button type="button" onClick={() => it.slug && onOpen(it.slug)} className="mt-6 block text-left">
                <Thumb src={it.image} alt={it.name} className="mx-auto h-[130px] w-full" />
                <h3 className="mt-3 line-clamp-2 text-sm font-extrabold leading-tight text-[#2b1208]">{it.name}</h3>
              </button>
              {it.size && <p className="mt-0.5 text-sm text-[#5b4a40]">{it.size}</p>}
              {it.rating > 0 && (
                <p className="mt-1 flex items-center gap-1 text-sm font-bold text-[#2b1208]">
                  <Star size={14} fill="#f9a825" stroke="none" /> {it.rating.toFixed(1)}
                  {it.ratingCount > 0 && <span className="font-medium text-[#5b4a40]">({it.ratingCount})</span>}
                </p>
              )}
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <span className="text-xl font-black text-[#2b1208]">{inr(it.price)}</span>
                {it.mrp > it.price && <span className="text-sm text-gray-400 line-through">{inr(it.mrp)}</span>}
                {off > 0 && <span className="rounded-md bg-[#fde0e0] px-1.5 py-0.5 text-[11px] font-extrabold text-[#e5173f]">{off}% OFF</span>}
              </div>
              <button type="button" onClick={() => onAdd(it)} className={`mt-3 flex h-10 w-full items-center justify-center gap-2 rounded-xl text-sm font-bold ${orangeBtn}`}>
                <ShoppingCart size={16} /> Add to Cart
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export default function ProductRelatedSections({ bundleItems, onAddBundle, related, favoriteProducts, onFavoriteToggle, onAddRelated, onOpen, onViewAll }) {
  if (bundleItems.length < 2 && related.length === 0) return null;
  return (
    <div className="mx-auto max-w-[1360px] space-y-8 px-4 py-6 sm:px-6 lg:px-8">
      {bundleItems.length >= 2 && <FrequentlyBought items={bundleItems} onAddBundle={onAddBundle} />}
      {related.length > 0 && (
        <Related items={related} favoriteProducts={favoriteProducts} onFavoriteToggle={onFavoriteToggle} onAdd={onAddRelated} onOpen={onOpen} onViewAll={onViewAll} />
      )}
    </div>
  );
}
