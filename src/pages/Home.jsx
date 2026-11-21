import { useState } from "react";
import {
  ArrowRight,
  Check,
  Heart,
  ShoppingCart,
} from "lucide-react";
import { useNavigate } from "react-router-dom";

import ProductImage from "../components/product/ProductImage";
import HomePopup from "../components/HomePopup";
import HeroBanner from "../components/home/HeroBanner";
import CategoryShowcase from "../components/home/CategoryShowcase";
import TrendingProducts from "../components/home/TrendingProducts";
import WellnessSection from "../components/home/WellnessSection";
import bowlImage from "./images/bowl.png";

const image = (id, params = "auto=format&fit=crop&w=900&q=90") =>
  `https://images.unsplash.com/${id}?${params}`;

function Home({ favoriteProducts = new Set(), onAddToCart = () => { }, onFavoriteToggle = () => { } }) {
  return (
    <div className="min-h-screen bg-[#FAF6F0] font-sans text-[#2C1810] antialiased">
      <HomePopup />
      {/* Full-bleed banner: touches the header and both screen edges */}
      <HeroBanner />
      <div className="px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        <main className="space-y-12 sm:space-y-14">
          <CategoryShowcase />
          <Bundles />
          <TrendingProducts favoriteProducts={favoriteProducts} onAddToCart={onAddToCart} onFavoriteToggle={onFavoriteToggle} />
          <Subscription />
          <WellnessSection />
        </main>
      </div>
    </div>
  );
}

function Bundles() {
  const navigate = useNavigate();
  return (
    <section>
      <SectionHeader title="Featured Products" action="VIEW ALL" onAction={() => navigate("/product")} />
      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <BundleCard
          title="Morning Essentials"
          subtitle="100% Natural - Rich in Nutrients Norcients"
          description="Start your day right with wholesome staples."
          price="₹1,249"
          oldPrice="₹1,500"
          img={image("photo-1620916566398-39f1143ab7be", "auto=format&fit=crop&w=320&q=95")}
          badge="BEST SELLER"
        />
        <BundleCard
          title="Daily Nutrition Bundle"
          subtitle="Wholesome blend for your everyday health"
          description="A perfect mix of nutrition for your everyday meals."
          price="₹499"
          oldPrice="₹749"
          img={image("photo-1585238342024-78d387f4a707", "auto=format&fit=crop&w=320&q=95")}
          badge="NEW ARRIVAL"
        />
      </div>
    </section>
  );
}

function BundleCard({ title, subtitle, description, price, oldPrice, img, badge }) {
  return (
    <article className="relative flex flex-col sm:flex-row items-center justify-between gap-5 rounded-[22px] border border-[#E8DCCF] bg-[#F5EFE8] p-6 sm:p-7 shadow-[0_4px_20px_rgba(44,24,16,0.05)] transition duration-300 hover:shadow-[0_10px_28px_rgba(44,24,16,0.1)] group">
      <span className="absolute top-5 left-6 rounded-full bg-[#5C2D12] px-3 py-1 text-[9px] sm:text-[10px] font-black uppercase tracking-wider text-white shadow-sm">
        {badge}
      </span>
      <button
        aria-label="Add to wishlist"
        className="absolute top-5 right-6 flex h-8 w-8 items-center justify-center rounded-full bg-white/90 shadow-sm border border-white/80 text-[#7A6B63] hover:text-[#EA6D17] transition cursor-pointer"
        type="button"
      >
        <Heart size={15} strokeWidth={2.2} />
      </button>

      <div className="pt-6 sm:pt-4 min-w-0 flex-1">
        <h3 className="font-sans text-[22px] sm:text-[24px] font-extrabold text-[#2C1810] leading-tight">
          {title}
        </h3>
        <p className="mt-1.5 text-[13px] sm:text-[14px] font-semibold text-[#6D625C] max-w-[300px]">
          {subtitle || description}
        </p>
        <div className="mt-4 flex items-baseline gap-2.5">
          <strong className="text-[24px] sm:text-[28px] font-extrabold text-[#2C1810] tracking-tight">{price}</strong>
          {oldPrice ? <span className="text-[15px] sm:text-[16px] font-semibold text-[#A69B93] line-through">{oldPrice}</span> : null}
        </div>
        <button className="mt-4 flex items-center justify-center gap-2 rounded-[10px] bg-[#EA6D17] hover:bg-[#d55b0e] px-6 py-2.5 text-[12px] sm:text-[13px] font-black uppercase tracking-wider text-white shadow-[0_4px_14px_rgba(234,109,23,0.3)] transition cursor-pointer">
          <ShoppingCart size={15} strokeWidth={2.5} />
          ADD TO CART
        </button>
      </div>
      <div className="h-[140px] w-[140px] sm:h-[170px] sm:w-[170px] shrink-0 overflow-hidden rounded-[18px] bg-white p-2.5 shadow-inner flex items-center justify-center">
        <ProductImage src={img} alt={title} width={320} className="h-full w-full object-cover rounded-[14px] group-hover:scale-105 transition duration-500" />
      </div>
    </article>
  );
}

