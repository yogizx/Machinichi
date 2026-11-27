import { Hourglass, Leaf, RefreshCw, ShieldCheck, Sprout, Tag, Truck, Wallet } from "lucide-react";

const cap = (s) => String(s || "").trim().replace(/^./, (c) => c.toUpperCase());

/**
 * Key benefits shown as icon chips on the product page.
 * Every entry is derived from real product data saved in the admin panel – nothing is hard-coded.
 */
export function getKeyBenefits(p = {}) {
  const list = [];
  const seen = new Set();
  const add = (label, Icon) => {
    const text = String(label || "").trim();
    const key = text.toLowerCase();
    if (!text || seen.has(key)) return;
    seen.add(key);
    list.push({ label: text, Icon });
  };

  const h = p.productHighlights || {};
  if (h.dietType) add(h.dietType, Sprout);
  const organic = String(h.organic ?? "").toLowerCase();
  if (organic === "true" || organic === "yes") add("Organic", Leaf);
  if (h.maximumShelfLife) add(`${h.maximumShelfLife} Shelf Life`, Hourglass);

  if (p.freeShipping) add("Free Shipping", Truck);
  else if (p.deliveryTime) add(`Delivery in ${p.deliveryTime}`, Truck);

  if (p.returnPolicy && p.returnPolicy.isReturnable !== false) {
    add(`${p.returnPolicy.returnPeriodDays || 7}-Day Returns`, RefreshCw);
  }
  if (p.codAvailable) add("Cash on Delivery", Wallet);
  if (p.compliance?.fssai) add("FSSAI Certified", ShieldCheck);
  (p.compliance?.productCertifications || []).forEach((c) => add(c, ShieldCheck));
  (Array.isArray(p.tags) ? p.tags : []).slice(0, 3).forEach((t) => add(cap(t), Tag));

  return list;
}
