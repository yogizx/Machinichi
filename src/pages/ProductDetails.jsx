import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import {
  Bookmark,
  ChevronLeft,
  ChevronRight,
  Copy,
  Crosshair,
  Heart,
  Lock,
  MapPin,
  MessageCircle,
  Minus,
  Package,
  Plus,
  RotateCcw,
  Search,
  Share2,
  ShieldCheck,
  ShoppingCart,
  Star,
  Truck,
  X,
  Zap,
} from "lucide-react";
import api from "../services/api";
import ProductHero from "../components/product/ProductHero";
import ProductInfoSections from "../components/product/ProductInfoSections";
import ProductRelatedSections from "../components/product/ProductRelatedSections";
import ProductReviewsSection from "../components/product/ProductReviewsSection";

// Visual image assets matching the reference image presentation
const mainCookieBoxImage =
  "https://images.unsplash.com/photo-1558961363-fa8fdf82db35?auto=format&fit=crop&w=1000&q=92";
const thumb2 =
  "https://images.unsplash.com/photo-1499636136210-6f4ee915583e?auto=format&fit=crop&w=300&q=90";
const thumb3 =
  "https://images.unsplash.com/photo-1590080875515-8a3a8dc5735e?auto=format&fit=crop&w=300&q=90";
const thumb4 =
  "https://images.unsplash.com/photo-1548365328-8c6db4b63388?auto=format&fit=crop&w=300&q=90";



const defaultSavedAddresses = [];
const LOW_STOCK_LIMIT = 5;

const SIZE_LIKE_NAME = /^\s*[0-9]*\s*(g|kg|grams?|kgs?|ml|milli[\s-]?liters?|l|lit[ea]rs?|cm|inch|in|pack|pcs|pieces?|units?|nos)\b\s*$/i;

function getHighlightIcon(title = "") {
  const t = (title || "").toLowerCase();
  if (t.includes("crispy") || t.includes("delicious") || t.includes("snack") || t.includes("taste") || t.includes("flavor") || t.includes("food") || t.includes("treat") || t.includes("crunch")) return "🍪";
  if (t.includes("fresh") || t.includes("prepared") || t.includes("cook") || t.includes("baking")) return "🥗";
  if (t.includes("organic") || t.includes("natural") || t.includes("pure") || t.includes("eco")) return "🌿";
  if (t.includes("healthy") || t.includes("diet") || t.includes("health") || t.includes("nutritious")) return "🥑";
  if (t.includes("premium") || t.includes("quality") || t.includes("best") || t.includes("gold") || t.includes("grade")) return "🏆";
  if (t.includes("fast") || t.includes("delivery") || t.includes("ship") || t.includes("express")) return "🚚";
  if (t.includes("secure") || t.includes("safety") || t.includes("shield") || t.includes("guarantee") || t.includes("protect")) return "🛡️";
  if (t.includes("perfect") || t.includes("party") || t.includes("tea") || t.includes("evening")) return "☕";
  return "📦";
}

