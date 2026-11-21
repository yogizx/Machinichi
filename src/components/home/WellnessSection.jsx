import { ArrowRight, Leaf } from "lucide-react";
import { useNavigate } from "react-router-dom";
import ProductImage from "../product/ProductImage";

const image = (id, params = "auto=format&fit=crop&w=720&q=95") =>
  `https://images.unsplash.com/${id}?${params}`;

const wellness = [
  {
    title: "Cleanse\nCare",
    description: "Gentle support for a healthier, lighter you.",
    img: image("photo-1587854692152-cbe660dbde88"),
    link: "/product?search=cleanse",
    tone: "from-[#ffe9da] to-[#ffd9bf]",
  },
  {
    title: "Heart\nHealth",
    description: "Wholesome choices for a healthier heart.",
    img: image("photo-1606914501449-5a96b6ce24ca"),
    link: "/product?search=heart+health",
    tone: "from-[#eaf5e3] to-[#d9edcd]",
  },
  {
    title: "Everyday\nCare",
    description: "Essentials for your daily well-being.",
    img: image("photo-1576091160550-2173dba999ef"),
    link: "/product?search=everyday",
    tone: "from-[#fdeed9] to-[#f9e0bd]",
  },
];

// Fades the photo into the pastel card instead of a hard edge.
const FADE_MASK = "linear-gradient(to right, transparent 0%, #000 45%)";

function WellnessSection() {
  const navigate = useNavigate();

  return (
    <section className="pt-2">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="flex min-w-0 items-start gap-3">
          <span aria-hidden="true" className="mt-0.5 h-8 w-1.5 shrink-0 rounded-full bg-[#fd761a]" />
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 font-display text-[28px] font-black leading-none tracking-[-0.01em] text-[#321304] sm:text-[32px]">
              Curated Wellness Solutions
              <Leaf aria-hidden="true" className="text-[#fd761a]" size={22} strokeWidth={1.8} />
            </h2>
            <p className="mt-2 text-[14px] font-medium text-[#796d66] sm:text-[15px]">
              Thoughtfully chosen products to support a healthier, more balanced lifestyle.
            </p>
          </div>
        </div>
        <button
          className="flex shrink-0 cursor-pointer items-center gap-1.5 text-[14px] font-bold text-[#fd761a] transition hover:text-[#e86710] sm:text-[15px]"
          onClick={() => navigate("/product")}
          type="button"
        >
          View All Solutions
          <ArrowRight size={17} strokeWidth={2.4} />
        </button>
      </div>

      <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {wellness.map((item, index) => (
          <WellnessCard key={item.title} {...item} primary={index === 0} onExplore={() => navigate(item.link)} />
        ))}
      </div>
    </section>
  );
}

function WellnessCard({ title, description, img, tone, primary, onExplore }) {
  return (
    <article
      className={`group relative flex min-h-[220px] overflow-hidden rounded-[20px] border border-white/60 bg-gradient-to-br ${tone} shadow-[0_8px_18px_rgba(65,38,20,0.08)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_16px_34px_rgba(66,36,18,0.12)]`}
    >
      <div className="relative z-10 flex w-[58%] flex-col justify-between gap-4 p-5 sm:p-6">
        <div>
          <h3 className="whitespace-pre-line font-display text-[26px] font-black leading-[1.05] text-[#321304] sm:text-[30px]">
            {title}
          </h3>
          <p className="mt-2 max-w-[180px] text-[13.5px] font-medium leading-snug text-[#4a3e38] sm:text-[14px]">
            {description}
          </p>
        </div>
        <button
          className={`inline-flex h-10 w-fit cursor-pointer items-center gap-2 rounded-full px-5 text-[13px] font-bold transition-all duration-200 ease-out hover:scale-[1.03] active:scale-[0.98] ${
            primary
              ? "bg-[#fd761a] text-white shadow-[0_8px_22px_rgba(234,109,23,0.35)] hover:bg-[#e86710]"
              : "border border-[#321304]/70 bg-white/50 text-[#321304] hover:bg-white"
          }`}
          onClick={onExplore}
          type="button"
        >
          {primary ? "Explore Collection" : "Shop Now"}
          <ArrowRight size={15} strokeWidth={2.5} />
        </button>
      </div>

      <div
        className="absolute inset-y-0 right-0 w-[55%]"
        style={{ WebkitMaskImage: FADE_MASK, maskImage: FADE_MASK }}
      >
        <ProductImage
          src={img}
          alt={title.replace("\n", " ")}
          width={720}
          className="h-full w-full [&_img]:transition [&_img]:duration-700 [&_img]:ease-out group-hover:[&_img]:scale-105"
          aspectRatio="auto"
        />
      </div>
    </article>
  );
}

export default WellnessSection;
