import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Flame,
  Heart,
  LayoutGrid,
  Minus,
  Plus,
  ShoppingBag,
  ShoppingCart,
  Star,
  Tag,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import api from "../../services/api";
import ProductImage from "../product/ProductImage";
import { slugifyProduct } from "../../data/products";
import { badgeColor, normalizeProduct } from "../../utils/normalizeProduct";
import wheatImage from "../../pages/images/trending-product-asset1.png";
import leafImage from "../../pages/images/trending-product-asset2.png";

const FALLBACK_IMG =
  "https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=420&q=90";

const serifFont = "'Playfair Display', 'Cormorant Garamond', Georgia, 'Times New Roman', serif";

const inr = (num) => {
  if (num == null || num <= 0) return null;
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(num);
};

// The list API may return category as a populated object, a plain name, or a bare id.
const getCategoryName = (category) => {
  if (!category) return "";
  if (typeof category === "string") return /^[a-f0-9]{24}$/i.test(category) ? "" : category;
  return typeof category.name === "string" ? category.name : "";
};

const mapProduct = (p) => {
  // Same normaliser as the /product page, so badge / short description / weight follow the same real-data rules.
  const n = normalizeProduct(p);
  const sizes = p.variants?.map((v) => v.size) || p.availableSizes || ["500g", "1kg"];
  const weight = sizes[0] || "500g";
  const priceNum = Number(p.sellingPrice || 0);
  const mrpNum = Number(p.mrpPrice || p.comparePrice || 0);
  const image = p.images?.[0]?.url || p.image || FALLBACK_IMG;
  const category = getCategoryName(p.category);
  return {
    _id: p._id,
    name: p.name,
    price: inr(priceNum) || "₹0",
    oldPrice: mrpNum > priceNum ? inr(mrpNum) : null,
    discount: mrpNum > priceNum && priceNum > 0 ? Math.round(((mrpNum - priceNum) / mrpNum) * 100) : 0,
    img: image,
    weight,
    // Shown on the card only when the admin / vendor really entered a size or pack weight.
    weightLabel: n.realSizes[0] || n.weightLabel || "",
    // Same badge as the /product page: the admin-selected badge (or visibility flag), never the discount %.
    badge: n.cardBadge,
    category,
    // Short line under the name: the product's own short description when it has one, else its category.
    subtitle: n.shortDescription || category,
    rating: typeof p.averageRating === "number" ? Math.round(p.averageRating * 10) / 10 : 0,
    reviewCount: Number(p.reviewCount ?? 0),
  };
};

// Picks a category chip icon from the category's own name; unknown categories get a neutral tag icon.
const CategoryIcon = ({ name, size = 18 }) => {
  if (name === "All") return <LayoutGrid size={size} strokeWidth={2.2} />;
  return <Tag size={size} strokeWidth={2} />;
};

const CARD_WIDTH =
  "w-[86%] sm:w-[calc((100%-24px)/2)] lg:w-[calc((100%-48px)/3)]";

