import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { X } from "lucide-react";
import api from "../services/api";

const SEEN_KEY = "machinichi_home_popup_seen";

/**
 * Home page popup configured in /admin/banner-images.
 * - Shows the uploaded image in a centered overlay.
 * - Clicking / tapping the image redirects to the admin-provided URL.
 * - Shown once per browser session (re-appears when the admin changes the popup).
 */
export default function HomePopup() {
  const navigate = useNavigate();
  const [popup, setPopup] = useState(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.get("/banners/popup/active");
        const p = data?.data;
        if (cancelled || !p?.imageUrl) return;
        const version = `${p._id}:${p.updatedAt}`;
        let seen = null;
        try {
          seen = sessionStorage.getItem(SEEN_KEY);
        } catch {
          /* storage unavailable */
        }
        if (seen === version) return;
        setPopup(p);
        setOpen(true);
      } catch {
        /* no popup / backend unreachable -> render nothing */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const close = useCallback(() => {
    if (popup) {
      try {
        sessionStorage.setItem(SEEN_KEY, `${popup._id}:${popup.updatedAt}`);
      } catch {
        /* ignore */
      }
    }
    setOpen(false);
  }, [popup]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") close();
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, close]);

  if (!open || !popup) return null;

  const url = (popup.linkUrl || "").trim();
  const hasLink = Boolean(url);

  const handleImageClick = () => {
    if (!hasLink) return;
    const lower = url.toLowerCase();
    if (lower.startsWith("javascript:") || lower.startsWith("data:")) return; // never follow unsafe schemes
    close();
    if (lower.startsWith("http://") || lower.startsWith("https://")) {
      window.open(url, "_blank", "noopener,noreferrer");
    } else {
      navigate(url);
    }
  };

  return (
    <div
      aria-label="Promotional popup"
      aria-modal="true"
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={close}
      role="dialog"
      style={{ animation: "fadeIn 0.25s ease-out both" }}
    >
      <div
        className="relative max-h-[88vh] max-w-[min(92vw,520px)]"
        onClick={(e) => e.stopPropagation()}
        style={{ animation: "scaleIn 0.3s ease-out both" }}
      >
        <button
          aria-label="Close popup"
          className="absolute -right-3 -top-3 z-10 grid h-9 w-9 cursor-pointer place-items-center rounded-full bg-white text-[#2C1810] shadow-lg transition hover:scale-110 hover:text-[#EA6D17] active:scale-95"
          onClick={close}
          type="button"
        >
          <X size={18} strokeWidth={2.6} />
        </button>

        <button
          aria-label={hasLink ? "Open offer" : "Popup image"}
          className={`block overflow-hidden rounded-[20px] bg-white p-0 shadow-[0_24px_60px_rgba(0,0,0,0.45)] ${
            hasLink ? "cursor-pointer" : "cursor-default"
          }`}
          disabled={!hasLink}
          onClick={handleImageClick}
          type="button"
        >
          <img
            alt="Special offer"
            className="block max-h-[88vh] w-auto max-w-full object-contain"
            src={popup.imageUrl}
          />
        </button>
      </div>
    </div>
  );
}
