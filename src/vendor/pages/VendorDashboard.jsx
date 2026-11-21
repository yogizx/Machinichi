import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  BadgePercent, Boxes, Loader2, PackageCheck, PackageX, RotateCcw, Star, TrendingUp, TriangleAlert,
} from "lucide-react";
import AdminLayout from "../../admin/components/AdminLayout";
import api from "../../services/api";

const money = (n) => `₹${Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

export default function VendorDashboard({ onAdminLogout }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    api
      .get("/vendor/dashboard")
      .then((res) => alive && setData(res.data?.data))
      .catch((err) => alive && setError(err.response?.data?.message || "Could not load your dashboard."));
    return () => { alive = false; };
  }, []);

  const cards = data && [
    { label: "Total products", value: data.products.total, icon: Boxes, to: "/vendor/product-listing" },
    { label: "Live in store", value: data.products.published, icon: PackageCheck, to: "/vendor/product-listing" },
    { label: "Low stock", value: data.products.lowStock, icon: TriangleAlert, to: "/vendor/inventory", warn: data.products.lowStock > 0 },
    { label: "Out of stock", value: data.products.outOfStock, icon: PackageX, to: "/vendor/inventory", warn: data.products.outOfStock > 0 },
    { label: "Returns to handle", value: data.returns.pending, icon: RotateCcw, to: "/vendor/return-request", warn: data.returns.pending > 0 },
    { label: "Live coupons", value: data.coupons.live, icon: BadgePercent, to: "/vendor/offers-coupons" },
  ];

  return (
    <AdminLayout onAdminLogout={onAdminLogout}>
      <div className="min-h-screen bg-[#fff7f0] px-4 py-5 text-[#21150f] sm:px-6 lg:px-8">
        <header className="border-b border-[#eaded6] pb-5">
          <h1 className="text-[22px] font-black tracking-[-0.02em] text-[#7a1f06]">
            {data?.store?.name || "Vendor Dashboard"}
          </h1>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] font-medium text-[#8a7a70]">
            {data?.store?.vendorCode && <span className="font-mono font-bold text-[#5a4b42]">{data.store.vendorCode}</span>}
            {data?.store && (
              <span className="inline-flex items-center gap-1">
                <Star size={13} className="fill-[#e6a100] text-[#e6a100]" />
                {data.store.rating ? `${data.store.rating.toFixed(1)} (${data.store.ratingCount} reviews)` : "No ratings yet"}
              </span>
            )}
          </p>
        </header>

        {error && (
          <p role="alert" className="mt-6 rounded-[10px] border border-red-200 bg-red-50 px-4 py-3 text-[13px] font-semibold text-red-700">{error}</p>
        )}

        {!data && !error && (
          <div className="flex items-center justify-center py-24">
            <Loader2 size={28} className="animate-spin text-[#c35416]" />
          </div>
        )}

        {data && (
          <>
            <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {cards.map(({ label, value, icon: Icon, to, warn }) => (
                <Link key={label} to={to}
                  className={`group rounded-[12px] border bg-white p-5 shadow-[0_12px_24px_rgba(66,36,18,0.05)] transition hover:-translate-y-0.5 ${warn ? "border-amber-300" : "border-[#eaded6]"}`}>
                  <div className="flex items-center justify-between">
                    <p className="text-[11px] font-black uppercase tracking-[0.11em] text-[#9a8a80]">{label}</p>
                    <span className={`grid h-9 w-9 place-items-center rounded-[8px] ${warn ? "bg-amber-50 text-amber-700" : "bg-[#fff1e8] text-[#c7470a]"}`}>
                      <Icon size={17} />
                    </span>
                  </div>
                  <p className="mt-3 text-[32px] font-black tracking-[-0.04em] text-[#18100b]">{value}</p>
                </Link>
              ))}
            </section>

            <section className="mt-6 grid gap-4 lg:grid-cols-[1fr_1.2fr]">
              <article className="rounded-[12px] border border-[#eaded6] bg-white p-6 shadow-[0_12px_24px_rgba(66,36,18,0.05)]">
                <div className="flex items-center gap-2.5">
                  <span className="grid h-9 w-9 place-items-center rounded-[8px] bg-[#fff1e8] text-[#c7470a]"><TrendingUp size={17} /></span>
                  <h2 className="text-[15px] font-black text-[#2b1b12]">Sales (paid orders)</h2>
                </div>
                <dl className="mt-5 grid grid-cols-2 gap-5">
                  <div><dt className="text-[11px] font-black uppercase tracking-[0.08em] text-[#9a8a80]">Last 30 days</dt>
                    <dd className="mt-1 text-[24px] font-black text-[#18100b]">{money(data.sales.revenue30)}</dd>
                    <dd className="text-[12px] text-[#8a7a70]">{data.sales.units30} units</dd></div>
                  <div><dt className="text-[11px] font-black uppercase tracking-[0.08em] text-[#9a8a80]">All time</dt>
                    <dd className="mt-1 text-[24px] font-black text-[#18100b]">{money(data.sales.revenue)}</dd>
                    <dd className="text-[12px] text-[#8a7a70]">{data.sales.units} units · {data.sales.orders} orders</dd></div>
                </dl>
                {data.coupons.awaitingApproval > 0 && (
                  <p className="mt-5 rounded-[8px] bg-amber-50 px-3 py-2 text-[12px] font-semibold text-amber-800">
                    {data.coupons.awaitingApproval} coupon{data.coupons.awaitingApproval > 1 ? "s are" : " is"} waiting for Machinichi admin to switch on.
                  </p>
                )}
              </article>

              <article className="rounded-[12px] border border-[#eaded6] bg-white p-6 shadow-[0_12px_24px_rgba(66,36,18,0.05)]">
                <h2 className="text-[15px] font-black text-[#2b1b12]">Top products</h2>
                {data.topProducts.length === 0 ? (
                  <p className="mt-4 text-[13px] text-[#8a7a70]">No sales yet. Add products in Product Listing and publish them to the store.</p>
                ) : (
                  <ul className="mt-4 divide-y divide-[#efe7e0]">
                    {data.topProducts.map((p) => (
                      <li key={p._id} className="flex items-center justify-between gap-4 py-3">
                        <span className="truncate text-[13px] font-bold text-[#2f2119]">{p.name}</span>
                        <span className="shrink-0 text-right text-[13px] font-black text-[#18100b]">
                          {money(p.revenue)} <span className="font-medium text-[#8a7a70]">· {p.units} sold</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </article>
            </section>
          </>
        )}
      </div>
    </AdminLayout>
  );
}
