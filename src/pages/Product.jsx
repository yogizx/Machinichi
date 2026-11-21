import {
  Apple, ArrowRight, Bell, Bookmark, ChevronDown, Clock, Cookie, CupSoda, Droplets, Filter, Heart, House,
  LayoutGrid, Menu, Minus, Package, Plus, RefreshCw, Search, ShoppingBasket, ShoppingCart, Sprout, Star, Tag, X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import api from "../services/api";
import { badgeColor, normalizeProduct } from "../utils/normalizeProduct";
import { useToast } from "../components/Toaster";
import { useDebounce } from "../hooks/useDebounce";
import productAsset from "./images/product page asset.png";
import noProductAsset from "./images/no product.png";

const SEARCH_HISTORY_KEY = "machinichi_search_history";

const sortOptions = ["Popularity", "Price: Low to High", "Price: High to Low"];
const PRODUCTS_PER_PAGE = 12;
const ratingOptions = [5, 4, 3, 2, 1];
const priceBounds = { min: 200, max: 2000 };
const LOW_STOCK_LIMIT = 5;

function slugify(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

const isProductVisible = (p) => {
  if (p.isVisible === false) return false;
  if (p.publishStatus && p.publishStatus !== "published") return false;
  if (p.status === "Draft" || p.status === "Discontinued") return false;
  return true;
};

const parsePrice = (price) => Number(String(price).replace(/[^\d]/g, "")) || 0;

const getRangePercent = (value, limits) => {
  const span = limits.max - limits.min;
  return span > 0 ? Math.min(100, Math.max(0, ((value - limits.min) / span) * 100)) : 0;
};
const formatPriceRangeAmount = (value) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(value);
const parseWeight = (size) => {
  const value = Number(String(size).replace(/[^\d.]/g, "")) || 1;
  return String(size).toUpperCase().includes("G") && !String(size).toUpperCase().includes("KG")
    ? value / 1000
    : value;
};
const formatPriceForSize = (price, baseSize, selectedSize) => {
  if (!price) return price;

  const amount = Number(String(price).replace(/[^\d]/g, ""));
  if (!amount) return price;

  const prefix = String(price).match(/^\D*/)?.[0] || "";
  const baseWeight = parseWeight(baseSize);
  const selectedWeight = parseWeight(selectedSize);
  const adjustedAmount = Math.round((amount / baseWeight) * selectedWeight);

  return `${prefix}${adjustedAmount.toLocaleString("en-IN")}`;
};

function Product({ favoriteProducts, onAddToCart = () => {}, onFavoriteToggle, onSaveForLater = () => {} }) {
  const navigate = useNavigate();
  const gridColumns = useGridColumns();
  const [searchParams, setSearchParams] = useSearchParams();
  const categoryFromUrl = searchParams.get("category");
  const searchFromUrl = searchParams.get("search") || "";
  const selectedCategory = categoryFromUrl || null;
  const [selectedRating, setSelectedRating] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [apiProducts, setApiProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [priceRange, setPriceRange] = useState(priceBounds);
  // Lowest / highest real price among the listed products (the ends of the price slider).
  const [priceLimits, setPriceLimits] = useState(priceBounds);
  const [sortBy, setSortBy] = useState(sortOptions[0]);
  const [isSortOpen, setIsSortOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState(searchFromUrl);
  const debouncedSearch = useDebounce(searchQuery, 350);
  const [showSearchResults, setShowSearchResults] = useState(!!searchFromUrl);
  const [searchHistory, setSearchHistory] = useState(() => {
    try { return JSON.parse(localStorage.getItem(SEARCH_HISTORY_KEY) || "[]"); }
    catch { return []; }
  });
  const searchRef = useRef(null);
  const searchWrapperRef = useRef(null);

  const addToSearchHistory = (term) => {
    if (!term.trim()) return;
    setSearchHistory((prev) => {
      const next = [term, ...prev.filter((t) => t !== term)].slice(0, 10);
      localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(next));
      return next;
    });
  };

  const removeSearchHistoryItem = (term) => {
    setSearchHistory((prev) => {
      const next = prev.filter((t) => t !== term);
      localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(next));
      return next;
    });
  };

  useEffect(() => {
    const handleClick = (e) => {
      if (searchWrapperRef.current && !searchWrapperRef.current.contains(e.target)) {
        setShowSearchResults(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);
  const selectedFavorites = favoriteProducts ?? new Set();

  const activeProductCatalog = apiProducts;

  // Real categories from the backend (same source as the home page "Shop by Category").
  useEffect(() => {
    let mounted = true;
    api
      .get("/categories")
      .then(({ data }) => {
        if (mounted && data?.success && Array.isArray(data.data)) {
          setCategories(data.data.filter((item) => item.isActive !== false));
        }
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const params = new URLSearchParams({ limit: "100", sort: "createdAt", order: "desc" });
        if (searchFromUrl) params.set("search", searchFromUrl);
        const { data } = await api.get(`/products?${params.toString()}`);
        if (data.success && Array.isArray(data.data)) {
          setApiProducts(data.data.filter(isProductVisible).map(normalizeProduct));
        }
      } catch { /* no products to show */ }
      setIsLoading(false);
    })();
  }, [searchFromUrl]);

  useEffect(() => {
    if (apiProducts.length > 0) {
      const sourceProducts = selectedCategory
        ? apiProducts.filter((p) => p.category === selectedCategory)
        : apiProducts;
      if (sourceProducts.length > 0) {
        const prices = sourceProducts.map((p) => parsePrice(p.price)).filter((n) => n > 0);
        if (prices.length > 0) {
          const limits = { min: Math.min(...prices), max: Math.max(...prices) };
          setPriceLimits(limits);
          setPriceRange(limits);
          return;
        }
      }
    }
    setPriceLimits(priceBounds);
    setPriceRange(priceBounds);
  }, [selectedCategory, apiProducts]);

  useEffect(() => {
    if (searchFromUrl) {
      const t = setTimeout(() => {
        setSearchQuery(searchFromUrl);
        setShowSearchResults(false);
      }, 0);
      return () => clearTimeout(t);
    }
  }, [searchFromUrl]);

  useEffect(() => {
    const q = debouncedSearch.trim();
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (q) { next.set("search", q); } else { next.delete("search"); }
      return next;
    }, { replace: true });
  }, [debouncedSearch]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCurrentPage(1);
  }, [selectedCategory, sortBy, selectedRating, priceRange, searchQuery]);

  const ratedProducts = activeProductCatalog;

  const filteredProducts = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    const items = ratedProducts.filter((product) => {
      const price = parsePrice(product.price);
      const matchesCategory = selectedCategory ? product.category === selectedCategory : true;
      const matchesPrice = price >= priceRange.min && price <= priceRange.max;
      const matchesRating = selectedRating ? product.rating === selectedRating : true;
      const matchesSearch = !q || product.name.toLowerCase().includes(q) || product.origin.toLowerCase().includes(q) || product.category.toLowerCase().includes(q);
      return matchesCategory && matchesPrice && matchesRating && matchesSearch;
    });

    if (sortBy === "Price: Low to High") {
      items.sort((a, b) => parsePrice(a.price) - parsePrice(b.price));
    }

    if (sortBy === "Price: High to Low") {
      items.sort((a, b) => parsePrice(b.price) - parsePrice(a.price));
    }

    return items;
  }, [priceRange, ratedProducts, selectedCategory, selectedRating, sortBy, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filteredProducts.length / PRODUCTS_PER_PAGE));
  // Show the "Good Food Good Life" asset only when the last row of the grid has free space.
  const pageProductCount = Math.min(PRODUCTS_PER_PAGE, Math.max(0, filteredProducts.length - (currentPage - 1) * PRODUCTS_PER_PAGE));
  const emptyGridSlots =
    pageProductCount > 0 && gridColumns > 1 ? (gridColumns - (pageProductCount % gridColumns)) % gridColumns : 0;
  const paginatedProducts = useMemo(
    () => filteredProducts.slice((currentPage - 1) * PRODUCTS_PER_PAGE, currentPage * PRODUCTS_PER_PAGE),
    [filteredProducts, currentPage],
  );

  const selectSort = (option) => {
    setSortBy(option);
    setIsSortOpen(false);
  };

  const selectCategory = (category) => {
    const nextCategory = selectedCategory === category ? null : category;
    if (nextCategory) {
      setSearchParams({ category: nextCategory });
    } else {
      setSearchParams({});
    }
  };

  const toggleFavorite = (productName) => {
    onFavoriteToggle?.(productName);
  };

  const clearFilters = useCallback(() => {
    setSelectedRating(null);
    setPriceRange(priceLimits);
    setSortBy(sortOptions[0]);
    setSearchQuery("");
    setCurrentPage(1);
    setSearchParams({});
  }, [setSearchParams, priceLimits]);

  return (
    <div className="min-h-screen bg-[#fff8f1] text-[#342821]">
      <div className="mx-auto w-full max-w-[1420px] px-8 pt-8 max-xl:max-w-[1180px] max-lg:max-w-[820px] max-lg:px-5 max-sm:px-4 max-sm:pt-6">
        <CategoryBar categories={categories} selectedCategory={selectedCategory} onSelect={selectCategory} />
      </div>

      <main className="mx-auto flex w-full max-w-[1420px] gap-[40px] px-8 pb-14 pt-10 max-xl:max-w-[1180px] max-xl:gap-8 max-lg:max-w-[820px] max-lg:flex-col max-lg:px-5 max-sm:px-4 max-sm:pt-7">
        <aside className="w-[270px] shrink-0 max-xl:w-[250px] max-lg:w-full">
          <FilterPanel
            onPriceRangeChange={setPriceRange}
            priceLimits={priceLimits}
            onRatingSelect={setSelectedRating}
            priceRange={priceRange}
            selectedRating={selectedRating}
            onClearFilters={clearFilters}
          />
        </aside>

        <section className="min-w-0 flex-1">
          <div ref={searchWrapperRef} className="relative mb-6">
            <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[#9c8f87]" />
            <input
              ref={searchRef}
              type="text"
              value={searchQuery}
              onChange={(e) => {
                const val = e.target.value;
                setSearchQuery(val);
                setShowSearchResults(true);
                setCurrentPage(1);
              }}
              onFocus={() => {
                if (searchQuery.trim().length >= 2) { setShowSearchResults(true); }
                else if (!searchQuery.trim() && searchHistory.length > 0) { setShowSearchResults(true); }
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && searchQuery.trim()) {
                  e.preventDefault();
                  addToSearchHistory(searchQuery.trim());
                  setShowSearchResults(false);
                }
              }}
              placeholder="Search products, categories, brands..."
              className="h-[52px] w-full rounded-[12px] border border-[#eadfd7] bg-[#fffaf6] pl-12 pr-10 text-[14px] font-medium text-[#3c302b] outline-none placeholder:text-[#9c8f87] focus:border-[#fd761a] focus:shadow-[0_0_0_3px_rgba(253,118,26,0.1)]"
              aria-label="Search products"
            />
            {searchQuery ? (
              <button onClick={() => {
                setSearchQuery("");
                setShowSearchResults(false);
                setCurrentPage(1);
                searchRef.current?.focus();
              }} className="absolute right-4 top-1/2 -translate-y-1/2 text-[#9c8f87] hover:text-[#3c302b]" type="button">
                <X size={18} />
              </button>
            ) : null}
            {showSearchResults && searchQuery.trim().length >= 2 && (
              <div className="absolute left-0 right-0 top-full z-30 mt-2 max-h-[360px] overflow-y-auto rounded-[12px] border border-[#eadfd7] bg-white shadow-[0_12px_32px_rgba(65,38,20,0.12)]">
                {filteredProducts.length > 0 ? (
                  filteredProducts.slice(0, 10).map((product) => (
                    <button
                      key={product.name}
                      className="flex w-full items-center gap-4 px-4 py-3 text-left transition hover:bg-[#fff8f1]"
                      onMouseDown={() => { setSearchQuery(product.name); setShowSearchResults(false); setCurrentPage(1); }}
                      type="button"
                    >
                      <img src={product.image} alt="" className="h-[48px] w-[48px] shrink-0 rounded-[8px] object-cover bg-[#eadfd7]" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-bold text-[#3c302b]">{product.name}</p>
                        <p className="mt-0.5 truncate text-[11px] font-medium text-[#9c8f87]">
                          {[product.brand, product.category].filter(Boolean).join(" · ") || ""}
                        </p>
                        <div className="mt-0.5 flex items-center gap-2">
                          <span className="text-[13px] font-black text-[#3c302b]">{product.price}</span>
                          {product.oldPrice && <span className="text-[10px] font-medium text-[#9c8f87] line-through">{product.oldPrice}</span>}
                          {product.stock && (
                            <span className={`ml-auto text-[9px] font-bold ${product.stock === "In Stock" ? "text-[#23723a]" : "text-[#dc2626]"}`}>
                              {product.stock}
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                  ))
                ) : (
                  <p className="px-4 py-6 text-center text-[13px] font-medium text-[#9c8f87]">No products found</p>
                )}
              </div>
            )}
            {showSearchResults && !searchQuery.trim() && searchHistory.length > 0 && (
              <div className="absolute left-0 right-0 top-full z-30 mt-2 rounded-[12px] border border-[#eadfd7] bg-white shadow-[0_12px_32px_rgba(65,38,20,0.12)] overflow-hidden">
                <p className="px-4 pt-3 pb-1.5 text-[11px] font-black uppercase tracking-wider text-[#a69c95]">Recent searches</p>
                {searchHistory.map((term) => (
                  <div key={term} className="flex items-center justify-between px-4 py-2 hover:bg-[#fff8f1] group">
                    <button
                      type="button"
                      className="flex items-center gap-2.5 text-[13px] font-semibold text-[#3c302b] flex-1 text-left"
                      onClick={() => {
                        addToSearchHistory(term);
                        setSearchQuery(term);
                        setShowSearchResults(false);
                        setCurrentPage(1);
                      }}
                    >
                      <Clock size={14} className="text-[#a69c95]" />
                      {term}
                    </button>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); removeSearchHistoryItem(term); }}
                      className="opacity-0 group-hover:opacity-100 text-[#a69c95] hover:text-[#3c302b] transition"
                      aria-label={`Remove ${term}`}
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="mb-8 flex items-start justify-between gap-6 max-sm:flex-col">
            <div>
              {/* font-display = Playfair Display (the old font-serif class maps to Roboto in this project) */}
              <h1 className="font-display text-[46px] font-black leading-none tracking-[-0.03em] text-[#4b1d10] max-xl:text-[40px] max-sm:text-[34px]">
                {selectedCategory ? `${selectedCategory} Collection` : "Organic Pantry Staples"}
              </h1>
              <p className="mt-2 text-[14px] font-semibold leading-none text-[#796d66] max-sm:text-[12px]">
                {selectedCategory ? `Showing premium ${selectedCategory.toLowerCase()} items` : "Showing all premium category items"}
              </p>
            </div>

            <div className="relative w-[315px] max-sm:w-full">
              <button
                aria-expanded={isSortOpen}
                aria-haspopup="listbox"
                className="flex h-[48px] w-full items-center justify-between rounded-[12px] border border-[#eadfd7] bg-[#fffaf6] px-6 text-[13px] font-bold text-[#6c5f58] shadow-[0_1px_4px_rgba(64,35,20,0.04)]"
                onClick={() => setIsSortOpen((open) => !open)}
                type="button"
              >
                <span>SORT BY:</span>
                <span className="font-semibold">{sortBy}</span>
                <ChevronDown size={16} />
              </button>

              {isSortOpen ? (
                <div
                  className="absolute left-0 right-0 top-[54px] z-20 overflow-hidden rounded-[12px] border border-[#eadfd7] bg-[#fffaf6] text-[13px] font-bold text-[#6c5f58] shadow-[0_10px_22px_rgba(64,35,20,0.08)]"
                  role="listbox"
                >
                  {sortOptions.map((option) => (
                    <button
                      aria-selected={sortBy === option}
                      className={`flex h-[44px] w-full items-center justify-between px-6 text-left ${
                        sortBy === option ? "text-[#fd761a]" : "text-[#6c5f58]"
                      }`}
                      key={option}
                      onClick={() => selectSort(option)}
                      role="option"
                      type="button"
                    >
                      <span>{option}</span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </div>

          {isLoading && apiProducts.length === 0 ? (
            <div className="grid grid-cols-1 gap-x-[28px] gap-y-[34px] md:grid-cols-2 xl:grid-cols-3 max-xl:gap-x-5">
              {Array.from({ length: 6 }).map((_, i) => (
                <ProductCardSkeleton key={i} />
              ))}
            </div>
          ) : filteredProducts.length > 0 ? (
            <div className="grid grid-cols-1 gap-x-[28px] gap-y-[34px] md:grid-cols-2 xl:grid-cols-3 max-xl:gap-x-5">
              {paginatedProducts.map((product, index) => (
                <ProductCard
                  key={product.name}
                  product={product}
                  index={index}
                  isFavorite={selectedFavorites.has(product.name)}
                  onAddToCart={onAddToCart}
                  onFavoriteToggle={toggleFavorite}
                  onSaveForLater={onSaveForLater}
                />
              ))}
              {emptyGridSlots > 0 ? (
                <div
                  aria-hidden="true"
                  className="flex items-center justify-center"
                  style={{ gridColumn: `span ${emptyGridSlots} / span ${emptyGridSlots}` }}
                >
                  <img
                    alt=""
                    className="h-auto w-full select-none object-contain mix-blend-multiply"
                    draggable={false}
                    src={productAsset}
                  />
                </div>
              ) : null}
            </div>
          ) : (
            <NoProducts
              hasCategory={Boolean(selectedCategory)}
              onBrowseAll={() => navigate("/categories")}
              onReset={clearFilters}
            />
          )}

          {filteredProducts.length > 0 ? (
            <Pagination currentPage={currentPage} totalPages={totalPages} totalItems={filteredProducts.length} onPageChange={setCurrentPage} />
          ) : null}
        </section>
      </main>
    </div>
  );
}

function FilterPanel({
  onPriceRangeChange,
  priceLimits,
  onRatingSelect,
  priceRange,
  selectedRating,
  onClearFilters,
}) {
  const priceTrackRef = useRef(null);
  const [activePriceHandle, setActivePriceHandle] = useState(null);
  const minPercent = getRangePercent(priceRange.min, priceLimits);
  const maxPercent = getRangePercent(priceRange.max, priceLimits);

  const updatePriceFromPointer = (event, handle) => {
    const track = priceTrackRef.current;
    if (!track) return;

    const rect = track.getBoundingClientRect();
    const trackWidth = rect.width;
    const offset = Math.min(Math.max(event.clientX - rect.left, 0), trackWidth);
    const rawValue = priceLimits.min + (offset / trackWidth) * (priceLimits.max - priceLimits.min);
    const nextValue = Math.round(rawValue);

    onPriceRangeChange((current) => {
      if (handle === "min") {
        return { ...current, min: Math.min(nextValue, current.max) };
      }

      return { ...current, max: Math.max(nextValue, current.min) };
    });
  };

  const startPriceDrag = (event) => {
    const track = priceTrackRef.current;
    if (!track) return;

    const rect = track.getBoundingClientRect();
    const trackWidth = rect.width;
    const offset = Math.min(Math.max(event.clientX - rect.left, 0), trackWidth);
    const pointerValue = priceLimits.min + (offset / trackWidth) * (priceLimits.max - priceLimits.min);
    const handle =
      Math.abs(pointerValue - priceRange.min) <= Math.abs(pointerValue - priceRange.max) ? "min" : "max";

    setActivePriceHandle(handle);
    updatePriceFromPointer(event, handle);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const headingClass = "mb-4 font-display text-[26px] font-black leading-none text-[#4b1d10] max-sm:text-[22px]";

  return (
    <div className="rounded-[20px] border border-[#f0e2d6] bg-[#fffaf6] px-5 py-6 text-[16px] font-semibold text-[#5f554f] shadow-[0_8px_24px_rgba(65,38,20,0.05)] max-lg:grid max-lg:grid-cols-2 max-lg:gap-x-8 max-md:block max-sm:text-[14px]">
      <section className="border-b border-[#eadfd7] pb-7">
        <h2 className={headingClass}>Price Range</h2>
        <div
          className="relative h-[28px] w-full cursor-pointer touch-none px-[8px]"
          onPointerDown={startPriceDrag}
          onPointerMove={(event) => {
            if (activePriceHandle) {
              updatePriceFromPointer(event, activePriceHandle);
            }
          }}
          onPointerUp={() => setActivePriceHandle(null)}
        >
          <div className="relative h-full w-full" ref={priceTrackRef}>
            <div className="absolute inset-x-0 top-[12px] h-[3px] rounded-full bg-[#e6d2c2]" />
            <div
              className="absolute top-[12px] h-[3px] rounded-full bg-gradient-to-r from-[#f97316] to-[#c2570c]"
              style={{ left: `${minPercent}%`, width: `${Math.max(0, maxPercent - minPercent)}%` }}
            />
            <span
              className="pointer-events-none absolute top-[5px] h-[16px] w-[16px] -translate-x-1/2 rounded-full border-[3px] border-[#f97316] bg-white shadow-[0_2px_6px_rgba(249,115,22,0.35)]"
              style={{ left: `${minPercent}%` }}
            />
            <span
              className="pointer-events-none absolute top-[5px] h-[16px] w-[16px] -translate-x-1/2 rounded-full border-[3px] border-[#f97316] bg-white shadow-[0_2px_6px_rgba(249,115,22,0.35)]"
              style={{ left: `${maxPercent}%` }}
            />
          </div>
        </div>
        <div className="mt-1 flex w-full items-center justify-between text-[15px] font-bold text-[#84776f]">
          <span>{formatPriceRangeAmount(priceLimits.min)}</span>
          <span>{formatPriceRangeAmount(priceLimits.max)}</span>
        </div>

        {/* Selected range pill */}
        <div
          aria-live="polite"
          className="mt-5 flex w-full items-center gap-3 rounded-[14px] border border-[#f8cfa9] bg-[#fff0e2] px-4 py-3.5"
        >
          <Tag aria-hidden="true" className="shrink-0 text-[#e8650d]" size={22} strokeWidth={2} />
          <div className="min-w-0">
            <p className="text-[12px] font-bold leading-none text-[#84776f]">Selected Range</p>
            <p className="mt-1.5 whitespace-nowrap text-[17px] font-black leading-none text-[#f06a12]">
              {formatPriceRangeAmount(priceRange.min)} {"\u2013"} {formatPriceRangeAmount(priceRange.max)}
            </p>
          </div>
        </div>
      </section>

      <section className="border-b border-[#eadfd7] py-7">
        <h2 className={headingClass}>Customer Rating</h2>
        <div className="space-y-4">
          {ratingOptions.map((rating) => (
            <label className="flex cursor-pointer items-center gap-3 leading-none" key={rating}>
              <input
                checked={selectedRating === rating}
                className="sr-only"
                onChange={() => onRatingSelect(selectedRating === rating ? null : rating)}
                type="checkbox"
              />
              <span
                className={`grid h-[20px] w-[20px] place-items-center rounded-[5px] border-2 ${
                  selectedRating === rating
                    ? "border-[#fd761a] bg-[#fd761a]"
                    : "border-[#d8c9be] bg-white"
                }`}
              >
                {selectedRating === rating ? (
                  <span className="text-[11px] font-black leading-none text-white">{"\u2713"}</span>
                ) : null}
              </span>
              <span className="flex items-center gap-2">
                <StarRating rating={rating} size={16} />
                <span>{rating} Star</span>
              </span>
            </label>
          ))}
        </div>
      </section>

      <button
        className="mt-7 flex h-[50px] w-full items-center justify-center gap-2 rounded-[12px] border-2 border-[#fd761a] bg-white text-[13px] font-black text-[#fd761a] transition hover:bg-[#fd761a] hover:text-white"
        onClick={onClearFilters}
        type="button"
      >
        <X size={16} strokeWidth={2.5} />
        CLEAR ALL FILTERS
      </button>
    </div>
  );
}

function Pagination({ currentPage, totalPages, totalItems, onPageChange }) {
  const startItem = (currentPage - 1) * PRODUCTS_PER_PAGE + 1;
  const endItem = Math.min(currentPage * PRODUCTS_PER_PAGE, totalItems);
  const pages = [];

  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || (i >= currentPage - 1 && i <= currentPage + 1)) {
      pages.push(i);
    } else if (pages[pages.length - 1] !== "...") {
      pages.push("...");
    }
  }

  return (
    <div className="mt-[58px] flex flex-col items-center gap-4">
      <div className="flex items-center gap-2">
        <button
          className={`flex h-[42px] w-[42px] items-center justify-center rounded-[8px] border text-[13px] font-bold transition ${
            currentPage === 1
              ? "cursor-not-allowed border-[#eadfd7] text-[#b5a69c]"
              : "border-[#eadfd7] bg-white text-[#6c5f58] hover:border-[#fd761a] hover:text-[#fd761a]"
          }`}
          disabled={currentPage === 1}
          onClick={() => onPageChange(currentPage - 1)}
          type="button"
        >
          <ChevronDown size={16} className="rotate-90" />
        </button>

        {pages.map((page, i) =>
          page === "..." ? (
            <span key={`ellipsis-${i}`} className="px-2 text-[13px] font-bold text-[#b5a69c]">
              ...
            </span>
          ) : (
            <button
              key={page}
              className={`flex h-[42px] min-w-[42px] items-center justify-center rounded-[8px] border px-3 text-[13px] font-bold transition ${
                page === currentPage
                  ? "border-[#fd761a] bg-[#fd761a] text-white shadow-[0_4px_9px_rgba(253,118,26,0.2)]"
                  : "border-[#eadfd7] bg-white text-[#6c5f58] hover:border-[#fd761a] hover:text-[#fd761a]"
              }`}
              onClick={() => onPageChange(page)}
              type="button"
            >
              {page}
            </button>
          ),
        )}

        <button
          className={`flex h-[42px] w-[42px] items-center justify-center rounded-[8px] border text-[13px] font-bold transition ${
            currentPage === totalPages
              ? "cursor-not-allowed border-[#eadfd7] text-[#b5a69c]"
              : "border-[#eadfd7] bg-white text-[#6c5f58] hover:border-[#fd761a] hover:text-[#fd761a]"
          }`}
          disabled={currentPage === totalPages}
          onClick={() => onPageChange(currentPage + 1)}
          type="button"
        >
          <ChevronDown size={16} className="-rotate-90" />
        </button>
      </div>

      <p className="text-[12px] font-medium text-[#7f736c]">
        Showing {startItem}–{endItem} of {totalItems} Products
      </p>
    </div>
  );
}

function ProductCardSkeleton() {
  return (
    <div className="animate-pulse overflow-hidden rounded-[18px] bg-white shadow-[0_8px_18px_rgba(65,38,20,0.09)]">
      <div className="aspect-[7/6] bg-[#e8ddd4]" />
      <div className="space-y-3 px-5 pb-5 pt-5">
        <div className="h-[18px] w-3/4 rounded-md bg-[#e8ddd4]" />
        <div className="h-[12px] w-1/3 rounded-md bg-[#e8ddd4]" />
        <div className="h-[14px] w-full rounded-md bg-[#e8ddd4]" />
        <div className="flex gap-2">
          <div className="h-[35px] w-[60px] rounded-[7px] bg-[#e8ddd4] max-xl:h-[31px]" />
          <div className="h-[35px] w-[60px] rounded-[7px] bg-[#e8ddd4] max-xl:h-[31px]" />
          <div className="h-[35px] w-[60px] rounded-[7px] bg-[#e8ddd4] max-xl:h-[31px]" />
        </div>
        <div className="h-[52px] w-full rounded-[10px] bg-[#e8ddd4] max-xl:h-[46px]" />
        <div className="h-[46px] w-full rounded-[10px] bg-[#e8ddd4] max-xl:h-[42px]" />
      </div>
    </div>
  );
}

const getGridColumns = () => {
  if (typeof window === "undefined") return 3;
  if (window.innerWidth >= 1280) return 3;
  if (window.innerWidth >= 768) return 2;
  return 1;
};

// Number of product columns the grid currently shows (matches the md:2 / xl:3 breakpoints).
function useGridColumns() {
  const [columns, setColumns] = useState(getGridColumns);
  useEffect(() => {
    const onResize = () => setColumns(getGridColumns());
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return columns;
}

const categoryIconFor = (name = "") => {
  const n = name.toLowerCase();
  if (/dry|fruit|nut/.test(n)) return Apple;
  if (/spice|masala|herb/.test(n)) return Sprout;
  if (/snack|biscuit|cookie|sweet|namkeen/.test(n)) return Cookie;
  if (/beverage|drink|tea|coffee|juice/.test(n)) return CupSoda;
  if (/care|beauty|soap|skin|hair/.test(n)) return Droplets;
  if (/house|home|clean/.test(n)) return House;
  if (/grocer|staple|rice|flour|grain|pulse|oil|dal/.test(n)) return ShoppingBasket;
  return Package;
};

function CategoryBar({ categories, selectedCategory, onSelect }) {
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef(null);

  useEffect(() => {
    const close = (event) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) setIsOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  return (
    <nav
      aria-label="Product categories"
      className="flex items-center gap-4 rounded-[22px] border border-[#f6e3d2] bg-[#fff1e3]/70 px-3 py-2.5 shadow-[0_6px_18px_rgba(65,38,20,0.05)] max-sm:gap-3 max-sm:px-2"
    >
      <div className="relative shrink-0" ref={wrapperRef}>
        <button
          aria-expanded={isOpen}
          aria-haspopup="listbox"
          className="flex h-[52px] items-center gap-3 rounded-[14px] bg-gradient-to-b from-[#fb8a2e] to-[#f26a0d] px-5 text-[15px] font-black text-white shadow-[0_6px_12px_rgba(242,106,13,0.25)] transition hover:brightness-95 max-sm:h-[46px] max-sm:px-3.5 max-sm:text-[13px]"
          onClick={() => setIsOpen((open) => !open)}
          type="button"
        >
          <Menu size={22} strokeWidth={2.4} />
          <span className="whitespace-nowrap">All Categories</span>
          <ChevronDown className={`transition-transform ${isOpen ? "rotate-180" : ""}`} size={18} strokeWidth={2.6} />
        </button>

        {isOpen ? (
          <div
            className="absolute left-0 top-[calc(100%+8px)] z-30 max-h-[320px] min-w-[240px] overflow-y-auto rounded-[14px] border border-[#eadfd7] bg-white p-1.5 shadow-[0_12px_32px_rgba(65,38,20,0.14)]"
            role="listbox"
          >
            <button
              aria-selected={!selectedCategory}
              className={`flex w-full items-center gap-3 rounded-[10px] px-3 py-2.5 text-left text-[14px] font-bold transition hover:bg-[#fff1e6] ${
                !selectedCategory ? "bg-[#ffe8d6] text-[#f06a12]" : "text-[#4a3e38]"
              }`}
              onClick={() => { onSelect(null); setIsOpen(false); }}
              role="option"
              type="button"
            >
              <LayoutGrid size={18} />
              All Categories
            </button>
            {categories.map((category) => {
              const Icon = categoryIconFor(category.name);
              const active = selectedCategory === category.name;
              return (
                <button
                  aria-selected={active}
                  className={`flex w-full items-center gap-3 rounded-[10px] px-3 py-2.5 text-left text-[14px] font-bold transition hover:bg-[#fff1e6] ${
                    active ? "bg-[#ffe8d6] text-[#f06a12]" : "text-[#4a3e38]"
                  }`}
                  key={category._id || category.name}
                  onClick={() => { onSelect(category.name); setIsOpen(false); }}
                  role="option"
                  type="button"
                >
                  <Icon size={18} />
                  {category.name}
                </button>
              );
            })}
          </div>
        ) : null}
      </div>

      <div className="flex min-w-0 flex-1 items-center gap-3 overflow-x-auto py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {categories.map((category) => {
          const Icon = categoryIconFor(category.name);
          const active = selectedCategory === category.name;
          return (
            <button
              aria-pressed={active}
              className={`flex shrink-0 items-center gap-3 rounded-full py-1.5 pl-1.5 pr-5 text-[15px] font-bold transition ${
                active
                  ? "bg-white text-[#f06a12] shadow-[0_4px_12px_rgba(242,106,13,0.18)] ring-1 ring-[#fd761a]"
                  : "text-[#4b2a1c] hover:bg-white/70"
              }`}
              key={category._id || category.name}
              onClick={() => onSelect(category.name)}
              type="button"
            >
              <span className="grid h-[44px] w-[44px] place-items-center rounded-full bg-[#ffe9d8] text-[#f26a0d] shadow-[0_3px_8px_rgba(242,106,13,0.15)]">
                <Icon size={22} strokeWidth={1.9} />
              </span>
              <span className="whitespace-nowrap">{category.name}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

function NoProducts({ hasCategory, onBrowseAll, onReset }) {
  const hints = [
    { icon: Filter, label: "Adjust your filters" },
    { icon: LayoutGrid, label: "Browse other categories" },
    { icon: Bell, label: "Check back soon" },
  ];

  return (
    <div className="flex flex-col items-center rounded-[24px] bg-gradient-to-b from-[#fff3e6] to-[#fff8f1] px-4 pb-10 pt-6 text-center">
      <img
        alt=""
        className="h-auto w-full max-w-[460px] select-none object-contain mix-blend-multiply"
        draggable={false}
        src={noProductAsset}
      />
      <h2 className="mt-2 font-display text-[48px] font-black leading-none tracking-[-0.02em] text-[#4b1d10] max-sm:text-[34px]">
        No Products <span className="text-[#fd761a]">Found</span>
      </h2>
      <p className="mt-5 max-w-[560px] text-[17px] font-medium leading-relaxed text-[#5f554f] max-sm:text-[14px]">
        {hasCategory
          ? "We couldn’t find any products for this category right now."
          : "We couldn’t find any products right now."}
        <br />
        Try adjusting your filters, browse other categories, or check back soon.
      </p>

      <div className="mt-7 flex flex-wrap items-center justify-center gap-y-3 rounded-[18px] bg-[#fff0e2] px-2 py-2 max-sm:flex-col">
        {hints.map(({ icon: Icon, label }, index) => (
          <div className="flex items-center" key={label}>
            {index > 0 ? <span aria-hidden="true" className="mx-3 h-8 w-px bg-[#f0d9c4] max-sm:hidden" /> : null}
            <span className="flex items-center gap-2.5 px-4 text-[14px] font-bold text-[#4b2a1c]">
              <Icon className="text-[#f26a0d]" size={20} strokeWidth={2} />
              {label}
            </span>
          </div>
        ))}
      </div>

      <div className="mt-7 flex flex-wrap items-center justify-center gap-4">
        <button
          className="flex h-[56px] items-center gap-3 rounded-[12px] bg-gradient-to-b from-[#fb8a2e] to-[#f26a0d] px-8 text-[15px] font-black text-white shadow-[0_6px_12px_rgba(242,106,13,0.25)] transition hover:brightness-95 active:scale-[0.98]"
          onClick={onBrowseAll}
          type="button"
        >
          <LayoutGrid size={20} />
          Browse All Categories
          <ArrowRight size={20} />
        </button>
        <button
          className="flex h-[56px] items-center gap-3 rounded-[12px] border-2 border-[#fd761a] bg-white px-8 text-[15px] font-black text-[#4b2a1c] transition hover:bg-[#fff1e6] active:scale-[0.98]"
          onClick={onReset}
          type="button"
        >
          <RefreshCw className="text-[#f26a0d]" size={20} />
          Reset Filters
        </button>
      </div>
    </div>
  );
}

const formatReviewCount = (count) => {
  if (count >= 1000) return `${(count / 1000).toFixed(count >= 10000 ? 0 : 1).replace(/\.0$/, "")}k`;
  return String(count);
};

function ProductCard({ product, index, isFavorite, onAddToCart, onFavoriteToggle, onSaveForLater }) {
  const navigate = useNavigate();
  const addToast = useToast();
  const realSizes = product.realSizes || [];
  const [selectedSize, setSelectedSize] = useState(realSizes[0]);
  const [quantity, setQuantity] = useState(1);
  const [imageFailed, setImageFailed] = useState(false);
  const availableStock = product.availableStock;
  const isOutOfStock = availableStock != null && availableStock <= 0;
  const isLowStock = availableStock != null && availableStock > 0 && availableStock <= LOW_STOCK_LIMIT;
  const maxQuantity = availableStock != null && availableStock > 0 ? availableStock : Infinity;
  // Real stock status only (from the product's available stock). Empty when stock is unknown.
  let stockMessage = "";
  let stockTone = "";
  if (isOutOfStock) {
    stockMessage = "Out of Stock";
    stockTone = "text-[#dc2626]";
  } else if (isLowStock) {
    stockMessage = `Only ${availableStock} ${availableStock === 1 ? "product" : "products"} left`;
    stockTone = "text-[#fd761a]";
  } else if (availableStock != null) {
    stockMessage = "In Stock";
    stockTone = "text-[#23723a]";
  }
  const selectedPrice = formatPriceForSize(product.price, realSizes[0], selectedSize);
  const selectedOldPrice = formatPriceForSize(product.oldPrice, realSizes[0], selectedSize);
  const weightLabel = selectedSize || product.weightLabel;
  const showImage = product.hasImage && !imageFailed;
  const selectedProduct = {
    ...product,
    baseOldPrice: product.oldPrice,
    basePrice: product.price,
    oldPrice: selectedOldPrice,
    price: selectedPrice,
    selectedSize: selectedSize ?? product.selectedSize,
  };
  const openDetails = () => {
    navigate(`/product/${slugify(product.name)}`, { state: { product: selectedProduct } });
  };
  const addToCart = (event) => {
    event.stopPropagation();
    onAddToCart(selectedProduct, quantity);
    addToast?.("Added to cart", "cart");
  };
  const saveForLater = (event) => {
    event.stopPropagation();
    onSaveForLater({ ...selectedProduct, quantity });
    addToast?.("Saved for later", "saved");
  };
  const toggleFavorite = (event) => {
    event.stopPropagation();
    onFavoriteToggle(product.name);
    addToast?.(isFavorite ? "Removed from favorites" : "Added to favorites", "favorite");
  };
  const changeQuantity = (event, delta) => {
    event.stopPropagation();
    setQuantity((current) => Math.min(maxQuantity, Math.max(1, current + delta)));
  };

  return (
    <article
      className="group flex h-full cursor-pointer flex-col overflow-hidden rounded-[22px] border border-[#f3e6d9] bg-white p-2.5 shadow-[0_8px_22px_rgba(65,38,20,0.08)] transition-all duration-300 ease-out hover:-translate-y-1 hover:shadow-[0_16px_34px_rgba(66,36,18,0.12)]"
      onClick={openDetails}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          openDetails();
        }
      }}
      role="link"
      tabIndex={0}
      style={{ animation: `productIn 480ms ease-out ${index * 45}ms both` }}
    >
      <div className="relative aspect-[5/4] overflow-hidden rounded-[16px] bg-[#f6ebdf]">
        {showImage ? (
          <img
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
            src={product.image}
            alt={product.name}
            loading="lazy"
            onError={() => setImageFailed(true)}
          />
        ) : (
          <div className="grid h-full w-full place-items-center text-[#d9b89a]">
            <Package size={48} strokeWidth={1.5} />
          </div>
        )}
        {product.cardBadge ? (
          <span className={`absolute left-3 top-3 z-10 rounded-full px-3.5 py-2 text-[12px] font-black leading-none text-white shadow-[0_4px_10px_rgba(0,0,0,0.18)] ${badgeColor(product.cardBadge)}`}>
            {product.cardBadge}
          </span>
        ) : null}
        <button
          aria-label={isFavorite ? `Remove ${product.name} from favorites` : `Add ${product.name} to favorites`}
          aria-pressed={isFavorite}
          className={`absolute right-3 top-3 z-10 grid h-[42px] w-[42px] place-items-center rounded-full border backdrop-blur transition-all duration-300 ease-out hover:-translate-y-0.5 hover:scale-110 active:scale-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#fd761a]/50 max-xl:h-[38px] max-xl:w-[38px] ${
            isFavorite
              ? "border-[#fd761a] bg-[#fd761a] text-white shadow-[0_8px_18px_rgba(253,118,26,0.28)]"
              : "border-white/80 bg-white/95 text-[#4b3a30] shadow-[0_6px_14px_rgba(65,38,20,0.12)] hover:text-[#fd761a]"
          }`}
          onClick={toggleFavorite}
          onKeyDown={(event) => event.stopPropagation()}
          type="button"
        >
          <Heart
            aria-hidden="true"
            className={`transition-all duration-300 ${isFavorite ? "fill-current scale-110" : "fill-transparent group-hover:scale-110"}`}
            size={19}
            strokeWidth={2.3}
          />
        </button>
      </div>

      <div className="flex flex-1 flex-col px-2.5 pb-2 pt-4">
        <h3 className="line-clamp-1 font-sans text-[21px] font-black leading-tight text-[#2b1a12] max-xl:text-[19px]">{product.name}</h3>
        {/* Two lines are always reserved so every card in a row has the same structure and height */}
        <p className="mt-1.5 line-clamp-2 min-h-[2.75em] text-[14px] font-medium leading-snug text-[#8a7d75]">{product.shortDescription}</p>

        <div className="mt-3 flex min-h-[34px] items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-1.5 text-[14px] font-bold text-[#3c302b]">
            {product.rating > 0 || product.reviewCount > 0 ? (
              <>
                <Star aria-hidden="true" className="shrink-0 fill-[#f6a623] text-[#f6a623]" size={17} strokeWidth={1.8} />
                <span>{product.rating}</span>
                {product.reviewCount > 0 ? (
                  <span className="truncate font-medium text-[#8a7d75]">({formatReviewCount(product.reviewCount)} reviews)</span>
                ) : null}
              </>
            ) : (
              <span className="font-medium text-[#8a7d75]">No reviews yet</span>
            )}
          </div>
          {weightLabel ? (
            <div className="relative flex h-[34px] shrink-0 items-center gap-1.5 rounded-[10px] bg-[#f6ebdf] px-3 text-[13px] font-bold text-[#4b3a30]">
              <Package aria-hidden="true" size={15} />
              <span>{weightLabel}</span>
              {realSizes.length > 1 ? (
                <>
                  <ChevronDown aria-hidden="true" size={13} />
                  <select
                    aria-label={`Select size for ${product.name}`}
                    className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                    onChange={(event) => setSelectedSize(event.target.value)}
                    onClick={(event) => event.stopPropagation()}
                    onKeyDown={(event) => event.stopPropagation()}
                    value={selectedSize}
                  >
                    {realSizes.map((size) => (
                      <option key={size} value={size}>{size}</option>
                    ))}
                  </select>
                </>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className="text-[32px] font-black leading-none text-[#1f1410] max-xl:text-[28px]">{selectedPrice}</span>
          {selectedOldPrice ? <span className="text-[16px] font-bold text-[#9c8f87] line-through">{selectedOldPrice}</span> : null}
          {product.discountPercent > 0 ? (
            <span className="rounded-full bg-[#ffe4e6] px-3 py-1.5 text-[12px] font-black leading-none text-[#e11d48]">
              {product.discountPercent}% OFF
            </span>
          ) : null}
        </div>
        <p className={`mt-2.5 min-h-[22px] text-[15px] font-black leading-[22px] ${stockTone}`}>{stockMessage}</p>

        <div className="mt-auto flex items-center justify-center pt-4">
          <div className="flex items-center gap-5 rounded-full bg-[#fbf1e6] px-2 py-1.5">
            <button
              aria-label="Decrease quantity"
              className="grid h-[34px] w-[34px] place-items-center rounded-full bg-[#fde3cc] text-[#4b2a1c] transition hover:bg-[#fbd2b0] disabled:opacity-50"
              disabled={quantity <= 1}
              onClick={(event) => changeQuantity(event, -1)}
              onKeyDown={(event) => event.stopPropagation()}
              type="button"
            >
              <Minus size={16} strokeWidth={2.6} />
            </button>
            <span aria-live="polite" className="min-w-[20px] text-center text-[16px] font-black text-[#2b1a12]">{quantity}</span>
            <button
              aria-label="Increase quantity"
              className="grid h-[34px] w-[34px] place-items-center rounded-full bg-[#fd761a] text-white transition hover:brightness-95 disabled:opacity-50"
              disabled={quantity >= maxQuantity}
              onClick={(event) => changeQuantity(event, 1)}
              onKeyDown={(event) => event.stopPropagation()}
              type="button"
            >
              <Plus size={16} strokeWidth={2.6} />
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-2.5 pt-4">
          <button
            className="flex h-[52px] w-full items-center justify-center gap-3 rounded-[14px] bg-gradient-to-b from-[#fb8a2e] to-[#f26a0d] text-[16px] font-black text-white shadow-[0_6px_12px_rgba(242,106,13,0.25)] transition-all duration-200 hover:brightness-95 hover:shadow-[0_8px_18px_rgba(242,106,13,0.35)] active:scale-[0.98] max-xl:h-[46px] max-xl:text-[14px]"
            onClick={addToCart}
            onKeyDown={(event) => event.stopPropagation()}
            type="button"
          >
            <ShoppingCart size={20} strokeWidth={2.2} />
            Add to Cart
          </button>
          <button
            className="flex h-[48px] w-full items-center justify-center gap-3 rounded-[14px] border border-[#ecdccd] bg-[#fffaf6] text-[15px] font-black text-[#2b1a12] transition-all duration-200 hover:border-[#fd761a] hover:text-[#c34b0d] max-xl:h-[42px] max-xl:text-[13px]"
            onClick={saveForLater}
            onKeyDown={(event) => event.stopPropagation()}
            type="button"
          >
            <Bookmark size={18} strokeWidth={2.2} />
            Save for Later
          </button>
        </div>
      </div>

      <style>{`
        @keyframes productIn {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </article>
  );
}

function StarRating({ interactive = false, onSelect, rating, size = 14 }) {
  return (
    <span
      className={`flex items-center gap-0.5 ${interactive ? "cursor-pointer" : ""}`}
      aria-label={`${rating} out of 5 stars`}
    >
      {Array.from({ length: 5 }, (_, index) => {
        const starValue = index + 1;
        const filled = index < rating;
        const star = (
          <Star
            aria-hidden="true"
            className={filled ? "fill-[#f6a623] text-[#f6a623]" : "fill-[#eadfd7] text-[#eadfd7]"}
            size={size}
            strokeWidth={1.8}
          />
        );

        if (!interactive) {
          return <span key={starValue}>{star}</span>;
        }

        return (
          <button
            aria-label={`Set rating to ${starValue} stars`}
            className="rounded-sm transition hover:scale-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#fd761a]/45"
            key={starValue}
            onClick={(event) => {
              event.stopPropagation();
              onSelect?.(starValue);
            }}
            onKeyDown={(event) => event.stopPropagation()}
            type="button"
          >
            {star}
          </button>
        );
      })}
    </span>
  );
}

export default Product;
