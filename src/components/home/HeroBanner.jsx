import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Leaf, ShoppingCart, ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import api from "../../services/api";
import { TRUST_BAR_ICONS } from "../../utils/trustBarIcons";

// Everything on this banner comes from the admin (/admin/banner-images): the slide
// images and copy, and the highlights bar. Nothing is hard-coded here.

const hasCopy = (slide) =>
  Boolean(
    (slide.bigText || slide.title || "").trim() ||
      (slide.smallText || slide.subtitle || "").trim() ||
      (slide.buttonText || slide.cta || "").trim()
  );

function HeroBanner() {
  const navigate = useNavigate();
  const [currentSlide, setCurrentSlide] = useState(0);
  const [slides, setSlides] = useState([]);
  const [loading, setLoading] = useState(true);
  const [trustBar, setTrustBar] = useState({ items: [], isActive: true });

  useEffect(() => {
    let mounted = true;
    const fetchActiveBanners = async () => {
      try {
        const response = await api.get("/banners/active");
        const list = response.data?.data;
        if (mounted) setSlides(Array.isArray(list) ? list : []);
      } catch (err) {
        console.error("Error loading active banners:", err);
        if (mounted) setSlides([]);
      } finally {
        if (mounted) setLoading(false);
      }
    };
    const fetchTrustBar = async () => {
      try {
        const { data } = await api.get("/banners/trust-bar");
        const d = data?.data;
        if (mounted && d && Array.isArray(d.items)) {
          setTrustBar({ items: d.items, isActive: d.isActive !== false });
        }
      } catch {
        /* no highlights bar if it cannot be loaded */
      }
    };
    fetchActiveBanners();
    fetchTrustBar();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (slides.length <= 1) return;
    const timer = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % slides.length);
    }, 4500);
    return () => clearInterval(timer);
  }, [slides.length]);

  const goToPrev = () => {
    if (slides.length === 0) return;
    setCurrentSlide((prev) => (prev === 0 ? slides.length - 1 : prev - 1));
  };

  const goToNext = () => {
    if (slides.length === 0) return;
    setCurrentSlide((prev) => (prev + 1) % slides.length);
  };

  const showBar = trustBar.isActive && trustBar.items.length > 0;
  const showControls = slides.length > 1;
  const heightClass = showBar
    ? "min-h-[540px] sm:min-h-[500px] lg:min-h-[520px]"
    : "min-h-[360px] sm:min-h-[440px] lg:min-h-[480px]";

  if (loading) {
    return (
      <section className={`relative flex w-full items-center justify-center bg-[#2b1106] ${heightClass}`}>
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-white/20 border-t-[#fd761a]" />
      </section>
    );
  }

  // No banner created by the admin yet: show nothing (no placeholder / mock banner).
  if (slides.length === 0) return null;

  const safeIndex = Math.min(currentSlide, slides.length - 1);
  const current = slides[safeIndex];
  const bigTextVal = current.bigText || current.title || "";
  const smallTextVal = current.smallText || current.subtitle || "";
  const buttonTextVal = current.buttonText || current.cta || "";
  const buttonURLVal = current.buttonURL || current.ctaLink || current.linkUrl || "";
  const isRight = current.contentPosition === "Right Side";
  const isImageOnly = !hasCopy(current);

  // Internal paths use the router, external links open in a new tab, javascript: links are blocked.
  const handleCtaClick = (url) => {
    if (!url) return;
    const lower = url.toLowerCase().trim();
    if (lower.startsWith("javascript:")) return;
    if (lower.startsWith("http://") || lower.startsWith("https://")) {
      window.open(url, "_blank", "noopener,noreferrer");
    } else {
      navigate(url);
    }
  };

  const arrowClass =
    "absolute top-[40%] z-20 flex h-10 w-10 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full bg-white text-[#321304] shadow-[0_6px_16px_rgba(0,0,0,0.25)] transition hover:scale-110 active:scale-95 sm:h-11 sm:w-11";

  return (
    <section className={`relative isolate flex w-full items-center overflow-hidden bg-[#2b1106] text-white ${heightClass}`}>
      {/* Background slides (cross-fade). The image fills the whole banner edge to edge. */}
      {slides.map((slide, index) => {
        const slideWebp = slide.imageWebp || slide.image || slide.imageUrl;
        const slideFallback = slide.imageFallback || slide.imageUrl || slide.image;
        const slideRight = slide.contentPosition === "Right Side";

        return (
          <div
            key={slide._id}
            className={`absolute inset-0 transition-opacity duration-700 ease-in-out ${
              index === safeIndex ? "z-0 opacity-100" : "pointer-events-none -z-10 opacity-0"
            }`}
          >
            <picture className="absolute inset-0 block h-full w-full">
              <source srcSet={slideWebp} type="image/webp" />
              <img
                src={slideFallback}
                alt={slide.bigText || slide.title || "Machinichi Banner"}
                className="h-full w-full object-cover object-center"
                loading={index === 0 ? "eager" : "lazy"}
              />
            </picture>

            {/* Light dark gradient on the text side only (no white haze); skipped for image-only slides */}
            {hasCopy(slide) && (
              <div
                className={`absolute inset-y-0 w-full sm:w-[65%] ${
                  slideRight
                    ? "right-0 bg-gradient-to-l from-black/45 via-black/20 to-transparent"
                    : "left-0 bg-gradient-to-r from-black/45 via-black/20 to-transparent"
                }`}
              />
            )}
          </div>
        );
      })}

      {showControls && (
        <>
          <button aria-label="Previous slide" className={`${arrowClass} left-3 sm:left-5`} onClick={goToPrev} type="button">
            <ChevronLeft size={20} strokeWidth={2.5} />
          </button>
          <button aria-label="Next slide" className={`${arrowClass} right-3 sm:right-5`} onClick={goToNext} type="button">
            <ChevronRight size={20} strokeWidth={2.5} />
          </button>
        </>
      )}

      {/* Slide copy (admin text only) */}
      {!isImageOnly && (
        <div
          className={`relative z-10 mx-auto flex w-full max-w-[1440px] px-14 pt-10 sm:px-20 lg:px-24 ${
            showBar ? "pb-[190px] sm:pb-[130px]" : "pb-12"
          } ${isRight ? "justify-end" : "justify-start"}`}
        >
          <div
            key={current._id}
            className={`flex max-w-[620px] animate-[fadeUp_500ms_ease-out_both] flex-col ${
              isRight ? "items-end text-right" : "items-start text-left"
            }`}
          >
            {bigTextVal.trim() && (
              <h1 className="font-display text-[34px] font-black leading-[1.05] tracking-[-0.02em] text-white [text-shadow:0_2px_14px_rgba(0,0,0,0.45)] sm:text-[48px] lg:text-[60px]">
                {bigTextVal}
              </h1>
            )}

            {smallTextVal.trim() && (
              <p className="mt-4 max-w-[460px] text-[15px] font-medium leading-relaxed text-white/95 [text-shadow:0_1px_10px_rgba(0,0,0,0.45)] sm:text-[18px]">
                {smallTextVal}
              </p>
            )}

            {buttonTextVal.trim() && (
              <div className={`mt-6 flex flex-wrap items-center gap-3 ${isRight ? "justify-end" : ""}`}>
                <button
                  className="inline-flex h-[50px] cursor-pointer items-center gap-2.5 rounded-full bg-[#fd761a] px-7 text-[15px] font-black text-white shadow-[0_8px_22px_rgba(234,109,23,0.35)] transition-all duration-200 ease-out hover:scale-[1.03] hover:bg-[#e86710] active:scale-[0.98] active:bg-[#d55b0e]"
                  onClick={() => handleCtaClick(buttonURLVal)}
                  type="button"
                >
                  <ShoppingCart size={18} strokeWidth={2.2} />
                  {buttonTextVal}
                  <ArrowRight size={18} strokeWidth={2.6} />
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Pagination dots (plain, no frosted background) */}
      {showControls && (
        <div
          className={`absolute left-1/2 z-20 flex -translate-x-1/2 items-center gap-2 ${
            showBar ? "bottom-[190px] sm:bottom-[112px]" : "bottom-4"
          }`}
        >
          {slides.map((slide, index) => (
            <button
              key={slide._id}
              aria-label={`Go to slide ${index + 1}`}
              aria-current={index === safeIndex}
              onClick={() => setCurrentSlide(index)}
              className={`h-2.5 w-2.5 cursor-pointer rounded-full shadow-[0_1px_4px_rgba(0,0,0,0.4)] transition-all duration-300 ${
                index === safeIndex ? "scale-125 bg-[#fd761a]" : "bg-white/60 hover:bg-white"
              }`}
              type="button"
            />
          ))}
        </div>
      )}

      {/* Highlights bar (editable in /admin/banner-images) */}
      {showBar && <HighlightsBar items={trustBar.items} />}
    </section>
  );
}

function HighlightsBar({ items }) {
  return (
    <div className="absolute inset-x-0 bottom-0 z-10 px-3 pb-3 sm:px-6 sm:pb-5 lg:px-8">
      <div className="mx-auto max-w-[1440px] rounded-[18px] border border-white/15 bg-black/35 px-4 py-3.5 shadow-[0_8px_24px_rgba(0,0,0,0.18)] backdrop-blur-md sm:py-4">
        <ul className="grid grid-cols-2 gap-x-3 gap-y-3.5 lg:grid-flow-col lg:auto-cols-fr lg:gap-y-0">
          {items.map((item, index) => {
            const Icon = TRUST_BAR_ICONS[item.icon]?.Icon || Leaf;
            return (
              <li
                key={`${item.title}-${index}`}
                className={`flex min-w-0 items-center gap-3 lg:justify-center lg:px-3 ${
                  index > 0 ? "lg:border-l lg:border-white/20" : ""
                }`}
              >
                <Icon aria-hidden="true" className="shrink-0 text-[#ff8a3d]" size={30} strokeWidth={1.7} />
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-bold leading-[1.3] text-white sm:text-[15px]">{item.title}</p>
                  {item.subtitle ? (
                    <p className="mt-0.5 truncate text-[12px] font-medium leading-[1.3] text-white/80 sm:text-[13.5px]">
                      {item.subtitle}
                    </p>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

export default HeroBanner;
