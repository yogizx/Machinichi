import { useCallback, useEffect, useRef, useState } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { Bookmark, ChevronDown, Heart, Menu, Mic, MicOff, Search, ShoppingCart, User, X } from "lucide-react";
import api from "../services/api";
import logo from "../pages/images/machinichi.png";
import SearchDropdown from "./search/SearchDropdown";

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

// Active link = orange pill with a soft glow (design system: Primary / brand orange).
const navLinkClass = ({ isActive }) =>
  `inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-2 transition-all duration-200 xl:px-3 2xl:px-[18px] ${
    isActive
      ? "bg-[#fd761a] font-bold text-white shadow-[0_6px_18px_rgba(253,118,26,0.4)]"
      : "font-medium text-white/90 hover:bg-white/10 hover:text-white"
  }`;

// Orange count bubble on the top-right corner of the heart / bookmark / cart icons.
// Renders nothing when the count is 0, so the bubble only appears once something has been added.
function CountBadge({ count, animate = false }) {
  if (!count || count <= 0) return null;
  return (
    <span
      key={animate ? count : undefined}
      className={`absolute -right-1.5 -top-1.5 grid h-5 min-w-5 place-items-center rounded-full bg-gradient-to-b from-[#ff8a3d] to-[#fd761a] px-1 text-[11px] font-extrabold leading-none text-white shadow-[0_2px_6px_rgba(0,0,0,0.3)] ${
        animate ? "animate-[cartBadgeBounce_500ms_ease-out]" : ""
      }`}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}

function Header({ cartCount = 0, favoriteCount = 0, savedCount = 0, onCartClick }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [navCategories, setNavCategories] = useState([]);
  const recognitionRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Categories for the "Categories" dropdown
  useEffect(() => {
    let mounted = true;
    api
      .get("/categories")
      .then(({ data }) => {
        if (mounted && data?.success && Array.isArray(data.data)) {
          setNavCategories(data.data.filter((item) => item.isActive !== false));
        }
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, []);

  const toggleVoiceSearch = useCallback(() => {
    if (!SpeechRecognition) return;
    if (isListening && recognitionRef.current) {
      recognitionRef.current.stop();
      setIsListening(false);
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.lang = "en-IN";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      setIsListening(false);
      navigate(`/product?search=${encodeURIComponent(transcript)}`);
    };
    recognition.onerror = () => setIsListening(false);
    recognition.onend = () => setIsListening(false);
    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
  }, [isListening, navigate]);

  useEffect(() => {
    return () => {
      if (recognitionRef.current) recognitionRef.current.abort();
    };
  }, []);

  const iconButton =
    "relative flex h-9 w-9 items-center justify-center text-white transition-all duration-200 hover:scale-110 sm:h-10 sm:w-10 lg:h-9 lg:w-9 xl:h-[42px] xl:w-[42px]";

  return (
    <>
      <header
        className={`sticky top-0 z-50 w-full shrink-0 border-b border-[#3b1f13] bg-[linear-gradient(90deg,#321304_0%,#4a2616_55%,#5a3322_100%)] transition-shadow duration-300 ease-out ${
          scrolled ? "shadow-[0_8px_24px_rgba(45,22,12,0.22)]" : "shadow-none"
        }`}
      >
        <div className="relative flex h-[68px] w-full max-w-full items-center justify-between gap-3 px-4 sm:h-[76px] sm:px-6 lg:gap-4 lg:px-6 xl:px-8 2xl:px-[44px]">
          <NavLink aria-label="Machinichi home" className="flex shrink-0 items-center gap-2.5 sm:gap-3" to="/">
            <img
              alt="Machinichi logo"
              className="h-[40px] w-auto shrink-0 object-contain sm:h-[48px] lg:h-[46px] xl:h-[52px] 2xl:h-[58px]"
              src={logo}
            />
            <span className="hidden flex-col sm:flex">
              <span className="font-display text-[22px] font-black leading-none tracking-[-0.02em] text-white sm:text-[24px] lg:text-[22px] xl:text-[28px] 2xl:text-[32px]">
                Machinichi
              </span>
              <span className="mt-1 hidden whitespace-nowrap text-[10px] font-semibold tracking-[0.1em] text-white/85 xl:block 2xl:text-[11px]">
                The Modern General Store
              </span>
            </span>
          </NavLink>

          <div className="hidden min-w-0 items-center lg:flex lg:flex-1 lg:justify-center lg:gap-3 xl:gap-5 2xl:gap-8">
            <nav className="flex shrink-0 items-center gap-0.5 text-[13.5px] xl:gap-1.5 xl:text-[15px] 2xl:gap-2 2xl:text-[16px]">
              <NavLink className={navLinkClass} end to="/">Home</NavLink>
              <NavLink className={navLinkClass} to="/about">About</NavLink>

              {/* Categories with hover / keyboard-focus dropdown */}
              <div className="group relative">
                <NavLink className={navLinkClass} to="/categories">
                  Categories
                  <ChevronDown
                    aria-hidden="true"
                    className="transition-transform duration-200 group-hover:rotate-180 group-focus-within:rotate-180"
                    size={15}
                    strokeWidth={2.6}
                  />
                </NavLink>
                <div className="invisible absolute left-0 top-full z-50 pt-3 opacity-0 transition-all duration-200 group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100">
                  <div className="max-h-[70vh] w-[250px] overflow-y-auto rounded-2xl bg-white p-2 shadow-[0_20px_48px_rgba(0,0,0,0.16)]">
                    <Link
                      className="block rounded-xl px-3.5 py-2.5 text-[14px] font-bold text-[#fd761a] transition hover:bg-[#fff1e4]"
                      to="/categories"
                    >
                      All Categories
                    </Link>
                    {navCategories.map((item) => (
                      <Link
                        key={item._id}
                        className="block truncate rounded-xl px-3.5 py-2.5 text-[14px] font-semibold text-[#27201c] transition hover:bg-[#fff1e4] hover:text-[#ad4d00]"
                        to={`/product?category=${encodeURIComponent(item.name)}`}
                      >
                        {item.name}
                      </Link>
                    ))}
                  </div>
                </div>
              </div>

              <NavLink className={navLinkClass} to="/product">Products</NavLink>
              <NavLink className={navLinkClass} to="/bulk">Bulk Orders</NavLink>
              <NavLink className={navLinkClass} to="/contact">Contact</NavLink>
            </nav>

            <span aria-hidden="true" className="hidden h-9 w-px shrink-0 bg-white/25 xl:block" />

            <div className="relative w-full min-w-[130px] max-w-[270px] flex-1">
              <SearchDropdown onClose={() => {}} />
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-0.5 text-white sm:gap-1 lg:gap-1 xl:gap-2.5">
            <button
              aria-label="Search"
              className="flex h-[38px] w-[38px] items-center justify-center text-white/90 transition-all duration-200 hover:scale-110 hover:text-white lg:hidden"
              onClick={() => navigate("/product")}
            >
              <Search size={20} strokeWidth={2} />
            </button>
            {SpeechRecognition && (
              <button
                aria-label={isListening ? "Stop voice search" : "Voice search"}
                className={`flex h-[38px] w-[38px] items-center justify-center transition-all duration-200 lg:hidden ${isListening ? "text-[#fd761a] animate-pulse" : "text-white/90 hover:scale-110 hover:text-white"}`}
                onClick={toggleVoiceSearch}
              >
                {isListening ? <MicOff size={20} strokeWidth={2} /> : <Mic size={20} strokeWidth={2} />}
              </button>
            )}

            <NavLink aria-label={`Favorites with ${favoriteCount} items`} className={iconButton} to="/favouite">
              <Heart size={24} strokeWidth={1.9} />
              <CountBadge count={favoriteCount} />
            </NavLink>

            <NavLink aria-label={`Saved products with ${savedCount} items`} className={iconButton} to="/saveproduct">
              <Bookmark size={24} strokeWidth={1.9} />
              <CountBadge count={savedCount} />
            </NavLink>

            <button
              aria-label={`Cart with ${cartCount} items`}
              className={iconButton}
              onClick={onCartClick}
              data-cart-icon
            >
              <ShoppingCart size={24} strokeWidth={1.9} />
              <CountBadge count={cartCount} animate />
            </button>

            <NavLink aria-label="Profile" className={iconButton} to="/profile">
              <User size={24} strokeWidth={1.9} />
            </NavLink>

            <button
              aria-label="Toggle menu"
              className="flex h-[38px] w-[38px] items-center justify-center text-white lg:hidden"
              onClick={() => setMenuOpen(true)}
            >
              <Menu size={22} strokeWidth={2.4} />
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Navigation Drawer */}
      {menuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setMenuOpen(false)}
          />
          <div className="absolute right-0 top-0 h-full w-[300px] max-w-[85vw] bg-[#321304] shadow-2xl animate-slideInRight">
            <div className="flex items-center justify-between border-b border-[#5a3322] px-6 py-5">
              <span className="font-display text-[20px] font-black text-white">Menu</span>
              <button
                onClick={() => setMenuOpen(false)}
                className="flex h-[44px] w-[44px] items-center justify-center text-white/80 hover:text-white"
                aria-label="Close menu"
              >
                <X size={24} />
              </button>
            </div>

            <nav className="flex flex-col gap-2 px-6 pt-6">
              <MobileNavLink to="/" onClick={() => setMenuOpen(false)}>Home</MobileNavLink>
              <MobileNavLink to="/about" onClick={() => setMenuOpen(false)}>About</MobileNavLink>
              <MobileNavLink to="/categories" onClick={() => setMenuOpen(false)}>Categories</MobileNavLink>
              <MobileNavLink to="/product" onClick={() => setMenuOpen(false)}>Products</MobileNavLink>
              <MobileNavLink to="/bulk" onClick={() => setMenuOpen(false)}>Bulk Orders</MobileNavLink>
              <MobileNavLink to="/contact" onClick={() => setMenuOpen(false)}>Contact</MobileNavLink>
            </nav>

            <div className="mt-6 border-t border-[#5a3322] px-6 pt-6">
              <p className="mb-3 text-[13px] font-semibold text-[#f7e6cf]/60 uppercase tracking-wider">Account</p>
              <MobileNavLink to="/profile" onClick={() => setMenuOpen(false)}>Profile</MobileNavLink>
              <MobileNavLink to="/orders" onClick={() => setMenuOpen(false)}>Orders</MobileNavLink>
              <MobileNavLink to="/favouite" onClick={() => setMenuOpen(false)}>Wishlist</MobileNavLink>
              <MobileNavLink to="/saveproduct" onClick={() => setMenuOpen(false)}>Saved Items</MobileNavLink>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function MobileNavLink({ to, onClick, children }) {
  return (
    <NavLink
      to={to}
      onClick={onClick}
      className={({ isActive }) =>
        `rounded-xl px-4 py-3 text-[16px] font-bold transition ${
          isActive
            ? "bg-[#fd761a] text-white"
            : "text-[#f7e6cf]/84 hover:bg-[#5a3322]/60 hover:text-white"
        }`
      }
    >
      {children}
    </NavLink>
  );
}

export default Header;
