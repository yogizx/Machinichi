import {
  Award,
  BadgeCheck,
  Clock,
  Droplets,
  FlaskConical,
  Gift,
  Heart,
  Leaf,
  Package,
  Percent,
  Recycle,
  ShieldCheck,
  Sprout,
  Star,
  Sun,
  ThumbsUp,
  Tractor,
  Truck,
  Wheat,
} from "lucide-react";

// Icons the admin can pick for the home banner highlights bar.
// Keys must match TRUST_BAR_ICON_KEYS in backend/src/models/TrustBar.ts.
export const TRUST_BAR_ICONS = {
  leaf: { label: "Leaf", Icon: Leaf },
  flask: { label: "Flask", Icon: FlaskConical },
  tractor: { label: "Farmer", Icon: Tractor },
  truck: { label: "Delivery", Icon: Truck },
  "shield-check": { label: "Shield", Icon: ShieldCheck },
  sprout: { label: "Sprout", Icon: Sprout },
  wheat: { label: "Wheat", Icon: Wheat },
  award: { label: "Award", Icon: Award },
  "badge-check": { label: "Verified", Icon: BadgeCheck },
  heart: { label: "Heart", Icon: Heart },
  star: { label: "Star", Icon: Star },
  package: { label: "Package", Icon: Package },
  clock: { label: "Clock", Icon: Clock },
  "thumbs-up": { label: "Thumbs up", Icon: ThumbsUp },
  gift: { label: "Gift", Icon: Gift },
  percent: { label: "Offer", Icon: Percent },
  recycle: { label: "Eco", Icon: Recycle },
  droplets: { label: "Pure", Icon: Droplets },
  sun: { label: "Fresh", Icon: Sun },
};

export const MAX_TRUST_BAR_ITEMS = 6;
