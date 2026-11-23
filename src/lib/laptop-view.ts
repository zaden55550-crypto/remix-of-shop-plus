// Laptop view on every screen (owner, 2026-11-23): phones and iPads show the app screens exactly as a laptop does (the one-page
// Setup, the Dashboard and every app), only smaller. The page is laid out at LAPTOP_WIDTH CSS pixels and the browser shrinks it to
// the screen, so every laptop layout rule applies unchanged; pinch-zoom still works. Log In, Create Account and the public pages
// keep their own phone design. A device can opt out with localStorage "shopbook.phoneLayout" = "1".
export const LAPTOP_WIDTH = 1280;
const DEVICE = "width=device-width, initial-scale=1, viewport-fit=cover";
const OWN_PHONE_DESIGN = ["/", "/signup", "/terms", "/privacy"];

/** Pages that keep their own phone layout instead of the shrunk laptop one. */
export function keepsPhoneDesign(pathname: string) {
  return OWN_PHONE_DESIGN.includes(pathname) || pathname.startsWith("/auth") || pathname.startsWith("/shop/") || pathname.startsWith("/invite");
}

/** The screen's width in CSS pixels for its current orientation, whatever the page's viewport is set to. */
function deviceWidth() {
  const a = window.screen.width, b = window.screen.height;
  const landscape = window.matchMedia?.("(orientation: landscape)").matches ?? a > b;
  return landscape ? Math.max(a, b) : Math.min(a, b);
}

export function laptopViewWanted(pathname: string) {
  if (typeof window === "undefined" || keepsPhoneDesign(pathname)) return false;
  try { if (localStorage.getItem("shopbook.phoneLayout") === "1") return false; } catch { /* default: laptop view */ }
  return deviceWidth() < 1100;
}

/** Sets the page's viewport for this route: laptop width on small screens, the device's own width otherwise. */
export function applyLaptopView(pathname: string) {
  if (typeof document === "undefined") return;
  const meta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
  if (!meta) return;
  const on = laptopViewWanted(pathname);
  const content = on ? `width=${LAPTOP_WIDTH}, viewport-fit=cover` : DEVICE;
  if (meta.content !== content) meta.content = content;
  const was = document.documentElement.classList.contains("laptop-view");
  document.documentElement.classList.toggle("laptop-view", on);
  if (was !== on) window.dispatchEvent(new Event("resize"));
}