function ProductCard({ product, favorite, onOpen, onAddToCart, onFavoriteToggle }) {
  const [quantity, setQuantity] = useState(1);

  const changeQuantity = (e, delta) => {
    e.stopPropagation();
    setQuantity((q) => Math.min(99, Math.max(1, q + delta)));
  };

  const handleAddToCart = (e) => {
    e.stopPropagation();
    onAddToCart(
      {
        name: product.name,
        price: product.price,
        image: product.img,
        selectedSize: product.weight,
        sizes: [product.weight],
        quantity,
      },
      quantity
    );
  };

  const handleFavorite = (e) => {
    e.stopPropagation();
    onFavoriteToggle(product.name);
  };

  return (
    <article
      className={`group relative flex shrink-0 cursor-pointer snap-start flex-col overflow-hidden rounded-[24px] border border-[#EADFD7]/60 bg-gradient-to-b from-white to-[#FFF8F1] p-3 pb-[40px] shadow-[0_8px_18px_rgba(65,38,20,0.09)] transition-all duration-200 ease-out hover:-translate-y-1.5 hover:shadow-[0_16px_34px_rgba(66,36,18,0.14)] ${CARD_WIDTH}`}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen();
        }
      }}
      role="link"
      tabIndex={0}
    >
      {/* Faint wheat watermark */}
      <img
        alt=""
        aria-hidden="true"
        className="pointer-events-none absolute bottom-[92px] right-1 w-[70px] -scale-x-100 select-none opacity-[0.12]"
        src={wheatImage}
      />

      {/* Photo with overlaid badge + wishlist */}
      <div className="relative overflow-hidden rounded-[20px]">
        <ProductImage
          src={product.img}
          alt={product.name}
          width={600}
          aspectRatio="16/9"
          className="w-full bg-[#f6eadc] group-hover:[&_img]:scale-105"
        />

        {product.badge ? (
          <span
            className={`absolute left-3 top-3 z-10 rounded-full px-3.5 py-2 text-[12px] font-black leading-none text-white shadow-[0_4px_10px_rgba(0,0,0,0.18)] ${badgeColor(product.badge)}`}
          >
            {product.badge}
          </span>
        ) : null}

        <button
          aria-label={favorite ? `Remove ${product.name} from favorites` : `Add ${product.name} to favorites`}
          aria-pressed={favorite}
          className="absolute right-3 top-3 grid h-11 w-11 cursor-pointer place-items-center rounded-full bg-white text-[#2a1007] shadow-[0_4px_12px_rgba(0,0,0,0.18)] transition-all duration-200 hover:scale-110 active:scale-95"
          onClick={handleFavorite}
          type="button"
        >
          <Heart
            aria-hidden="true"
            className={`transition ${favorite ? "fill-[#f57a14] text-[#f57a14]" : "fill-transparent"}`}
            size={24}
            strokeWidth={1.9}
          />
        </button>
      </div>

      <div className="relative z-10 flex flex-1 flex-col px-2.5">
        {/* Name + weight */}
        <div className="mt-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3
              className="line-clamp-1 text-[26px] font-bold leading-tight text-[#27201C]"
              style={{ fontFamily: serifFont }}
            >
              {product.name}
            </h3>
            {/* Always one line tall so every card's content lines up */}
            <p className="mt-0.5 line-clamp-1 min-h-[21px] text-[14px] font-medium text-[#796D66]">{product.subtitle}</p>
          </div>
          {product.weightLabel ? (
            <span className="mt-1 flex shrink-0 items-center gap-1.5 rounded-full bg-[#5A3322] px-3.5 py-2 text-[15px] font-bold leading-none text-white shadow-[0_6px_14px_rgba(90,51,34,0.3)]">
              <ShoppingBag size={16} strokeWidth={2} />
              {product.weightLabel}
            </span>
          ) : null}
        </div>

        {/* Rating: always one row so cards stay even (real review data only) */}
        <div className="mt-3 flex min-h-[38px] items-center">
          {product.rating ? (
            <div className="inline-flex items-center gap-1.5 rounded-full bg-[#F7F0E8] px-3 py-1.5 text-[15px] font-semibold text-[#27201C]">
              <Star size={17} strokeWidth={1.5} className="fill-[#f5a524] text-[#f5a524]" />
              {product.rating.toFixed(1)}
              <span className="font-medium text-[#4a3a32]">
                ({product.reviewCount.toLocaleString("en-IN")} {product.reviewCount === 1 ? "review" : "reviews"})
              </span>
            </div>
          ) : (
            <div className="inline-flex items-center rounded-full bg-[#F7F0E8] px-3 py-1.5 text-[15px] font-medium text-[#796D66]">
              No reviews yet
            </div>
          )}
        </div>

        {/* Price */}
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <span className="text-[34px] font-extrabold leading-none tracking-tight text-[#27201C]">
            {product.price}
          </span>
          {product.oldPrice ? (
            <span className="text-[18px] font-bold text-[#a09189] line-through decoration-[1.5px]">
              {product.oldPrice}
            </span>
          ) : null}
          {product.discount > 0 ? (
            <span className="rounded-full bg-[#FFE3DE] px-3.5 py-1.5 text-[15px] font-extrabold leading-none text-[#B62917]">
              {product.discount}% OFF
            </span>
          ) : null}
        </div>

        {/* Quantity + Add to cart (pinned to the bottom so every card lines up) */}
        <div className="mt-auto flex items-center gap-3 pt-4">
          <div
            className="flex h-[54px] shrink-0 items-center gap-1 rounded-[12px] bg-white px-2 shadow-[0_4px_14px_rgba(65,38,20,0.12)] ring-1 ring-[#EADFD7]"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              aria-label="Decrease quantity"
              className="grid h-9 w-9 cursor-pointer place-items-center rounded-full text-[#e5381a] transition hover:bg-[#fff0e6] active:scale-90 disabled:cursor-not-allowed disabled:opacity-35"
              disabled={quantity <= 1}
              onClick={(e) => changeQuantity(e, -1)}
              type="button"
            >
              <Minus size={20} strokeWidth={3} />
            </button>
            <span className="min-w-[26px] text-center text-[20px] font-extrabold tabular-nums text-[#2a1007]">
              {quantity}
            </span>
            <button
              aria-label="Increase quantity"
              className="grid h-9 w-9 cursor-pointer place-items-center rounded-full text-[#e5381a] transition hover:bg-[#fff0e6] active:scale-90"
              onClick={(e) => changeQuantity(e, 1)}
              type="button"
            >
              <Plus size={20} strokeWidth={3} />
            </button>
          </div>

          <button
            className="flex h-[54px] min-w-0 flex-1 cursor-pointer items-center justify-center gap-2.5 whitespace-nowrap rounded-[12px] bg-gradient-to-b from-[#FD761A] to-[#E86710] px-3 text-[17px] font-bold text-white shadow-[0_8px_22px_rgba(234,109,23,0.35)] transition-all duration-200 ease-out hover:scale-[1.02] hover:from-[#E86710] hover:to-[#D55B0E] active:scale-[0.97]"
            onClick={handleAddToCart}
            type="button"
          >
            <ShoppingCart size={22} strokeWidth={2.1} />
            Add to Cart
          </button>
        </div>
      </div>

      {/* Curved orange strip along the bottom edge */}
      <svg
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 h-[30px] w-full"
        preserveAspectRatio="none"
        viewBox="0 0 300 30"
      >
        <defs>
          <linearGradient id="cardStripGrad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#f57a14" />
            <stop offset="0.5" stopColor="#ff9a2e" />
            <stop offset="1" stopColor="#f57a14" />
          </linearGradient>
        </defs>
        <path d="M0 14 C 70 2, 230 2, 300 14 L300 30 L0 30 Z" fill="url(#cardStripGrad)" />
      </svg>
    </article>
  );
}

