import { useEffect, useState } from "react";
import {
  BadgePercent,
  BarChart3,
  Boxes,
  Building2,
  ChevronDown,
  ClipboardList,
  Image,
  KeyRound,
  LayoutDashboard,
  Lock,
  LogOut,
  PackageCheck,
  PlusCircle,
  RotateCcw,
  ScrollText,
  Shield,
  Tags,
  UserPlus,
  UserRound,
  Users,
  UsersRound,
} from "lucide-react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import logo from "../images/machinichi.png";
import { usePermissions } from "../../contexts/PermissionContext";

// Which permission each admin path needs is defined once, in src/config/adminAccess.js.
const menuItems = [
  { label: "Dashboard", icon: LayoutDashboard, to: "/admin/dashboard" },
  { label: "Profile", icon: UserRound, to: "/admin/profile" },
  { label: "Customer", icon: UsersRound, to: "/admin/customers" },
  { label: "Categories", icon: Tags, to: "/admin/categories" },
  { label: "Inventory", icon: Boxes, to: "/admin/inventory" },
  { label: "Product Listing", icon: PackageCheck, to: "/admin/product-listing" },
  { label: "Orders", icon: ClipboardList, to: "/admin/orders" },
  { label: "Businesses", icon: Building2, to: "/admin/businesses" },
  { label: "Analytics", icon: BarChart3, to: "/admin/analytics" },
  { label: "Banner Images", icon: Image, to: "/admin/banner-images" },
  { label: "Return Request", icon: RotateCcw, to: "/admin/return-request" },
  { label: "Offers & Coupons", icon: BadgePercent, to: "/admin/offers-coupons" },
  { label: "Create Offers", icon: PlusCircle, to: "/admin/create-offers" },
];

const staffItems = [
  { label: "Sub-Admins", icon: Users, to: "/admin/sub-admins" },
  { label: "Roles & Permissions", icon: Shield, to: "/admin/roles" },
  { label: "Create Sub-Admin", icon: UserPlus, to: "/admin/sub-admins/create" },
  { label: "Access Control", icon: KeyRound, to: "/admin/access-control" },
  { label: "Activity Logs", icon: ScrollText, to: "/admin/activity-logs" },
];

// Vendor panel: only the pages a vendor is allowed to use.
const vendorMenuItems = [
  { label: "Dashboard", icon: LayoutDashboard, to: "/vendor/dashboard" },
  { label: "Inventory", icon: Boxes, to: "/vendor/inventory" },
  { label: "Product Listing", icon: PackageCheck, to: "/vendor/product-listing" },
  { label: "Return Request", icon: RotateCcw, to: "/vendor/return-request" },
  { label: "Offers & Coupons", icon: BadgePercent, to: "/vendor/offers-coupons" },
  { label: "Create Offers", icon: PlusCircle, to: "/vendor/create-offers" },
];

const activeCls = "bg-[#3a1100] text-white shadow-[0_12px_22px_rgba(58,17,0,0.18)]";
const idleCls = "text-[#44352d] hover:-translate-y-0.5 hover:bg-[#f4e9df] hover:text-[#2d1205]";

function IconBox({ Icon, active }) {
  return (
    <span
      className={`grid h-8 w-8 shrink-0 place-items-center rounded-[7px] transition duration-300 ${
        active ? "bg-white/14 text-white" : "bg-white/65 text-[#8f4513] group-hover:bg-white group-hover:text-[#3a1100]"
      }`}
    >
      <Icon size={18} strokeWidth={2.2} />
    </span>
  );
}

