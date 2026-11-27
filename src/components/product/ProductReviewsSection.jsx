import { useMemo, useState } from "react";
import { CheckCircle2, ChevronLeft, ChevronRight, Leaf, MessageSquareQuote, RefreshCw, Star, ThumbsUp, X } from "lucide-react";

const card = "rounded-2xl border border-[#f1dfd2] bg-gradient-to-br from-[#fff7ef] to-[#fffaf5] shadow-[0_6px_18px_rgba(240,120,40,0.07)]";

function timeAgo(date) {
  if (!date) return "";
  const diff = Math.max(0, Date.now() - new Date(date).getTime());
  const day = 86400000;
  const days = Math.floor(diff / day);
  const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"} ago`;
  if (days < 1) return "Today";
  if (days < 7) return plural(days, "day");
  if (days < 30) return plural(Math.floor(days / 7), "week");
  if (days < 365) return plural(Math.floor(days / 30), "month");
  return plural(Math.floor(days / 365), "year");
}

function ReviewCard({ rev, isTop }) {
  const user = rev.userId || {};
  const name = user.fullName || "Verified Customer";
  const text = rev.comment || rev.body || "";
  const votes = Number(rev.helpfulVotes) || 0;
  return (
    <div className={`relative flex flex-col rounded-2xl bg-white/70 p-5 shadow-sm ${isTop ? "border-2 border-[#f96e15]" : "border border-[#f1dfd2]"}`}>
      {isTop && (
        <span className="absolute -top-3.5 left-1/2 inline-flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-gradient-to-b from-[#ff8a1f] to-[#f05a00] px-4 py-1 text-sm font-bold text-white">
          <Star size={14} fill="currentColor" /> Top Review
        </span>
      )}
      <div className="flex items-start gap-3">
        {user.avatar ? (
          <img src={user.avatar} alt={name} className="h-12 w-12 rounded-full object-cover" />
        ) : (
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-gradient-to-br from-[#f96e15] to-[#f6a821] text-lg font-black text-white">
            {name.charAt(0).toUpperCase()}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <h4 className="truncate text-base font-extrabold text-[#5a1a0a]">{name}</h4>
          {rev.isVerifiedPurchase && (
            <span className="mt-0.5 inline-flex items-center gap-1 rounded-full bg-[#dcf5d2] px-2.5 py-0.5 text-xs font-bold text-[#14681f]">
              <CheckCircle2 size={13} /> Verified Purchase
            </span>
          )}
        </div>
        <MessageSquareQuote size={26} className="shrink-0 text-[#f6c39a]" />
      </div>
      <div className="mt-2 flex items-center gap-2">
        <div className="flex text-[#f9a825]">
          {Array.from({ length: 5 }).map((_, i) => (
            <Star key={i} size={16} fill={i < rev.rating ? "currentColor" : "none"} stroke={i < rev.rating ? "none" : "#dcd2c9"} />
          ))}
        </div>
        {rev.createdAt && <span className="border-l border-[#cfc3ba] pl-2 text-sm text-[#5b4a40]">{timeAgo(rev.createdAt)}</span>}
      </div>
      <p className="mt-2 flex-1 text-[15px] leading-snug text-[#2b1208]">{text}</p>
      {votes > 0 && (
        <span className="mt-3 inline-flex w-fit items-center gap-2 rounded-full bg-[#fbe8d6] px-3.5 py-1.5 text-sm font-semibold text-[#2b1208]">
          <ThumbsUp size={16} /> Helpful ({votes})
        </span>
      )}
    </div>
  );
}

export default function ProductReviewsSection({
  reviews,
  reviewsLoading,
  ratingSummary,
  reviewAverage,
  reviewTotal,
  activeVariantSku,
  reviewFilterSku,
  activeProductName,
  onToggleVariantFilter,
}) {
  const [page, setPage] = useState(0);
  const [showAll, setShowAll] = useState(false);
  const [moreImages, setMoreImages] = useState(false);
  const [preview, setPreview] = useState("");

  const PER_VIEW = 2;
  const pages = Math.max(1, Math.ceil(reviews.length / PER_VIEW));
  const safePage = Math.min(page, pages - 1);
  const visible = showAll ? reviews : reviews.slice(safePage * PER_VIEW, safePage * PER_VIEW + PER_VIEW);

  const topId = useMemo(() => {
    if (reviews.length < 2) return null;
    const best = [...reviews].sort((a, b) => (b.helpfulVotes || 0) - (a.helpfulVotes || 0))[0];
    return best && (best.helpfulVotes || 0) > 0 ? best._id : null;
  }, [reviews]);

  const allImages = useMemo(() => reviews.flatMap((r) => (Array.isArray(r.images) ? r.images : [])).filter(Boolean), [reviews]);
  const shownImages = moreImages ? allImages : allImages.slice(0, 4);
  const hiddenCount = allImages.length - 4;
  const textReviews = reviews.filter((r) => r.comment || r.body).length;

  const openAll = () => {
    setShowAll(true);
    document.getElementById("customer-says")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const viewAllBtn = (
    <button type="button" onClick={showAll ? () => setShowAll(false) : openAll} className="inline-flex items-center gap-2 rounded-full border border-[#f4b98c] bg-white/70 px-4 py-2 text-sm font-bold text-[#f96e15] hover:bg-white">
      {showAll ? "Show Less" : `View All Reviews (${reviewTotal || reviews.length})`} <ChevronRight size={16} />
    </button>
  );

  return (
    <section id="customer-reviews" className="mx-auto max-w-[1360px] px-4 py-6 sm:px-6 lg:px-8">
      <div className="grid gap-5 lg:grid-cols-[0.95fr_1.05fr]">
        {/* Customer Reviews */}
        <div className={`${card} p-6`}>
          <div className="flex flex-wrap items-center gap-4">
            <span className="grid h-12 w-12 place-items-center rounded-xl bg-[#f96e15] text-white"><Star size={24} fill="currentColor" /></span>
            <div className="mr-auto">
              <h2 className="font-display text-2xl font-black text-[#5a1a0a]">Customer Reviews</h2>
              <p className="text-sm text-[#5b4a40]">Ratings and reviews from our customers</p>
            </div>
            {reviews.length > 0 && viewAllBtn}
          </div>

          {activeVariantSku && (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[#fff1e4] px-3 py-2">
              <p className="text-xs font-bold text-[#9b4518]">
                {reviewFilterSku ? `Showing reviews for ${activeProductName}` : "Showing all product reviews"}
              </p>
              <button type="button" onClick={onToggleVariantFilter} className="text-xs font-extrabold text-[#2563eb] hover:underline">
                {reviewFilterSku ? "Show all reviews" : `Show only ${activeProductName} reviews`}
              </button>
            </div>
          )}

          <div className="mt-4 flex flex-col gap-5 rounded-2xl bg-white/50 p-5 sm:flex-row sm:items-center">
            <div className="flex shrink-0 items-center gap-2 sm:pr-5">
              <Leaf size={34} className="-scale-x-100 text-[#f9a825]" />
              <div className="text-center">
                <p className="font-display text-5xl font-black text-[#2b1208]">
                  {reviewTotal > 0 ? reviewAverage.toFixed(1) : "—"} {reviewTotal > 0 && <Star size={26} className="inline -mt-2" fill="#f9a825" stroke="none" />}
                </p>
                <p className="mt-1 text-sm text-[#2b1208]">
                  {reviewTotal > 0 ? (
                    <>Based on {reviewTotal} {reviewTotal === 1 ? "rating" : "ratings"}{textReviews > 0 && <><br />and {textReviews} {textReviews === 1 ? "review" : "reviews"}</>}</>
                  ) : (
                    "No reviews yet"
                  )}
                </p>
              </div>
              <Leaf size={34} className="text-[#f9a825]" />
            </div>
            <div className="flex-1 space-y-2 sm:border-l sm:border-[#ecd5c2] sm:pl-5">
              {ratingSummary.distribution.map((d) => {
                const p = reviewTotal > 0 ? Math.round((d.count / reviewTotal) * 100) : 0;
                return (
                  <div key={d.star} className="flex items-center gap-2.5 text-sm font-semibold text-[#2b1208]">
                    <span className="w-3">{d.star}</span>
                    <Star size={16} fill="#f9a825" stroke="none" />
                    <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-[#ece4dc]">
                      <div className="h-full rounded-full bg-[#f9a01b]" style={{ width: `${p}%` }} />
                    </div>
                    <span className="w-10 text-right">{p}%</span>
                  </div>
                );
              })}
            </div>
          </div>

          {allImages.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-3">
              {shownImages.map((src, i) => (
                <button key={`${src}-${i}`} type="button" onClick={() => setPreview(src)} className="h-[72px] w-[100px] overflow-hidden rounded-xl border border-[#f1dfd2]">
                  <img src={src} alt={`Customer photo ${i + 1}`} className="h-full w-full object-cover" />
                </button>
              ))}
              {!moreImages && hiddenCount > 0 && (
                <button type="button" onClick={() => setMoreImages(true)} className="grid h-[72px] w-[100px] place-items-center rounded-xl bg-[#fde9d9] text-center text-lg font-extrabold leading-tight text-[#2b1208]">
                  +{hiddenCount}<br />More
                </button>
              )}
            </div>
          )}
        </div>

        {/* Customer Says */}
        <div id="customer-says" className={`${card} p-6`}>
          <div className="flex flex-wrap items-center gap-4">
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-[#f96e15] text-white"><MessageSquareQuote size={24} /></span>
            <div>
              <h2 className="font-display text-2xl font-black text-[#5a1a0a]">Customer Says</h2>
              <p className="text-sm text-[#5b4a40]">Real feedback from our happy customers</p>
            </div>
          </div>

          {reviewsLoading ? (
            <div className="flex items-center justify-center py-16 text-gray-400"><RefreshCw size={20} className="animate-spin" /></div>
          ) : reviews.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-sm font-semibold text-[#5b4a40]">
                {reviewFilterSku ? `No reviews for ${activeProductName} yet.` : "No reviews yet."}
              </p>
              <p className="mt-1 text-sm text-gray-400">Be the first to review this product after your purchase is delivered.</p>
            </div>
          ) : (
            <>
              <div className="relative mt-6">
                {!showAll && pages > 1 && (
                  <button type="button" aria-label="Previous reviews" onClick={() => setPage((safePage - 1 + pages) % pages)} className="absolute -left-3 top-1/2 z-10 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full bg-white text-[#5a1a0a] shadow-md">
                    <ChevronLeft size={20} />
                  </button>
                )}
                <div className={`grid gap-4 ${showAll ? "sm:grid-cols-2" : "sm:grid-cols-2"}`}>
                  {visible.map((rev, i) => (
                    <ReviewCard key={rev._id || i} rev={rev} isTop={rev._id === topId} />
                  ))}
                </div>
                {!showAll && pages > 1 && (
                  <button type="button" aria-label="Next reviews" onClick={() => setPage((safePage + 1) % pages)} className="absolute -right-3 top-1/2 z-10 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full bg-white text-[#5a1a0a] shadow-md">
                    <ChevronRight size={20} />
                  </button>
                )}
              </div>
              {!showAll && pages > 1 && (
                <div className="mt-4 flex justify-center gap-2">
                  {Array.from({ length: pages }).map((_, i) => (
                    <button key={i} type="button" aria-label={`Page ${i + 1}`} onClick={() => setPage(i)} className={`h-3 w-3 rounded-full ${i === safePage ? "bg-[#f96e15]" : "bg-[#f6d6bb]"}`} />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {preview && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/85 p-4" onClick={() => setPreview("")}>
          <button type="button" aria-label="Close" className="absolute right-5 top-5 grid h-11 w-11 place-items-center rounded-full bg-white text-[#2b1208]" onClick={() => setPreview("")}>
            <X size={22} />
          </button>
          <img src={preview} alt="Customer review" onClick={(e) => e.stopPropagation()} className="max-h-[88vh] max-w-[92vw] rounded-xl object-contain" />
        </div>
      )}
    </section>
  );
}