function Subscription() {
  const [selectedPlan, setSelectedPlan] = useState("Monthly");
  const features = ["100% Natural", "No Preservatives", "Rich in Nutrients"];
  const planOptions = ["Monthly", "Quarterly", "Halfyearly", "Annually"];

  return (
    <section className="relative overflow-hidden rounded-[26px] bg-[#2D1306] bg-gradient-to-r from-[#280E04] via-[#331407] to-[#200A03] p-7 sm:p-10 lg:p-12 text-white shadow-[0_20px_50px_rgba(40,16,5,0.22)]">
      <div className="flex flex-col lg:flex-row items-center justify-between gap-8 lg:gap-12">
        
        {/* Left Group: Larger Flour Bowl Image + Text Info */}
        <div className="flex flex-col sm:flex-row items-center gap-7 sm:gap-10 flex-1 max-w-[780px]">
          {/* Wooden Flour Bowl Image - Noticeably Larger */}
          <div className="shrink-0 w-[230px] h-[230px] sm:w-[270px] sm:h-[270px] lg:w-[310px] lg:h-[310px] flex items-center justify-center relative">
            <img
              src={bowlImage}
              alt="Flour bowl with golden wheat"
              className="w-full h-full object-contain drop-shadow-[0_16px_32px_rgba(0,0,0,0.65)] hover:scale-105 transition duration-500"
            />
          </div>

          {/* Text Content */}
          <div>
            <h2 className="font-sans text-[30px] sm:text-[40px] lg:text-[44px] font-extrabold leading-[1.08] text-white tracking-tight">
              Artisanal flour,
              <br />
              delivered by habit.
            </h2>
            <p className="mt-3.5 text-[14px] sm:text-[15px] font-medium leading-relaxed text-white/85 max-w-[460px]">
              Stone-ground to retain nutrients, aroma, and flavour. Wholesome, natural, and perfect for your daily meals.
            </p>
            
            <div className="mt-5 flex flex-wrap items-center gap-4 sm:gap-6">
              {features.map((feature) => (
                <div className="flex items-center gap-2" key={feature}>
                  <span className="flex h-4.5 w-4.5 items-center justify-center rounded-full bg-[#EA6D17] text-white shadow-sm shrink-0">
                    <Check size={11} strokeWidth={3.5} />
                  </span>
                  <span className="text-[12px] sm:text-[13px] font-extrabold tracking-wider uppercase text-white/95">{feature}</span>
                </div>
              ))}
            </div>

            <button className="mt-7 flex items-center gap-2.5 rounded-[10px] bg-[#EA6D17] hover:bg-[#d55b0e] px-8 py-3.5 text-[13px] sm:text-[14px] font-black uppercase tracking-wider text-white shadow-[0_8px_22px_rgba(234,109,23,0.4)] transition hover:scale-105 cursor-pointer">
              SUBSCRIBE & SAVE
              <ArrowRight size={17} strokeWidth={2.5} />
            </button>
          </div>
        </div>

        {/* Right Side: Subscription Selector Card */}
        <div className="w-full lg:w-[400px] shrink-0 rounded-[22px] border border-white/12 bg-[#1A0A03]/60 backdrop-blur-md p-6 sm:p-7 shadow-xl relative overflow-hidden">
          <div className="border-b border-white/10 pb-4">
            <p className="text-[11px] font-black uppercase tracking-widest text-[#EA6D17]">SUBSCRIPTION</p>
            <h3 className="mt-1 font-sans text-[24px] sm:text-[26px] font-extrabold text-white tracking-tight">Create Plan&apos;s As</h3>
            <p className="mt-1 text-[13px] text-white/70 font-medium">
              Choose how often you want your essentials delivered.
            </p>
          </div>
          
          <div className="mt-5 grid grid-cols-2 gap-3.5">
            {planOptions.map((plan) => {
              const isSelected = selectedPlan === plan;
              return (
                <button
                  aria-pressed={isSelected}
                  className={`flex items-center justify-between rounded-[12px] p-4 text-left transition duration-200 cursor-pointer ${
                    isSelected
                      ? "bg-[#EA6D17] border border-[#EA6D17] text-white shadow-lg shadow-orange-950/30"
                      : "bg-white/5 border border-white/12 text-white/80 hover:bg-white/10"
                  }`}
                  key={plan}
                  onClick={() => setSelectedPlan(plan)}
                  type="button"
                >
                  <span className="text-[14px] sm:text-[15px] font-extrabold">{plan}</span>
                  <span
                    className={`flex h-5 w-5 items-center justify-center rounded-full transition ${
                      isSelected ? "bg-white text-[#EA6D17]" : "border border-white/30 text-transparent"
                    }`}
                  >
                    <Check size={12} strokeWidth={3.5} />
                  </span>
                </button>
              );
            })}
          </div>

          {/* Green Leaves Accent at bottom right */}
          <div className="absolute -bottom-3 -right-3 w-16 h-16 pointer-events-none opacity-85 flex items-center justify-center text-emerald-500 text-3xl">
            🌿
          </div>
        </div>

      </div>
    </section>
  );
}

function SectionHeader({ title, subtitle, action, onAction }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-[#E8DCCF] pb-3.5">
      <div>
        <div className="flex items-center gap-2">
          <span className="text-xl">🥜</span>
          <h2 className="font-sans text-[24px] sm:text-[28px] font-extrabold text-[#2C1810] tracking-tight">{title}</h2>
        </div>
        {subtitle ? <p className="mt-1 text-[14px] sm:text-[15px] font-medium text-[#6B5E56]">{subtitle}</p> : null}
      </div>
      {action ? (
        <button
          className="flex items-center gap-1 text-[12px] sm:text-[13px] font-black tracking-wider text-[#7C543A] hover:text-[#EA6D17] transition uppercase cursor-pointer shrink-0"
          onClick={onAction}
          type="button"
        >
          {action}
          <ArrowRight size={15} strokeWidth={2.5} />
        </button>
      ) : null}
    </div>
  );
}

export default Home;
