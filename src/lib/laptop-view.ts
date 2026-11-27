// Laptop view on every screen (owner, 2026-11-23): phones and iPads show the app screens exactly as a laptop does (the one-page
// Setup, the Dashboard and every app), only smaller. The page is laid out at LAPTOP_WIDTH CSS pixels and the browser shrinks it to
// the screen, so every laptop layout rule applies unchanged; pinch-zoom still works. Log In, Create Account and the public pages
// keep their own phone design. A device can opt out with localStorage "shopbook.phoneLayout" = "1".
export const LAPTOP_WIDTH = 1280;
const DEVICE = "width=device-width, initial-scale=1, viewport-fit=cover";
const OWN_PHONE_DESIGN = ["/", "/signup", "/terms", "/privacy", "/welcome", "/plans", "/apps", "/dashboard"];
/** Phones (owner, 2026-11-26): the laptop layout of every app, laid out a little narrower so it reads closer. 1100 is the narrowest
 *  width where every laptop layout still applies. */
export const PHONE_LAPTOP_WIDTH = 900;
const isPhone = () => Math.min(window.screen.width, window.screen.height) < 600;

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
  // Selling on a phone held upright (owner, 2026-11-23): POS keeps its own large phone layout so a cashier can read and tap it.
  if (pathname.startsWith("/pos") && Math.min(window.screen.width, window.screen.height) < 600 && deviceWidth() < 600) return false;
  return deviceWidth() < 1100;
}

/** Sets the page's viewport for this route: laptop width on small screens, the device's own width otherwise. */
let switchTimer = 0;
export function applyLaptopView(pathname: string) {
  if (typeof document === "undefined") return;
  const meta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
  if (!meta) return;
  const on = laptopViewWanted(pathname);
  const content = on ? `width=${isPhone() ? PHONE_LAPTOP_WIDTH : LAPTOP_WIDTH}, viewport-fit=cover` : DEVICE;
  document.documentElement.classList.toggle("phone-device", isPhone());
  // Moving between a page with its own phone design and a laptop-view page changes the viewport's scale: the page stays hidden
  // for that moment so it never shows big and then small (owner, 2026-11-27).
  if (meta.content !== content) {
    const html = document.documentElement;
    html.classList.add("vp-switching");
    meta.content = content;
    // Shown again once the browser has applied the new scale and the screen has refitted (two frames after it settles).
    window.clearTimeout(switchTimer);
    const reveal = () => { window.clearTimeout(switchTimer); switchTimer = window.setTimeout(() => requestAnimationFrame(() => requestAnimationFrame(() => html.classList.remove("vp-switching"))), 180); };
    window.addEventListener("resize", reveal, { once: true });
    switchTimer = window.setTimeout(() => html.classList.remove("vp-switching"), 700);
  }
  const was = document.documentElement.classList.contains("laptop-view");
  document.documentElement.classList.toggle("laptop-view", on);
  if (was !== on) window.dispatchEvent(new Event("resize"));
}
