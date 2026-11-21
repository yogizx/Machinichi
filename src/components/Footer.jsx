import { Link, useLocation } from "react-router-dom";
import {
  ArrowRight,
  Headphones,
  Leaf,
  Link2,
  Mail,
  Phone,
  Send,
  ShieldCheck,
  Truck,
  Users,
} from "lucide-react";

import logoImage from "../pages/images/machinichi.png";
import windmillImage from "../pages/images/footer-windmill.png";
import foodImage from "../pages/images/footer bottom.png";

const quickLinks = [
  ["Home", "/"],
  ["About Us", "/about"],
  ["Categories", "/categories"],
  ["Bulk Orders", "/bulk"],
  ["Contact Us", "/contact"],
  ["Consultation", "/consultation"],
];

const joinVentureLinks = [
  ["Partnership", "/partnership"],
  ["Become a Vendor", "/become-a-vendor", true],
  ["Vendor Login", "/vendor/login", true],
];

const policyLinks = [
  ["Privacy Policy", "/privacy-policy"],
  ["Terms & Conditions", "/terms-conditions"],
  ["Refund Policy", "/refund-policy"],
  ["Shipping Policy", "/shipping-policy"],
  ["Cookie Policy", "/cookie-policy"],
  ["Disclaimer", "/disclaimer"],
];

const trustItems = [
  { icon: Leaf, line1: "100% Organic", line2: "& Trusted" },
  { icon: Truck, line1: "Pan India", line2: "Delivery" },
  { icon: ShieldCheck, line1: "Secure", line2: "Payments" },
  { icon: Headphones, line1: "Dedicated", line2: "Support" },
];

const socialLinks = [
  {
    label: "Facebook",
    href: "https://www.facebook.com/",
    path: "M14 8.5V6.9c0-.8.2-1.2 1.3-1.2H17V2.5h-2.5C11.7 2.5 10.3 4.2 10.3 6.7v1.8H8v3.2h2.3v8.8H14v-8.8h2.6l.4-3.2H14z",
  },
  {
    label: "Instagram",
    href: "https://www.instagram.com/",
    path: "M7.5 2.5h9a5 5 0 015 5v9a5 5 0 01-5 5h-9a5 5 0 01-5-5v-9a5 5 0 015-5zm0 2a3 3 0 00-3 3v9a3 3 0 003 3h9a3 3 0 003-3v-9a3 3 0 00-3-3h-9zM12 7.5a4.5 4.5 0 110 9 4.5 4.5 0 010-9zm0 2a2.5 2.5 0 100 5 2.5 2.5 0 000-5zm5-3.3a1.1 1.1 0 110 2.2 1.1 1.1 0 010-2.2z",
  },
  {
    label: "YouTube",
    href: "https://www.youtube.com/",
    path: "M21.6 7.2a2.5 2.5 0 00-1.8-1.8C18.2 5 12 5 12 5s-6.2 0-7.8.4A2.5 2.5 0 002.4 7.2C2 8.8 2 12 2 12s0 3.2.4 4.8a2.5 2.5 0 001.8 1.8C5.8 19 12 19 12 19s6.2 0 7.8-.4a2.5 2.5 0 001.8-1.8c.4-1.6.4-4.8.4-4.8s0-3.2-.4-4.8zM10 15V9l5.2 3L10 15z",
  },
  {
    label: "LinkedIn",
    href: "https://www.linkedin.com/",
    path: "M5.3 8.5H2.4V21h2.9V8.5zM3.9 3.5a1.7 1.7 0 100 3.4 1.7 1.7 0 000-3.4zM21.6 14.2c0-3.3-1.8-5.9-4.7-5.9-1.5 0-2.6.8-3.2 1.7V8.5h-2.8V21h2.9v-6.7c0-1.7.8-2.8 2.2-2.8 1.3 0 1.9 1 1.9 2.7V21h3v-6.8z",
  },
];

const wordmarkFont = "'Playfair Display', 'Cormorant Garamond', Georgia, 'Times New Roman', serif";

