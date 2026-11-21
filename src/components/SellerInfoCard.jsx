import { useEffect, useState } from "react";
import { Store } from "lucide-react";
import api from "../services/api";

function tenureLabel(memberSince) {
  if (!memberSince) return null;
  const start = new Date(memberSince);
  if (Number.isNaN(start.getTime())) return null;
  const now = new Date();
  const months = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth());
  const years = Math.floor(months / 12);
  if (years >= 1) return `${years} ${years === 1 ? "year" : "years"} with Machinichi`;
  if (months >= 1) return `${months} ${months === 1 ? "month" : "months"} with Machinichi`;
  return "New on Machinichi";
}

/**
 * "Seller: <store name> · 4.5★ • 5 years with Machinichi" card for the product page.
 * Loads its own data from the public seller endpoint, and renders nothing until it has it
 * (or if the request fails), so it can never break the product page.
 */
export default function SellerInfoCard({ productId, className = "" }) {
  const [seller, setSeller] = useState(null);

  useEffect(() => {
    if (!productId) return undefined;
    let alive = true;
    setSeller(null);
    api
      .get(`/vendors/seller/${productId}`)
      .then((res) => alive && setSeller(res.data?.data || null))
      .catch(() => alive && setSeller(null));
    return () => { alive = false; };
  }, [productId]);

  if (!seller?.storeName) return null;

  const tenure = tenureLabel(seller.memberSince);
  const hasRating = typeof seller.rating === "number" && seller.rating > 0;
  const details = [hasRating ? `${seller.rating.toFixed(1)}★` : null, tenure].filter(Boolean);

  return (
    <div className={`mt-3 flex items-start gap-3 rounded-[10px] bg-[#f3f3f3] px-4 py-3.5 ${className}`} data-testid="seller-info">
      <Store size={20} className="mt-0.5 shrink-0 text-[#4a4a4a]" strokeWidth={1.8} />
      <div className="min-w-0">
        <p className="truncate text-[15px] text-[#212121]">
          Seller: <span className="font-semibold">{seller.storeName}</span>
        </p>
        <p className="mt-0.5 text-[13px] text-[#6b6b6b]">
          {details.length ? details.join(" • ") : "No ratings yet"}
        </p>
      </div>
    </div>
  );
}
