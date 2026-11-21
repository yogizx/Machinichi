import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, ChevronLeft, ChevronRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import api from "../../services/api";
import ProductImage from "../product/ProductImage";

function CategoryShowcase() {
  const navigate = useNavigate();
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const scrollerRef = useRef(null);

  useEffect(() => {
    let mounted = true;
    api
      .get("/categories")
      .then(({ data }) => {
        if (mounted && data?.success && Array.isArray(data.data)) {
          setCategories(data.data.filter((item) => item.isActive !== false));
        }
      })
      .catch(() => {})
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const updateArrows = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }, []);

  // Re-check the arrows whenever the row is resized or its tiles change.
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return undefined;
    const observer = new ResizeObserver(updateArrows);
    observer.observe(el);
    return () => observer.disconnect();
  }, [categories.length, updateArrows]);

  const scrollRow = (direction) => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollBy({ left: direction * el.clientWidth * 0.8, behavior: "smooth" });
  };

  const openCategory = (categoryName) => {
    navigate(`/product?category=${encodeURIComponent(categoryName)}`);
  };

  const arrowClass =
    "absolute top-1/2 z-10 hidden h-10 w-10 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full border border-[#eadfd7] bg-white text-[#321304] shadow-[0_6px_16px_rgba(65,38,20,0.14)] transition hover:scale-110 active:scale-95 disabled:pointer-events-none disabled:opacity-40 sm:flex";

  return (
    <section className="rounded-[24px] border border-[#f0e2d4] bg-gradient-to-b from-[#fffaf5] to-[#fff3e8] p-4 shadow-[0_8px_18px_rgba(65,38,20,0.06)] sm:p-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <span aria-hidden="true" className="h-7 w-1.5 shrink-0 rounded-full bg-[#fd761a]" />
          <h2 className="font-display text-[26px] font-black leading-none tracking-[-0.01em] text-[#321304] sm:text-[30px]">
            Shop by Category
          </h2>
          <span className="rounded-full bg-[#ffe7d4] px-3.5 py-1.5 text-[12px] font-semibold text-[#ad4d00] sm:text-[13px]">
            Everyday essentials at the best prices
          </span>
        </div>
        <button
          className="flex shrink-0 cursor-pointer items-center gap-1.5 text-[14px] font-bold text-[#fd761a] transition hover:text-[#e86710] sm:text-[15px]"
          onClick={() => navigate("/categories")}
          type="button"
        >
          View All Categories
          <ArrowRight size={17} strokeWidth={2.4} />
        </button>
      </div>

      {/* Category row */}
      <div className="relative mt-5 sm:px-12">
        <button
          aria-label="Previous categories"
          className={`${arrowClass} left-0`}
          disabled={!canScrollLeft}
          onClick={() => scrollRow(-1)}
          type="button"
        >
          <ChevronLeft size={19} strokeWidth={2.5} />
        </button>

        <div
          ref={scrollerRef}
          onScroll={updateArrows}
          className="flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-smooth px-1 pb-1 pt-1 sm:gap-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {loading
            ? Array.from({ length: 8 }).map((_, i) => (
                <div
                  key={i}
                  className="h-[142px] w-[108px] shrink-0 animate-pulse rounded-[16px] bg-[#ffeadb] sm:h-[156px] sm:w-[124px] lg:w-[132px]"
                />
              ))
            : categories.map((item) => (
                <article
                  className="group w-[108px] shrink-0 cursor-pointer snap-start rounded-[16px] border-2 border-transparent bg-[#ffeadb] px-2.5 pb-3 pt-3 text-center transition duration-200 ease-out hover:-translate-y-1 hover:border-[#fd761a] hover:bg-white hover:shadow-[0_8px_18px_rgba(65,38,20,0.09)] focus-visible:border-[#fd761a] focus-visible:bg-white focus-visible:outline-none sm:w-[124px] lg:w-[132px]"
                  key={item._id}
                  onClick={() => openCategory(item.name)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      openCategory(item.name);
                    }
                  }}
                  role="link"
                  tabIndex={0}
                >
                  <div className="mx-auto h-[80px] w-[80px] overflow-hidden rounded-[14px] sm:h-[96px] sm:w-[96px]">
                    <ProductImage
                      src={item.image}
                      alt={item.name}
                      width={200}
                      className="h-full w-full transition duration-500 group-hover:scale-110"
                      priority
                    />
                  </div>
                  <p className="mt-2.5 flex min-h-[2.4em] items-center justify-center text-[13px] font-bold leading-tight text-[#321304] sm:text-[14px]">
                    <span className="line-clamp-2">{item.name}</span>
                  </p>
                </article>
              ))}
        </div>

        <button
          aria-label="Next categories"
          className={`${arrowClass} right-0`}
          disabled={!canScrollRight}
          onClick={() => scrollRow(1)}
          type="button"
        >
          <ChevronRight size={19} strokeWidth={2.5} />
        </button>
      </div>
    </section>
  );
}

export default CategoryShowcase;
