import axios from "axios";

/**
 * Vendor panel request routing.
 *
 * The vendor dashboard re-uses the existing admin pages (Inventory, Product Listing, Return Request,
 * Offers & Coupons). Those pages call the admin endpoints (/admin/..., /returns/..., /coupons, /upload).
 * While the browser is on a /vendor/* page this shim re-targets those calls to the matching /vendor/*
 * endpoints, which only ever return / change the signed-in vendor's own data.
 *
 * It is installed on axios' default adapter, so it also covers pages that build their own axios
 * instance (ReturnRequest.jsx does). Nothing changes outside /vendor/* pages.
 */
const ROUTED = /^\/(admin|returns|coupons|upload)(?=\/|\?|$)/;

export function toVendorUrl(url) {
  if (typeof url !== "string" || !ROUTED.test(url)) return url;
  return url.startsWith("/admin/") ? `/vendor${url.slice("/admin".length)}` : `/vendor${url}`;
}

const onVendorPage = () =>
  typeof window !== "undefined" && window.location.pathname.startsWith("/vendor/");

if (typeof axios.getAdapter === "function" && !axios.defaults.__vendorRouting) {
  const baseAdapter = axios.getAdapter(axios.defaults.adapter);
  axios.defaults.adapter = (config) => {
    if (onVendorPage() && typeof config.url === "string" && config.url.startsWith("/")) {
      config.url = toVendorUrl(config.url);
    }
    return baseAdapter(config);
  };
  axios.defaults.__vendorRouting = true;
}
