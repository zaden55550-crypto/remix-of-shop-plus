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
let switchFrame = 0;
export function applyLaptopView(pathname: string) {
  if (typeof document === "undefined") return;
  const meta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
  if (!meta) return;
  const on = laptopViewWanted(pathname);
  // The scale is given exactly (screen width / layout width), so a phone applies it at once instead of zooming in steps.
  const layout = isPhone() ? PHONE_LAPTOP_WIDTH : LAPTOP_WIDTH;
  const content = on ? `width=${layout}, initial-scale=${+(deviceWidth() / layout).toFixed(4)}, viewport-fit=cover` : DEVICE;
  document.documentElement.classList.toggle("phone-device", isPhone());
  // Moving between a page with its own phone design and a laptop-view page changes the viewport's scale: the page stays hidden
  // until the browser really uses the new width, then two more frames for the screen to refit, so it never shows big, then
  // small, then right (owner, 2026-11-27).
  if (meta.content !== content) {
    const html = document.documentElement;
    html.classList.add("vp-switching");
    meta.content = content;
    const want = on ? layout : deviceWidth(), started = performance.now();
    cancelAnimationFrame(switchFrame);
    const check = () => {
      const settled = Math.abs(window.innerWidth - want) <= 2;
      if (settled || performance.now() - started > 1500) {
        switchFrame = requestAnimationFrame(() => requestAnimationFrame(() => { window.dispatchEvent(new Event("resize")); switchFrame = requestAnimationFrame(() => requestAnimationFrame(() => html.classList.remove("vp-switching"))); }));
        return;
      }
      switchFrame = requestAnimationFrame(check);
    };
    switchFrame = requestAnimationFrame(check);
  }
  const was = document.documentElement.classList.contains("laptop-view");
  document.documentElement.classList.toggle("laptop-view", on);
  if (was !== on) window.dispatchEvent(new Event("resize"));
}