function Footer() {
  const location = useLocation();
  const currentRoute = `${location.pathname}${location.hash}`;

  return (
    <footer className="relative mt-10 w-full overflow-hidden rounded-t-[36px] border-t-[3px] border-[#f57a14] bg-gradient-to-b from-[#fff1e0] via-[#fff4e8] to-[#fde9d2] text-[#3a1a0c] shadow-[0_-14px_40px_rgba(120,60,20,0.14)]">
      {/* Soft orange glow along the top edge so the footer reads as its own section */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-[90px] bg-gradient-to-b from-[#ffd9b0]/45 to-transparent"
      />

      {/* Link columns */}
      <div className="relative z-10 mx-auto grid w-full max-w-[1500px] gap-10 px-5 pb-10 pt-16 sm:px-8 md:grid-cols-2 lg:grid-cols-3 lg:gap-x-10 lg:px-12 lg:pt-14 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.3fr)] xl:gap-x-0">
        {/* Brand */}
        <div className="lg:col-span-3 xl:col-span-1 xl:pr-8">
          <Link className="flex flex-wrap items-center gap-x-4 gap-y-3" to="/" aria-label="Machinichi home">
            <img
              alt="Machinichi logo"
              className="h-[96px] w-[96px] shrink-0 select-none rounded-[22px] bg-[#5b240e] object-contain p-2 shadow-[0_8px_20px_rgba(91,36,14,0.35)] sm:h-[108px] sm:w-[108px] sm:rounded-[24px] sm:p-2.5"
              src={logoImage}
            />
            <span className="min-w-0">
              <span
                className="block text-[44px] font-extrabold leading-none tracking-[-0.02em] text-[#4a1d0c] 2xl:text-[54px]"
                style={{ fontFamily: wordmarkFont }}
              >
                Machinichi
              </span>
              <span className="mt-3 block text-[13px] font-medium tracking-[0.2em] text-[#3a1a0c] 2xl:text-[15px] 2xl:tracking-[0.25em]">
                The Modern General Store
              </span>
            </span>
          </Link>

          <p className="mt-6 max-w-[330px] text-[16px] font-medium leading-[1.6] text-[#4a2a1a]">
            Your trusted source for pure, organic, and wholesome essentials. Nourishing lives, the natural way.
          </p>
          <span aria-hidden="true" className="mt-5 block h-[4px] w-[64px] rounded-full bg-[#f57a14]" />

          <h3 className="mt-7 text-[18px] font-extrabold text-[#2f1409]">Follow Us</h3>
          <div className="mt-3 flex items-center gap-3">
            {socialLinks.map(({ label, href, path }) => (
              <a
                aria-label={label}
                className="grid h-[52px] w-[52px] place-items-center rounded-[14px] bg-[#fde6cd] text-[#2f1409] shadow-[0_4px_10px_rgba(245,122,20,0.08)] transition duration-200 hover:-translate-y-0.5 hover:bg-[#f57a14] hover:text-white"
                href={href}
                key={label}
                rel="noreferrer"
                target="_blank"
              >
                <svg aria-hidden="true" className="h-[22px] w-[22px]" fill="currentColor" viewBox="0 0 24 24">
                  <path d={path} />
                </svg>
              </a>
            ))}
          </div>
        </div>

        <FooterColumn
          currentRoute={currentRoute}
          icon={Link2}
          links={quickLinks}
          title="Quick Links"
        />
        <FooterColumn
          currentRoute={currentRoute}
          icon={Users}
          links={joinVentureLinks}
          title="Join Venture"
        />
        <FooterColumn
          currentRoute={currentRoute}
          icon={ShieldCheck}
          links={policyLinks}
          title="Policies"
        />

        {/* Need help card */}
        <div className="md:col-span-2 lg:col-span-3 xl:col-span-1 xl:border-l xl:border-[#e8cdb2]/70 xl:pl-6 2xl:pl-8">
          <div className="rounded-[22px] border border-white/70 bg-white/70 p-5 shadow-[0_14px_36px_rgba(120,60,20,0.12)] backdrop-blur-sm sm:p-6 lg:max-w-[560px] xl:max-w-none">
            <div className="flex items-center gap-4">
              <span className="grid h-[58px] w-[58px] shrink-0 place-items-center rounded-[16px] bg-[#fde6cd] text-[#f57a14]">
                <Headphones size={30} strokeWidth={2} />
              </span>
              <div>
                <h3
                  className="text-[24px] font-extrabold leading-tight text-[#2f1409]"
                  style={{ fontFamily: wordmarkFont }}
                >
                  Need Help?
                </h3>
                <p className="text-[14px] font-medium text-[#6a4a3a]">We&apos;re here to assist you.</p>
              </div>
            </div>

            <div className="mt-5 space-y-2">
              <a
                className="flex items-center gap-3 text-[15px] font-semibold text-[#2f1409] transition hover:text-[#f57a14]"
                href="tel:+919876543210"
              >
                <span className="grid h-[38px] w-[38px] shrink-0 place-items-center rounded-[11px] bg-[#fde6cd] text-[#f57a14]">
                  <Phone size={19} strokeWidth={2.2} />
                </span>
                +91 98765 43210
              </a>
              <a
                className="flex min-w-0 items-center gap-3 text-[15px] font-semibold text-[#2f1409] transition [overflow-wrap:anywhere] hover:text-[#f57a14]"
                href="mailto:support@machinichi.com"
              >
                <span className="grid h-[38px] w-[38px] shrink-0 place-items-center rounded-[11px] bg-[#fde6cd] text-[#f57a14]">
                  <Mail size={19} strokeWidth={2.2} />
                </span>
                support@machinichi.com
              </a>
            </div>

            <Link
              className="mt-5 flex h-[54px] w-full items-center justify-center gap-3 rounded-[14px] bg-gradient-to-b from-[#ff8a2a] to-[#f06a0c] text-[17px] font-bold text-white shadow-[0_10px_24px_rgba(240,106,12,0.35)] transition duration-200 hover:scale-[1.02] hover:from-[#f97c1d] hover:to-[#e55f05] active:scale-[0.98]"
              to="/contact"
            >
              <Send size={20} strokeWidth={2} />
              Raise a Complaint
              <ArrowRight size={20} strokeWidth={2.2} />
            </Link>
          </div>
        </div>
      </div>

      {/* Farm illustration, wave and food hero */}
      <div className="relative z-0 h-[170px] w-full sm:h-[210px] lg:h-[270px]">
        <img
          alt=""
          aria-hidden="true"
          className="pointer-events-none absolute bottom-[42%] left-[3%] w-[38%] max-w-[560px] select-none opacity-90 lg:left-[5%]"
          src={windmillImage}
        />

        <svg
          aria-hidden="true"
          className="absolute inset-x-0 bottom-0 h-full w-full"
          preserveAspectRatio="none"
          viewBox="0 0 1920 270"
        >
          <defs>
            <linearGradient id="footerWaveOrange" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#ef6a0c" />
              <stop offset="0.5" stopColor="#ff9a2e" />
              <stop offset="1" stopColor="#f77d12" />
            </linearGradient>
            <linearGradient id="footerWaveBrown" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#7a2f0e" />
              <stop offset="1" stopColor="#5b240e" />
            </linearGradient>
          </defs>
          <path
            d="M0 110 C 380 175, 820 215, 1300 165 C 1560 138, 1760 100, 1920 92 L1920 270 L0 270 Z"
            fill="url(#footerWaveOrange)"
          />
          <path
            d="M0 140 C 380 200, 840 238, 1320 192 C 1580 167, 1770 128, 1920 118 L1920 270 L0 270 Z"
            fill="url(#footerWaveBrown)"
          />
        </svg>

        <img
          alt="Flour, spices, nuts and honey"
          className="pointer-events-none absolute -bottom-3 right-[1%] z-10 hidden w-[48%] max-w-[680px] select-none drop-shadow-[0_14px_20px_rgba(60,25,8,0.35)] sm:block lg:bottom-[-6px]"
          src={foodImage}
        />
      </div>

      {/* Bottom bar */}
      <div className="relative z-10 bg-[#5b240e] px-5 pb-6 sm:px-8 lg:px-12">
        <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-5 border-t border-[#d9822b]/50 pt-5 lg:flex-row lg:items-center lg:justify-between">
          <p className="text-[15px] font-medium text-[#f7e6cf] sm:text-[16px]">
            {"\u00a9"} 2026 Machinichi Groups of Companies. All Rights Reserved.
          </p>

          <ul className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4 sm:gap-0">
            {trustItems.map(({ icon: Icon, line1, line2 }, index) => (
              <li
                className={`flex items-center gap-3 sm:px-6 ${
                  index > 0 ? "sm:border-l sm:border-[#d9822b]/50" : "sm:pl-0"
                }`}
                key={line1}
              >
                <Icon aria-hidden="true" className="shrink-0 text-[#ffb55a]" size={30} strokeWidth={1.6} />
                <span className="text-[14px] font-medium leading-[1.3] text-[#f7e6cf]">
                  {line1}
                  <br />
                  {line2}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </footer>
  );
}

function isFooterLinkActive(to, currentRoute) {
  if (to.includes("#")) return currentRoute === to;
  return currentRoute.split("#")[0] === to;
}

function FooterColumn({ currentRoute, icon: Icon, title, links }) {
  return (
    <div className="xl:border-l xl:border-[#e8cdb2]/70 xl:px-6 2xl:px-8">
      <div className="flex items-center gap-3.5">
        <span className="grid h-[48px] w-[48px] shrink-0 place-items-center rounded-[14px] bg-[#fde6cd] text-[#f57a14]">
          <Icon size={24} strokeWidth={2} />
        </span>
        <h3
          className="whitespace-nowrap text-[22px] font-extrabold leading-none text-[#2f1409] xl:text-[20px] 2xl:text-[24px]"
          style={{ fontFamily: wordmarkFont }}
        >
          {title}
        </h3>
      </div>

      <div className="mt-6 space-y-1.5">
        {links.map(([label, to, newTab]) => (
          <FooterLink currentRoute={currentRoute} key={label} label={label} newTab={newTab} to={to} />
        ))}
      </div>
    </div>
  );
}

function FooterLink({ currentRoute, label, newTab = false, to }) {
  const isActive = isFooterLinkActive(to, currentRoute);

  return (
    <Link
      aria-current={isActive ? "page" : undefined}
      {...(newTab ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      className={`block w-fit whitespace-nowrap rounded-[12px] px-4 py-2 text-[16px] transition duration-200 xl:px-3 xl:text-[15px] 2xl:px-4 2xl:text-[17px] ${
        isActive
          ? "bg-[#fde6cd] font-bold text-[#f57a14]"
          : "font-medium text-[#2f1409] hover:translate-x-0.5 hover:text-[#f57a14]"
      }`}
      to={to}
    >
      {label}
    </Link>
  );
}

export default Footer;