function ProductDetails({
  favoriteProducts = new Set(),
  savedProducts = [],
  onAddToCart = () => {},
  onFavoriteToggle = () => {},
  onSaveForLater = () => {},
}) {
  const { slug } = useParams();
  const { state } = useLocation();
  const navigate = useNavigate();
  const [apiProduct, setApiProduct] = useState(null);
  const [relatedProductsApi, setRelatedProductsApi] = useState([]);
  const [trendingProductsApi, setTrendingProductsApi] = useState([]);

  // Brand shown in Product Highlights = Brand Name saved in /admin/profile -> Store Information.
  // Defaults to "Machinichi" when the admin has not entered one.
  const [storeBrandName, setStoreBrandName] = useState("Machinichi");
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.get("/user/store-info");
        const name = typeof data?.brandName === "string" ? data.brandName.trim() : "";
        if (!cancelled && name) setStoreBrandName(name);
      } catch {
        /* keep the default "Machinichi" */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (state?.product) {
      setApiProduct(state.product);
    }
    if (!slug) return;
    (async () => {
      try {
        const { data } = await api.get(`/products/slug/${encodeURIComponent(slug)}`);
        if (data.success && data.data) {
          setApiProduct(data.data);
        }
      } catch {
        /* fallback to existing state if available */
      }
    })();
  }, [slug]);

  const selected = apiProduct || (state?.product ? state.product : {});

  useEffect(() => {
    const targetId = selected._id || selected.id || slug;
    if (!targetId) return;
    (async () => {
      try {
        const { data } = await api.get(`/products/related/${encodeURIComponent(targetId)}`);
        if (data.success && Array.isArray(data.data)) {
          setRelatedProductsApi(data.data);
        }
      } catch {}
    })();
  }, [selected._id, selected.id, slug]);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get("/products/trending");
        if (data.success && Array.isArray(data.data)) {
          setTrendingProductsApi(data.data);
        }
      } catch {}
    })();
  }, []);

  const product = {
    ...selected,
    title: selected.name || "Product",
    price: selected.sellingPrice ? `₹${Number(selected.sellingPrice).toLocaleString("en-IN")}` : selected.price || "₹0",
    oldPrice: selected.mrpPrice ? `₹${Number(selected.mrpPrice).toLocaleString("en-IN")}` : selected.oldPrice || "",
    mainImage: selected.images?.[0]?.url || selected.image || mainCookieBoxImage,
    rating: selected.averageRating || selected.rating || 4.8,
    reviewsCount: selected.reviewCount || selected.reviewsCount || 0,
  };

  const isFavorite = favoriteProducts.has(product.title);
  const isSaved = savedProducts.some((item) => (item.name || item.title) === (product.title || product.name));

  const handleSaveForLater = () => {
    if (!product) return;
    onSaveForLater({
      name: product.title || product.name,
      price: product.price,
      oldPrice: product.oldPrice,
      image: product.mainImage || product.image,
      sizes: [selectedSize],
      selectedSize: selectedSize,
      origin: product.origin || "ORGANIC STAPLE",
      rating: product.rating || 5,
    });
  };

  useEffect(() => {
    if (product._id) {
      let vid = localStorage.getItem("analytics_visitor_id");
      if (!vid) {
        vid = crypto.randomUUID();
        localStorage.setItem("analytics_visitor_id", vid);
      }
      api.post(`/tracking/products/${product._id}/view`, { sessionId: vid }).catch(() => {});
    }
  }, [product._id]);

  const [activeImage, setActiveImage] = useState(product.mainImage);
  
  // Dynamic grouping for all 4 variant types: Material, Color, Size, Unit
  const configuredVariantGroups = useMemo(() => {
    const groups = [];
    const rawVariants = Array.isArray(selected.variants)
      ? selected.variants.filter((v) => v.status !== "Inactive" && v.isAvailable !== false)
      : [];

    const createOption = (v, type, labelVal, index) => {
      const selPrice = v.sellingPrice
        ? `₹${Number(v.sellingPrice).toLocaleString("en-IN")}`
        : product.price;
      const mrpPrice = v.mrpPrice
        ? `₹${Number(v.mrpPrice).toLocaleString("en-IN")}`
        : product.oldPrice;
      const variantImg =
        Array.isArray(v.images) && v.images.length > 0 && v.images[0]?.url
          ? v.images[0].url
          : (selected.images?.[0]?.url || product.mainImage);

      return {
        id: v._id || v.sku || `opt-${type}-${index}`,
        type,
        label: labelVal,
        price: selPrice,
        oldPrice: mrpPrice,
        image: variantImg,
        variantObj: v,
      };
    };

    if (rawVariants.length > 0) {
      // 1. Material Variants
      const materialVariants = rawVariants.filter(
        (v) =>
          v.attributes?.variantType === "material" ||
          v._variantType === "material" ||
          v.material ||
          v.materialValue ||
          v.attributes?.material
      );
      if (materialVariants.length > 0) {
        groups.push({
          type: "material",
          label: "Material",
          options: materialVariants.map((v, i) =>
            createOption(
              v,
              "material",
              v.material ||
                v.materialValue ||
                v.attributes?.material ||
                (v.name && v.name !== selected.name ? v.name : `Material ${i + 1}`),
              i
            )
          ),
        });
      }

      // 2. Color Variants
      const colorVariants = rawVariants.filter(
        (v) =>
          v.attributes?.variantType === "color" ||
          v._variantType === "color" ||
          v.color ||
          v.colorValue ||
          v.colorName ||
          v.attributes?.colorName
      );
      if (colorVariants.length > 0) {
        groups.push({
          type: "color",
          label: "Color",
          options: colorVariants.map((v, i) =>
            createOption(
              v,
              "color",
              v.colorName ||
                v.attributes?.colorName ||
                v.colorValue ||
                v.color ||
                (v.name && v.name !== selected.name ? v.name : `Color ${i + 1}`),
              i
            )
          ),
        });
      }

      // 3. Size Variants
      const sizeVariants = rawVariants.filter(
        (v) =>
          v.attributes?.variantType === "size" ||
          v._variantType === "size" ||
          v.size ||
          v.sizeValue ||
          v.attributes?.size
      );
      if (sizeVariants.length > 0) {
        groups.push({
          type: "size",
          label: "Size",
          options: sizeVariants.map((v, i) =>
            createOption(
              v,
              "size",
              v.sizeValue ||
                v.size ||
                v.attributes?.size ||
                (v.name && v.name !== selected.name ? v.name : `Size ${i + 1}`),
              i
            )
          ),
        });
      }

      // 4. Unit Variants
      const unitVariants = rawVariants.filter(
        (v) =>
          v.attributes?.variantType === "unit" ||
          v._variantType === "unit" ||
          v.unit ||
          v.unitValue ||
          v.attributes?.unit
      );
      if (unitVariants.length > 0) {
        groups.push({
          type: "unit",
          label: "Unit",
          options: unitVariants.map((v, i) => {
            const qty = v.unitQuantity || v.attributes?.unitQuantity || "";
            const u = v.unit || v.unitValue || v.attributes?.unit || "";
            const labelVal =
              qty && u
                ? `${qty} ${u}`
                : u || qty || (v.name && v.name !== selected.name ? v.name : `Unit ${i + 1}`);
            return createOption(v, "unit", labelVal, i);
          }),
        });
      }
    }

    // Legacy fallback if no variants array exists but measurement.sizes exist
    if (groups.length === 0 && selected.measurement?.sizes && selected.measurement.sizes.length > 0) {
      groups.push({
        type: "size",
        label: "Size",
        options: selected.measurement.sizes.map((sizeStr) => ({
          id: sizeStr,
          type: "size",
          label: sizeStr,
          price: product.price,
          oldPrice: product.oldPrice,
          image: product.mainImage,
          variantObj: null,
        })),
      });
    }

    // Return ALL configured variant groups in fixed display order.
    // Groups are already pushed in order: Material → Color → Size → Unit.
    // Only groups with actual data are included (empty groups are skipped above).

    return groups;
  }, [selected, product.price, product.oldPrice, product.mainImage]);

  const [selectedOptionIdMap, setSelectedOptionIdMap] = useState({});

  const handleSelectOption = (groupType, opt) => {
    setSelectedOptionIdMap((prev) => ({
      ...prev,
      [groupType]: prev[groupType] === opt.id ? null : opt.id,
    }));
  };

  const activeSelectedOption = useMemo(() => {
    for (const group of configuredVariantGroups) {
      const selectedId = selectedOptionIdMap[group.type];
      if (selectedId) {
        const found = group.options.find((o) => o.id === selectedId);
        if (found) return found;
      }
    }
    return null;
  }, [configuredVariantGroups, selectedOptionIdMap]);

  const activeProductName = useMemo(() => {
    const v = activeSelectedOption?.variantObj;
    const vName = v?.name ? String(v.name).trim() : "";
    if (vName && !SIZE_LIKE_NAME.test(vName) && vName.toLowerCase() !== String(product.title).toLowerCase()) {
      return vName;
    }
    return product.title;
  }, [activeSelectedOption, product.title]);

  useEffect(() => {
    if (activeSelectedOption) {
      const varImgs = (activeSelectedOption.variantObj?.images || [])
        .map((img) => (typeof img === "string" ? img : img?.url))
        .filter(Boolean);
      if (varImgs.length > 0) {
        setActiveImage(varImgs[0]);
      } else if (activeSelectedOption.image) {
        setActiveImage(activeSelectedOption.image);
      }
    } else {
      const baseImg = selected.images?.[0]?.url || product.mainImage;
      setActiveImage(baseImg);
    }
  }, [activeSelectedOption, selected.images, product.mainImage]);

  const galleryThumbs = useMemo(() => {
    if (activeSelectedOption) {
      const varImgs = (activeSelectedOption.variantObj?.images || [])
        .map((img) => (typeof img === "string" ? img : img?.url))
        .filter(Boolean);
      if (varImgs.length > 0) {
        return Array.from(new Set(varImgs));
      }
      return [activeSelectedOption.image || product.mainImage];
    }

    const baseImages =
      selected.images && selected.images.length > 0
        ? selected.images.map((img) => (typeof img === "string" ? img : img?.url)).filter(Boolean)
        : [product.mainImage, thumb2, thumb3, thumb4];

    return Array.from(new Set(baseImages));
  }, [activeSelectedOption, selected.images, product.mainImage]);

  // Related products (real data from the API; the product's own "frequently bought together" list is the fallback)
  const relatedProductsData = useMemo(() => {
    const src =
      relatedProductsApi && relatedProductsApi.length > 0
        ? relatedProductsApi
        : Array.isArray(selected.frequentlyBoughtTogether)
          ? selected.frequentlyBoughtTogether
          : [];
    return src
      .filter((p) => p && typeof p === "object" && p.name)
      .map((p) => ({
        raw: p,
        _id: p._id,
        name: p.name,
        slug: p.slug || "",
        image: p.images?.[0]?.url || p.thumbnail || "",
        price: Number(p.sellingPrice) || 0,
        mrp: Number(p.mrpPrice) || 0,
        rating: Number(p.averageRating) || 0,
        ratingCount: Number(p.reviewCount) || 0,
        size: p.productHighlights?.quantity || p.measurement?.packageWeight || "",
      }));
  }, [relatedProductsApi, selected]);

  // Build trending products from API data (exclude current product)
  const trendingProductsData = useMemo(() => {
    const currentId = selected._id || selected.id;
    if (trendingProductsApi && trendingProductsApi.length > 0) {
      return trendingProductsApi
        .filter(p => p._id !== currentId)
        .map(p => ({
        _id: p._id,
        name: p.name || "Product",
        rating: p.averageRating || "4.8",
        price: p.sellingPrice ? `₹${Number(p.sellingPrice).toLocaleString("en-IN")}` : "₹0",
        image: p.images?.[0]?.url || p.thumbnail || "",
        slug: p.slug || "",
      }));
    }
    if (selected.crossSell && selected.crossSell.length > 0) {
      return selected.crossSell.map(p => ({
        _id: p._id,
        name: p.name || "Product",
        rating: p.averageRating || "4.8",
        price: p.sellingPrice ? `₹${Number(p.sellingPrice).toLocaleString("en-IN")}` : "₹0",
        image: p.images?.[0]?.url || p.thumbnail || "",
        slug: p.slug || "",
      }));
    }
    return [];
  }, [trendingProductsApi, selected]);

  const [quantity, setQuantity] = useState(1);
  const [isAdded, setIsAdded] = useState(false);

  // Share Popover State
  const [isShareOpen, setIsShareOpen] = useState(false);
  const [copiedToast, setCopiedToast] = useState(false);

  // Delivery Location Side Drawer State
  const [isLocationDrawerOpen, setIsLocationDrawerOpen] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState(
    "Rajiv Gandhi Street, Coimbatore - 641001"
  );
  const [locationSearchInput, setLocationSearchInput] = useState("");

  // Logged-in delivery address (show the profile's default/primary address).
  const [isUserSignedIn, setIsUserSignedIn] = useState(() => Boolean(localStorage.getItem("accessToken")));
  const [userAddress, setUserAddress] = useState(null);
  const [addressLoading, setAddressLoading] = useState(false);

  useEffect(() => {
    if (!isUserSignedIn) {
      (async () => {
        setUserAddress(null);
        setAddressLoading(false);
      })();
      return undefined;
    }
    let cancelled = false;
    (async () => {
      setAddressLoading(true);
      try {
        const defaultRes = await api.get("/profile/addresses/default", { timeout: 30000 });
        let addr = defaultRes.data?.address || null;
        if (!addr) {
          const allRes = await api.get("/profile/addresses", { timeout: 30000 });
          addr = allRes.data?.addresses?.[0] || null;
        }
        if (!cancelled) setUserAddress(addr || null);
      } catch {
        if (!cancelled) setUserAddress(null);
      }
      if (!cancelled) setAddressLoading(false);
    })();
    const onUnauthorized = () => setIsUserSignedIn(false);
    window.addEventListener("unauthorized", onUnauthorized);
    return () => {
      cancelled = true;
      window.removeEventListener("unauthorized", onUnauthorized);
    };
  }, [isUserSignedIn]);

  const deliveryAddressText = userAddress
    ? [
        userAddress.houseFlat,
        userAddress.streetArea,
        userAddress.landmark,
      ]
        .filter(Boolean)
        .join(", ") +
      (userAddress.city || userAddress.state || userAddress.pincode
        ? `, ${[userAddress.city, userAddress.state].filter(Boolean).join(", ")}${userAddress.pincode ? ` - ${userAddress.pincode}` : ""}`
        : "")
    : "";

  const handleDeliveryClick = () => {
    if (!isUserSignedIn) {
      navigate("/signin");
      return;
    }
    navigate("/account");
  };

  // Live customer reviews + rating summary
  const [reviews, setReviews] = useState([]);
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [ratingSummary, setRatingSummary] = useState(() => ({
    average: 0,
    total: 0,
    distribution: [5, 4, 3, 2, 1].map((star) => ({ star, count: 0 })),
  }));

  const activeVariantSku = activeSelectedOption?.variantObj?.sku || "";
  const [reviewVariantOverridden, setReviewVariantOverride] = useState(false);

  const reviewFilterSku = reviewVariantOverridden ? "" : activeVariantSku;

  useEffect(() => {
    (async () => {
      setReviewVariantOverride(false);
    })();
  }, [activeVariantSku]);

  useEffect(() => {
    const targetId = selected._id || selected.id || slug;
    if (!targetId) return;
    (async () => {
      setReviewsLoading(true);
      try {
        const { data } = await api.get(`/reviews/product/${encodeURIComponent(targetId)}`, {
          params: {
            limit: 50,
            ...(reviewFilterSku ? { variant: reviewFilterSku } : {}),
          },
          timeout: 30000,
        });
        if (data.success) {
          setReviews(Array.isArray(data.data) ? data.data : []);
          if (data.ratingSummary) setRatingSummary(data.ratingSummary);
        }
      } catch {
        /* keep UI graceful if reviews are unavailable */
      }
      setReviewsLoading(false);
    })();
  }, [selected._id, selected.id, slug, reviewFilterSku]);

  const hasVariantReviewFilter = Boolean(reviewFilterSku);
  const reviewAverage = hasVariantReviewFilter
    ? ratingSummary.average
    : ratingSummary.total > 0
      ? ratingSummary.average
      : Number(product.averageRating || product.rating || 0);
  const reviewTotal = hasVariantReviewFilter
    ? ratingSummary.total
    : ratingSummary.total > 0
      ? ratingSummary.total
      : Number(product.reviewsCount || 0);

  const activePrice = activeSelectedOption ? activeSelectedOption.price : product.price;
  const activeOldPrice = activeSelectedOption ? activeSelectedOption.oldPrice : product.oldPrice;
  const activeSku = activeSelectedOption?.variantObj?.sku || selected.sku || "";
  const activeBarcode = activeSelectedOption?.variantObj?.barcode || selected.barcode || "";
  const activeDescription = activeSelectedOption?.variantObj?.description || product.productDescriptionDetailed || product.description || "No description available for this product.";

  // Stock status. Available = Current stock - Reserved (same formula as /admin/inventory). null when stock is unknown.
  const availableStock =
    selected.availableStock != null
      ? Math.max(0, Number(selected.availableStock) || 0)
      : selected.quantity != null
        ? Math.max(0, (Number(selected.quantity) || 0) - (Number(selected.reservedQuantity) || 0))
        : null;
  const isOutOfStock = availableStock != null && availableStock <= 0;
  const isLowStock = availableStock != null && availableStock > 0 && availableStock <= LOW_STOCK_LIMIT;

  const handleAddToCartClick = () => {
    const itemToCart = {
      ...product,
      price: activePrice,
      oldPrice: activeOldPrice,
      selectedSize: activeSelectedOption?.label || "Default",
      variantSku: activeSelectedOption?.variantObj?.sku,
      selectedVariant: activeSelectedOption?.variantObj,
      image: activeSelectedOption?.image || product.mainImage,
      quantity,
    };
    onAddToCart(itemToCart, quantity);
    setIsAdded(true);
    setTimeout(() => setIsAdded(false), 1500);
  };

  const handleBuyNow = () => {
    const itemToCart = {
      ...product,
      price: activePrice,
      oldPrice: activeOldPrice,
      selectedSize: activeSelectedOption?.label || "Default",
      variantSku: activeSelectedOption?.variantObj?.sku,
      selectedVariant: activeSelectedOption?.variantObj,
      image: activeSelectedOption?.image || product.mainImage,
      quantity,
    };
    navigate("/checkout", { state: { product: itemToCart, quantity } });
  };

  // "Frequently bought together": this product + the products the admin linked to it (real data only)
  const bundleItems = useMemo(() => {
    const mainPrice = Number(String(activePrice).replace(/[^\d.]/g, "")) || 0;
    const mainMrp = Number(String(activeOldPrice).replace(/[^\d.]/g, "")) || 0;
    const linked = (Array.isArray(selected.frequentlyBoughtTogether) ? selected.frequentlyBoughtTogether : [])
      .filter((p) => p && typeof p === "object" && p.name && Number(p.sellingPrice) > 0)
      .slice(0, 2);
    if (!mainPrice || linked.length === 0) return [];
    return [
      {
        id: "__main__",
        name: activeProductName,
        image: activeSelectedOption?.image || product.mainImage,
        price: mainPrice,
        mrp: mainMrp,
        size: activeSelectedOption?.label || selected.productHighlights?.quantity || "",
      },
      ...linked.map((p) => ({
        id: String(p._id),
        name: p.name,
        image: p.images?.[0]?.url || p.thumbnail || "",
        price: Number(p.sellingPrice) || 0,
        mrp: Number(p.mrpPrice) || 0,
        size: p.productHighlights?.quantity || p.measurement?.packageWeight || "",
        raw: p,
      })),
    ];
  }, [selected, activePrice, activeOldPrice, activeProductName, activeSelectedOption, product.mainImage]);

  const toCartItem = (p) => ({
    ...p,
    title: p.name,
    price: p.sellingPrice ? `₹${Number(p.sellingPrice).toLocaleString("en-IN")}` : "₹0",
    oldPrice: p.mrpPrice ? `₹${Number(p.mrpPrice).toLocaleString("en-IN")}` : "",
    image: p.images?.[0]?.url || p.thumbnail || "",
    selectedSize: "Default",
    quantity: 1,
  });

  const handleBundleAdd = async (ids) => {
    for (const id of ids) {
      if (id === "__main__") {
        await onAddToCart(
          {
            ...product,
            price: activePrice,
            oldPrice: activeOldPrice,
            selectedSize: activeSelectedOption?.label || "Default",
            variantSku: activeSelectedOption?.variantObj?.sku,
            selectedVariant: activeSelectedOption?.variantObj,
            image: activeSelectedOption?.image || product.mainImage,
            quantity: 1,
          },
          1
        );
      } else {
        const item = bundleItems.find((b) => b.id === id);
        if (item?.raw) await onAddToCart(toCartItem(item.raw), 1);
      }
    }
  };

  const handleRelatedAdd = (item) => {
    // products that need a variant choice are opened instead of being added blindly
    if (Array.isArray(item.raw?.variants) && item.raw.variants.length > 0 && item.slug) {
      navigate(`/product/${item.slug}`);
      return;
    }
    onAddToCart(toCartItem(item.raw), 1);
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopiedToast(true);
    setTimeout(() => {
      setCopiedToast(false);
      setIsShareOpen(false);
    }, 1800);
  };

  const handleWhatsAppShare = () => {
    const text = `Check out ${product.title} on Machinichi: ${window.location.href}`;
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, "_blank");
    setIsShareOpen(false);
  };

  const handleSelectAddress = (address) => {
    setSelectedLocation(address);
    setIsLocationDrawerOpen(false);
  };

  const handleUseCurrentLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        () => {
          setSelectedLocation("Current Location (Coimbatore - 641001)");
          setIsLocationDrawerOpen(false);
        },
        () => {
          setSelectedLocation("Coimbatore, Tamil Nadu - 641001");
          setIsLocationDrawerOpen(false);
        }
      );
    } else {
      setSelectedLocation("Coimbatore, Tamil Nadu - 641001");
      setIsLocationDrawerOpen(false);
    }
  };

  const handleCustomLocationApply = (e) => {
    e.preventDefault();
    if (locationSearchInput.trim()) {
      setSelectedLocation(locationSearchInput.trim());
      setLocationSearchInput("");
      setIsLocationDrawerOpen(false);
    }
  };

  return (
    <div className="w-full bg-[#fcfcfc] text-[#111111] font-sans antialiased">
      {/* 1. Main Product Details Area */}
      <ProductHero
        selected={selected}
        product={product}
        title={activeProductName}
        galleryThumbs={galleryThumbs}
        activeImage={activeImage}
        setActiveImage={setActiveImage}
        reviewAverage={reviewAverage}
        reviewTotal={reviewTotal}
        activePrice={activePrice}
        activeOldPrice={activeOldPrice}
        activeSelectedOption={activeSelectedOption}
        groups={configuredVariantGroups}
        selectedOptionIdMap={selectedOptionIdMap}
        onSelectOption={handleSelectOption}
        quantity={quantity}
        setQuantity={setQuantity}
        isOutOfStock={isOutOfStock}
        isLowStock={isLowStock}
        availableStock={availableStock}
        onAddToCart={handleAddToCartClick}
        isAdded={isAdded}
        isFavorite={isFavorite}
        onToggleFavorite={() => onFavoriteToggle(product.title, product._id)}
        isUserSignedIn={isUserSignedIn}
        addressLoading={addressLoading}
        userAddress={userAddress}
        deliveryAddressText={deliveryAddressText}
        onDeliveryClick={handleDeliveryClick}
      />


      <ProductInfoSections
        selected={selected}
        product={product}
        storeBrandName={storeBrandName}
        activeDescription={activeDescription}
        highlightIcon={getHighlightIcon}
      />

      <ProductRelatedSections
        bundleItems={bundleItems}
        onAddBundle={handleBundleAdd}
        related={relatedProductsData}
        favoriteProducts={favoriteProducts}
        onFavoriteToggle={onFavoriteToggle}
        onAddRelated={handleRelatedAdd}
        onOpen={(s) => navigate(`/product/${s}`)}
        onViewAll={() => navigate("/product")}
      />

      <ProductReviewsSection
        reviews={reviews}
        reviewsLoading={reviewsLoading}
        ratingSummary={ratingSummary}
        reviewAverage={reviewAverage}
        reviewTotal={reviewTotal}
        activeVariantSku={activeVariantSku}
        reviewFilterSku={reviewFilterSku}
        activeProductName={activeProductName}
        onToggleVariantFilter={() => setReviewVariantOverride((prev) => !prev)}
      />

      {/* 8. Trending Products */}
      <section className="mx-auto max-w-[1360px] px-4 py-8 sm:px-6 lg:px-8 pb-12">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-extrabold text-[#111111]">Trending Products</h2>
          <div className="flex items-center gap-2.5">
            <button
              className="grid h-9 w-9 place-items-center rounded-full bg-[#f96e15] text-white shadow-sm hover:bg-[#e05d09]"
              type="button"
            >
              <ChevronLeft size={20} />
            </button>
            <button
              className="grid h-9 w-9 place-items-center rounded-full bg-[#f96e15] text-white shadow-sm hover:bg-[#e05d09]"
              type="button"
            >
              <ChevronRight size={20} />
            </button>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-5">
          {trendingProductsData.length > 0 ? trendingProductsData.map((item, idx) => (
            <div
              key={idx}
              onClick={() => item.slug && navigate(`/product/${item.slug}`)}
              className="group relative flex flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white p-3.5 shadow-sm transition hover:shadow-md cursor-pointer"
            >
              <button
                className="absolute right-4 top-4 z-10 grid h-8 w-8 place-items-center rounded-full bg-white/80 text-gray-600 backdrop-blur hover:text-[#f96e15]"
                type="button"
              >
                <Heart size={16} />
              </button>
              <div className="aspect-square overflow-hidden rounded-xl bg-gray-100">
                {item.image ? (
                  <img
                    src={item.image}
                    alt={item.name}
                    className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                  />
                ) : (
                  <div className="h-full w-full grid place-items-center text-gray-300"><Package size={32} /></div>
                )}
              </div>
              <h3 className="mt-3 text-sm font-bold text-[#111111]">{item.name}</h3>
              <div className="mt-1.5 flex items-center justify-between text-sm">
                <div className="flex items-center gap-1 text-[#f9a825] font-bold text-xs">
                  <Star size={13} fill="currentColor" stroke="none" /> {item.rating}
                </div>
                <span className="font-black text-[#111111]">{item.price}</span>
              </div>
            </div>
          )) : (
            <div className="col-span-full py-8 text-center">
              <Package size={32} className="mx-auto text-gray-300 mb-2" />
              <p className="text-sm font-medium text-gray-400">No trending products configured.</p>
            </div>
          )}
        </div>
      </section>

      {/* Delivery Address Selection Side Drawer (Matching Uploaded Reference Image) */}
      {isLocationDrawerOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          {/* Dark Backdrop */}
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-xs transition-opacity"
            onClick={() => setIsLocationDrawerOpen(false)}
          />

          {/* Side Panel Container */}
          <div className="relative z-10 flex h-full w-full max-w-md flex-col bg-white p-6 shadow-2xl transition-transform animate-in slide-in-from-right duration-300">
            {/* Top Handle Pill Bar */}
            <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-gray-300" />

            {/* Header */}
            <div className="flex items-center justify-between pb-4 border-b border-gray-100">
              <h3 className="text-lg font-extrabold text-[#111111]">
                Select delivery address
              </h3>
              <button
                type="button"
                onClick={() => setIsLocationDrawerOpen(false)}
                className="grid h-8 w-8 place-items-center rounded-full text-gray-500 hover:bg-gray-100 hover:text-black transition"
              >
                <X size={20} />
              </button>
            </div>

            {/* Search Input Box */}
            <form onSubmit={handleCustomLocationApply} className="mt-5">
              <div className="relative">
                <Search size={18} className="absolute left-4 top-3.5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search by area, street name, pin code"
                  value={locationSearchInput}
                  onChange={(e) => setLocationSearchInput(e.target.value)}
                  className="w-full rounded-2xl border border-gray-300 bg-white py-3.5 pl-11 pr-20 text-sm font-medium text-[#111111] shadow-sm placeholder:text-gray-400 focus:border-[#2563eb] focus:outline-none focus:ring-2 focus:ring-[#2563eb]/20"
                />
                {locationSearchInput.trim() && (
                  <button
                    type="submit"
                    className="absolute right-2 top-2 rounded-xl bg-[#2563eb] px-3.5 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-[#1d4ed8]"
                  >
                    Apply
                  </button>
                )}
              </div>
            </form>

            {/* Action: Use My Current Location */}
            <button
              type="button"
              onClick={handleUseCurrentLocation}
              className="mt-5 flex items-center gap-2.5 text-sm font-bold text-[#2563eb] hover:text-[#1d4ed8] hover:underline"
            >
              <Crosshair size={18} className="text-[#2563eb]" />
              Use my current location
            </button>

            {/* Divider */}
            <div className="my-6 border-t border-dashed border-gray-200" />

            {/* Saved Addresses List */}
            <div className="flex-1 overflow-y-auto">
              <p className="text-xs font-extrabold uppercase tracking-wider text-gray-500">
                Saved addresses
              </p>

              <div className="mt-4 space-y-3">
                {defaultSavedAddresses.map((addr, idx) => {
                  const isSelected = selectedLocation === addr;
                  return (
                    <div
                      key={idx}
                      onClick={() => handleSelectAddress(addr)}
                      className={`group flex cursor-pointer items-start gap-3 rounded-2xl border p-4 transition-all ${
                        isSelected
                          ? "border-[#f96e15] bg-[#fff8f3] shadow-sm"
                          : "border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50"
                      }`}
                    >
                      <MapPin
                        size={18}
                        className={`mt-0.5 shrink-0 ${
                          isSelected ? "text-[#f96e15]" : "text-gray-400 group-hover:text-[#f96e15]"
                        }`}
                      />
                      <div className="flex-1">
                        <p className="text-sm font-bold text-[#111111]">{addr}</p>
                        <p className="mt-0.5 text-xs font-medium text-gray-500">Standard Delivery</p>
                      </div>
                      {isSelected && (
                        <span className="grid h-5 w-5 place-items-center rounded-full bg-[#f96e15] text-xs font-bold text-white">
                          ✓
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ProductDetails;