function AdminSidebar({ onAdminLogout }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const isVendor = pathname.startsWith("/vendor");
  const { canAccessPath, loading } = usePermissions();
  const [restricted, setRestricted] = useState("");
  const [staffOpen, setStaffOpen] = useState(() => staffItems.some((i) => pathname.startsWith(i.to)));

  useEffect(() => {
    if (staffItems.some((i) => pathname.startsWith(i.to))) setStaffOpen(true);
  }, [pathname]);

  useEffect(() => {
    if (!restricted) return undefined;
    const t = setTimeout(() => setRestricted(""), 4500);
    return () => clearTimeout(t);
  }, [restricted]);

  const handleLogout = () => {
    onAdminLogout?.();
    navigate(isVendor ? "/vendor/login" : "/admin/login");
  };

  // One menu entry. Locked entries are disabled: they cannot be opened and load no data.
  const renderItem = ({ label, icon: Icon, to }, nested = false) => {
    const allowed = isVendor || canAccessPath(to);

    if (loading && !isVendor) {
      return (
        <div key={label} aria-busy="true" className={`flex h-12 shrink-0 items-center gap-3 rounded-[8px] px-4 text-[14px] font-black text-[#44352d] opacity-50 md:w-full ${nested ? "md:ml-4" : ""}`}>
          <IconBox Icon={Icon} active={false} />
          <span className="whitespace-nowrap">{label}</span>
        </div>
      );
    }

    if (!allowed) {
      return (
        <button
          key={label}
          type="button"
          aria-disabled="true"
          title="You do not have permission to open this module"
          onClick={() => setRestricted(`You don't have permission to open ${label}. Contact your administrator to request access.`)}
          className={`group flex h-12 shrink-0 cursor-not-allowed items-center gap-3 rounded-[8px] px-4 text-left text-[14px] font-black tracking-[-0.01em] text-[#a89a90] md:w-full ${nested ? "md:ml-4 md:!w-[calc(100%-1rem)]" : ""}`}
        >
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[7px] bg-[#f3ece6] text-[#bfb1a7]">
            <Icon size={18} strokeWidth={2.2} />
          </span>
          <span className="flex-1 whitespace-nowrap">{label}</span>
          <Lock size={14} className="shrink-0 text-[#b9aaa0]" aria-label="Locked" />
        </button>
      );
    }

    return (
      <NavLink
        key={label}
        to={to}
        end={to === "/admin/sub-admins"}
        className={({ isActive }) =>
          `group flex h-12 shrink-0 items-center gap-3 rounded-[8px] px-4 text-[14px] font-black tracking-[-0.01em] transition duration-300 md:w-full ${nested ? "md:ml-4 md:!w-[calc(100%-1rem)]" : ""} ${isActive ? activeCls : idleCls}`
        }
      >
        {({ isActive }) => (
          <>
            <IconBox Icon={Icon} active={isActive} />
            <span className="whitespace-nowrap">{label}</span>
          </>
        )}
      </NavLink>
    );
  };

  const staffAnyAllowed = !loading && staffItems.some((i) => canAccessPath(i.to));

  return (
    <aside className="sticky top-0 z-20 flex w-full flex-col border-b border-[#ead9cc] bg-[#fffaf5] text-[#2d1a10] shadow-[0_10px_28px_rgba(64,35,17,0.08)] md:h-screen md:w-[280px] md:min-w-[280px] md:border-b-0 md:border-r">
      <div className="border-b border-[#ead9cc] px-5 py-5 md:px-6">
        <NavLink
          aria-label={isVendor ? "Machinichi vendor dashboard" : "Machinichi admin dashboard"}
          className="flex items-center gap-4 rounded-[10px] p-2 transition duration-300 hover:bg-[#f5ebe2]"
          to={isVendor ? "/vendor/dashboard" : "/admin/dashboard"}
        >
          <span className="grid h-[86px] w-[86px] shrink-0 place-items-center overflow-hidden rounded-[14px] border border-[#1f130d] bg-black shadow-[0_16px_28px_rgba(0,0,0,0.18)]">
            <img alt="Machinichi logo" className="h-[76px] w-[76px] object-contain" src={logo} />
          </span>

          <span className="min-w-0">
            <span className="block text-[24px] font-black leading-none tracking-[-0.035em] text-[#2a1409]">Machinichi</span>
            <span className="mt-1 block text-[12px] font-black uppercase tracking-[0.12em] text-[#a04a0c]">
              {isVendor ? "Vendor Panel" : "Admin Panel"}
            </span>
          </span>
        </NavLink>
      </div>

      <nav
        aria-label={isVendor ? "Vendor navigation" : "Admin navigation"}
        className="flex gap-2 overflow-x-auto px-4 py-4 md:min-h-0 md:flex-1 md:flex-col md:overflow-y-auto md:px-5 md:py-6"
      >
        {isVendor ? (
          vendorMenuItems.map((item) => renderItem(item))
        ) : (
          <>
            {menuItems.map((item) => renderItem(item))}

            <button
              type="button"
              onClick={() => setStaffOpen((o) => !o)}
              aria-expanded={staffOpen}
              className={`group flex h-12 shrink-0 items-center gap-3 rounded-[8px] px-4 text-left text-[14px] font-black tracking-[-0.01em] transition duration-300 md:w-full ${staffAnyAllowed || loading ? idleCls : "text-[#a89a90]"}`}
            >
              <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-[7px] ${staffAnyAllowed || loading ? "bg-white/65 text-[#8f4513]" : "bg-[#f3ece6] text-[#bfb1a7]"}`}>
                <Users size={18} strokeWidth={2.2} />
              </span>
              <span className="flex-1 whitespace-nowrap">Staff &amp; Access</span>
              {!staffAnyAllowed && !loading ? <Lock size={14} className="text-[#b9aaa0]" aria-label="Locked" /> : null}
              <ChevronDown size={16} className={`shrink-0 transition ${staffOpen ? "rotate-180" : ""}`} />
            </button>
            {staffOpen && staffItems.map((item) => renderItem(item, true))}
          </>
        )}
      </nav>

      {restricted && (
        <div role="alert" className="mx-4 mb-3 rounded-[10px] border border-[#f1d3b8] bg-[#fff4e8] px-3 py-2.5 text-[12px] font-bold leading-5 text-[#7a3a0a] md:mx-5">
          {restricted}
        </div>
      )}

      <div className="border-t border-[#ead9cc] px-4 py-4 md:px-5">
        <button
          className="group flex h-12 w-full items-center justify-center gap-3 rounded-[8px] border border-[#ead9cc] bg-white/72 px-4 text-[14px] font-black text-[#7f2814] shadow-[0_10px_20px_rgba(65,35,17,0.06)] transition duration-300 hover:-translate-y-0.5 hover:border-[#f0b6a5] hover:bg-[#fff2ee] hover:text-[#a52f17] active:translate-y-0 active:scale-[0.98]"
          onClick={handleLogout}
          type="button"
        >
          <span className="grid h-8 w-8 place-items-center rounded-[7px] bg-[#fff1ed] text-[#a52f17] transition group-hover:bg-[#a52f17] group-hover:text-white">
            <LogOut size={17} strokeWidth={2.3} />
          </span>
          Logout
        </button>
      </div>
    </aside>
  );
}

export default AdminSidebar;