function TrendingProducts({ favoriteProducts = new Set(), onAddToCart = () => {}, onFavoriteToggle = () => {} }) {
  const navigate = useNavigate();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState("All");
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [pageCount, setPageCount] = useState(1);
  const [activePage, setActivePage] = useState(0);
  const scrollerRef = useRef(null);

  useEffect(() => {
    let mounted = true;
    const fetchTrending = async () => {
      try {
        const { data } = await api.get("/products", { params: { limit: "100" } });
        if (mounted && data?.success && Array.isArray(data.data)) {
          const visible = data.data.filter(
            (p) =>
              !p.isDeleted &&
              p.publishStatus === "published" &&
              p.isVisible !== false &&
              p.status !== "Draft" &&
              p.status !== "Discontinued"
          );

          // Products more customers are buying (highest totalCartCount) come first,
          // then customer favourites (highest averageRating, then reviewCount).
          visible.sort((a, b) => {
            const cartA = Number(a.totalCartCount || 0);
            const cartB = Number(b.totalCartCount || 0);
            if (cartB !== cartA) return cartB - cartA;
            const ratingA = Number(a.averageRating || 0);
            const ratingB = Number(b.averageRating || 0);
            if (ratingB !== ratingA) return ratingB - ratingA;
            return Number(b.reviewCount || 0) - Number(a.reviewCount || 0);
          });

          setProducts(visible.map(mapProduct));
        }
      } catch (err) {
        console.error("Error loading trending products:", err);
      } finally {
        if (mounted) setLoading(false);
      }
    };
    fetchTrending();
    return () => {
      mounted = false;
    };
  }, []);

  // Filter chips come only from categories the loaded products really have.
  const chips = useMemo(() => {
    const names = [];
    products.forEach((p) => {
      if (p.category && !names.includes(p.category)) names.push(p.category);
    });
    return names.slice(0, 5);
  }, [products]);

  const visibleProducts = useMemo(
    () => (activeCategory === "All" ? products : products.filter((p) => p.category === activeCategory)),
    [products, activeCategory]
  );

  const updateArrows = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
    const pages = Math.max(1, Math.ceil((el.scrollWidth - 8) / el.clientWidth));
    setPageCount(pages);
    setActivePage(Math.min(pages - 1, Math.round(el.scrollLeft / el.clientWidth)));
  }, []);

  // Re-check the arrows and dots whenever the row is resized or the cards change.
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return undefined;
    const observer = new ResizeObserver(updateArrows);
    observer.observe(el);
    updateArrows();
    return () => observer.disconnect();
  }, [visibleProducts.length, updateArrows]);

  const scrollRow = (direction) => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollBy({ left: direction * el.clientWidth * 0.9, behavior: "smooth" });
  };

  const scrollToPage = (page) => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTo({ left: page * el.clientWidth, behavior: "smooth" });
  };

  const selectCategory = (name) => {
    setActiveCategory(name);
    if (scrollerRef.current) scrollerRef.current.scrollTo({ left: 0 });
  };

  const openProductDetail = (product) => {
    navigate(`/product/${slugifyProduct(product.name)}`, { state: { product } });
  };

  const arrowClass =
    "absolute top-1/2 z-20 hidden h-[60px] w-[60px] -translate-y-1/2 cursor-pointer items-center justify-center rounded-full bg-white text-[#2a1007] shadow-[0_8px_22px_rgba(65,38,20,0.2)] transition hover:scale-110 active:scale-95 disabled:pointer-events-none disabled:opacity-40 sm:flex";

  return (
    <section className="relative overflow-hidden rounded-[32px] bg-gradient-to-br from-[#fff1e3] via-[#fff6ec] to-[#fdebd8] px-4 pb-8 pt-8 sm:px-8">
      <style>{`
        @keyframes trendingFlame {
          0%, 100% { transform: translateY(0) scale(1, 1) rotate(-3deg); filter: drop-shadow(0 0 2px rgba(255,140,40,0.55)); }
          20% { transform: translateY(-1px) scale(1.06, 1.18) rotate(3deg); }
          45% { transform: translateY(0) scale(0.96, 1.08) rotate(-2deg); filter: drop-shadow(0 0 7px rgba(255,120,20,0.85)); }
          70% { transform: translateY(-1px) scale(1.1, 1.22) rotate(2deg); }
        }
        .trending-flame { transform-origin: 50% 90%; animation: trendingFlame 1.1s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) { .trending-flame { animation: none; } }
      `}</style>
      {/* Decorative assets */}
      <img
        alt=""
        aria-hidden="true"
        className="pointer-events-none absolute -right-1 top-3 z-0 w-[96px] rotate-[8deg] select-none sm:w-[120px]"
        src={leafImage}
      />
      <img
        alt=""
        aria-hidden="true"
        className="pointer-events-none absolute right-1 top-[52%] z-0 hidden w-[60px] -rotate-[20deg] select-none sm:block"
        src={leafImage}
      />
      <img
        alt=""
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-4 -left-3 z-0 w-[110px] select-none sm:w-[150px]"
        src={wheatImage}
      />
      <svg
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 z-0 h-[70px] w-full"
        preserveAspectRatio="none"
        viewBox="0 0 1200 70"
      >
        <path d="M0 40 C 200 10, 380 60, 620 36 C 860 12, 1020 50, 1200 24 L1200 70 L0 70 Z" fill="#f9dcc0" opacity="0.55" />
      </svg>

      {/* Header */}
      <div className="relative z-10 flex flex-wrap items-end justify-between gap-x-6 gap-y-5">
        <div className="min-w-0">
          <span className="inline-flex items-center gap-2 rounded-full bg-[#fde6cd] px-4 py-1.5 text-[14px] font-bold text-[#2a1007]">
            <Flame aria-hidden="true" size={19} strokeWidth={2.2} fill="#ffb02e" className="trending-flame text-[#f06a0c]" />
            Trending Now
          </span>
          <div className="mt-2 flex items-start gap-3">
            <span aria-hidden="true" className="mt-1 h-[58px] w-[5px] shrink-0 rounded-full bg-[#f06a0c]" />
            <div className="min-w-0">
              <h2
                className="flex items-center gap-2 text-[34px] font-black leading-none tracking-[-0.01em] text-[#2a1007] sm:text-[44px]"
                style={{ fontFamily: serifFont }}
              >
                Trending Products
                <svg aria-hidden="true" className="h-[34px] w-[34px] text-[#f06a0c]" fill="none" viewBox="0 0 40 40">
                  <path
                    d="M6 34C8 17 20 5 36 4c-1 17-12 28-30 30z"
                    stroke="currentColor"
                    strokeLinejoin="round"
                    strokeWidth="2.6"
                  />
                  <path d="M8 33C16 24 24 16 33 8" stroke="currentColor" strokeLinecap="round" strokeWidth="2.2" />
                </svg>
              </h2>
              <p className="mt-2 text-[16px] font-semibold text-[#6a5b53] sm:text-[18px]">
                Best picks from Machinichi, loved by our customers.
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {["All", ...chips].map((name) => {
            const active = activeCategory === name;
            return (
              <button
                key={name}
                aria-pressed={active}
                className={`flex cursor-pointer items-center gap-2 rounded-full px-5 py-3 text-[15px] font-bold transition duration-200 ${
                  active
                    ? "bg-gradient-to-b from-[#ff6a1a] to-[#e8480c] text-white shadow-[0_8px_18px_rgba(232,72,12,0.4)]"
                    : "border border-[#f1dfcf] bg-white/70 text-[#2a1007] hover:border-[#f06a0c] hover:text-[#e8480c]"
                }`}
                onClick={() => selectCategory(name)}
                type="button"
              >
                <CategoryIcon name={name} />
                {name === "All" ? "All Products" : name}
              </button>
            );
          })}
          <span aria-hidden="true" className="mx-1 hidden h-9 w-px bg-[#e5d3c3] lg:block" />
          <button
            className="flex shrink-0 cursor-pointer items-center gap-1.5 text-[16px] font-bold text-[#f06a0c] transition hover:text-[#d85a05]"
            onClick={() => navigate("/product")}
            type="button"
          >
            View All
            <ArrowRight size={19} strokeWidth={2.6} />
          </button>
        </div>
      </div>

      {/* Product carousel */}
      <div className="relative z-10 mt-8 sm:px-8">
        <button
          aria-label="Previous products"
          className={`${arrowClass} -left-4`}
          disabled={!canScrollLeft}
          onClick={() => scrollRow(-1)}
          type="button"
        >
          <ChevronLeft size={26} strokeWidth={3} />
        </button>

        <div
          ref={scrollerRef}
          onScroll={updateArrows}
          className="flex snap-x snap-mandatory items-stretch gap-6 overflow-x-auto scroll-smooth px-1 pb-8 pt-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {loading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className={`h-[520px] shrink-0 animate-pulse rounded-[28px] bg-[#f3e7da] ${CARD_WIDTH}`} />
            ))
          ) : visibleProducts.length === 0 ? (
            <p className="w-full py-10 text-center text-[#796d66]">No products available.</p>
          ) : (
            visibleProducts.map((product) => (
              <ProductCard
                favorite={favoriteProducts.has(product.name)}
                key={product._id || product.name}
                onAddToCart={onAddToCart}
                onFavoriteToggle={onFavoriteToggle}
                onOpen={() => openProductDetail(product)}
                product={product}
              />
            ))
          )}
        </div>

        <button
          aria-label="Next products"
          className={`${arrowClass} -right-4`}
          disabled={!canScrollRight}
          onClick={() => scrollRow(1)}
          type="button"
        >
          <ChevronRight size={26} strokeWidth={3} />
        </button>
      </div>

      {/* Pagination dots (one per scroll page of real cards) */}
      {pageCount > 1 && (
        <div className="relative z-10 flex items-center justify-center gap-3">
          {Array.from({ length: pageCount }).map((_, i) => (
            <button
              aria-label={`Go to page ${i + 1}`}
              aria-current={i === activePage ? "true" : undefined}
              className={`h-[14px] w-[14px] cursor-pointer rounded-full transition-all duration-200 ${
                i === activePage ? "bg-[#f06a0c] shadow-[0_3px_8px_rgba(240,106,12,0.5)]" : "bg-[#f1d9c2] hover:bg-[#e9c29c]"
              }`}
              key={i}
              onClick={() => scrollToPage(i)}
              type="button"
            />
          ))}
        </div>
      )}
    </section>
  );
}

export default TrendingProducts;
