// Device preferences that are not business records: interface size, text size and tax (VAT) setup.
import { useEffect, useState } from "react";
import { fitOnePage } from "@/lib/one-page";

/** Whole-interface scale: 50% (left) to 200% (right), in 5% steps. */
export const UI_MIN = 0.5, UI_MAX = 2, UI_STEP = 0.05;
const PHONE_MAX = 600;
const LEGACY: Record<string, number> = { Smaller: 0.88, Compact: 0.94, Default: 1, Larger: 1.1 };
export type Tax = { on: boolean; rate: number };

const SIZE = "shopbook.uiSize";
const TEXT = "shopbook.textSize";
const TAX = "shopbook.tax";
const EVT = "shopbook-prefs";

export const clampUi = (v: number) => Math.min(UI_MAX, Math.max(UI_MIN, Math.round(v * 100) / 100));
export const getUiSize = (): number => { const v = typeof window === "undefined" ? null : localStorage.getItem(SIZE); if (!v) return 1; if (v in LEGACY) return LEGACY[v]!; const n = Number(v); return Number.isFinite(n) && n > 0 ? clampUi(n) : 1; };
export const setUiSize = (v: number) => { localStorage.setItem(SIZE, String(clampUi(v))); applyUiSize(); window.dispatchEvent(new Event(EVT)); };
/** Text size for older eyes: Normal, Large (recommended default) or Extra Large. It multiplies the same
 *  uniform zoom as Interface Size, so text, icons and controls grow together on every screen. Phones grow
 *  a little less so the compact one-row layouts still fit. */
export type TextSize = "normal" | "large" | "extra-large";
export const TEXT_SIZES: readonly TextSize[] = ["normal", "large", "extra-large"];
const TEXT_FACTOR: Record<TextSize, { phone: number; wide: number }> = { normal: { phone: 1, wide: 1 }, large: { phone: 1.06, wide: 1.08 }, "extra-large": { phone: 1.12, wide: 1.18 } };
export const getTextSize = (): TextSize => { const v = typeof window === "undefined" ? null : localStorage.getItem(TEXT); return TEXT_SIZES.find((t) => t === v) ?? "large"; };
export const setTextSize = (t: TextSize) => { localStorage.setItem(TEXT, t); applyUiSize(); window.dispatchEvent(new Event(EVT)); };
/** Whole-interface zoom = Interface Size ? Text Size. */
const totalZoom = () => {
  // Laptop view on a phone or iPad (laptop-view.ts): the browser already shrinks the laptop-width page to the screen.
  if (typeof document !== "undefined" && document.documentElement.classList.contains("laptop-view")) return 1;
  const f = TEXT_FACTOR[getTextSize()], z = getUiSize() * (window.innerWidth <= PHONE_MAX ? f.phone : f.wide);
  // Log In and Create Account (from 768px wide) never draw smaller than the default size: a small Interface Size chosen inside the
  // app would otherwise shrink the account card and its text (at 60% the card was ~585px wide with ~10px text). Larger sizes still
  // apply there, phones keep their own layout, and every other screen keeps the chosen size exactly.
  return onAccountPage() && window.innerWidth >= ACCOUNT_MIN_WIDTH ? Math.max(z, ACCOUNT_MIN_ZOOM) : z;
};
/** The default whole-interface zoom on wide screens (Interface Size 100%, Text Size Large). */
const ACCOUNT_MIN_ZOOM = TEXT_FACTOR.large.wide, ACCOUNT_MIN_WIDTH = 768;
/** True while the Log In or Create Account page is on screen (its rendered page, not the URL, so other screens are never affected). */
// Log In, Create Account and Business Setup never shrink below the default size, whatever the Interface Size.
const onAccountPage = () => typeof document !== "undefined" && !!document.querySelector(".auth-split-page, .bsetup-page");
/** Smooth width-based scale for app screens. Phones (≤600px): 360px≈0.94, 430px=1, 600px≈1.06.
 *  Tablets and laptops grow more so text is easy to read: 768px=1.15, 1024px=1.25, 1280px=1.32, 1920px+=1.48. No steps. */
export const fluidScale = (w: number): number => { const pts: [number, number][] = [[360, 0.94], [430, 1], [PHONE_MAX, 1.0604], [768, 1.15], [1024, 1.25], [1280, 1.32], [1920, 1.48]]; if (w <= pts[0]![0]) return pts[0]![1]; for (let i = 1; i < pts.length; i++) { const [a, fa] = pts[i - 1]!, [b, fb] = pts[i]!; if (w <= b) return +(fa + ((w - a) / (b - a)) * (fb - fa)).toFixed(4); } return pts[pts.length - 1]![1]; };
/** ShopBot docks on the right and the ERP workspace keeps the rest: phones/iPads 40%, laptops 35%, desktops 30%. */
let shopbotDocked = false;
export const shopbotDockShare = (w: number) => (w < 1024 ? 0.4 : w < 1440 ? 0.35 : 0.3);
export const setShopbotDocked = (on: boolean) => { shopbotDocked = on; window.dispatchEvent(new Event("resize")); };
const applyDock = () => { const html = document.documentElement; html.classList.toggle("shopbot-docked", shopbotDocked); html.style.setProperty("--shopbot-dock", `${shopbotDockShare(window.innerWidth) * 100}%`); };
/** A phone turned sideways is wide but short: keep it at phone size instead of tablet size.
 *  While ShopBot is docked, app screens scale to the workspace width, not the whole screen. */
const scaleWidth = () => { const w = window.innerWidth * (shopbotDocked ? 1 - shopbotDockShare(window.innerWidth) : 1) / totalZoom(); const sidewaysPhone = window.innerHeight < 500 && window.matchMedia("(pointer: coarse)").matches; return sidewaysPhone ? Math.min(w, PHONE_MAX) : w; };
/** --fluid-scale zooms ERP app screens; --wide-scale (1 on phones) zooms Dashboard, which was never phone-scaled. */
/** Beside the docked ShopBot the workspace can be narrower than any phone: keep shrinking smoothly below
 *  360px, but never under 0.8 so text stays readable; Dashboard then shrinks with the other apps too. */
const dockedScale = (w: number) => (w >= 360 ? fluidScale(w) : +Math.max(0.8, 0.94 - ((360 - w) / 120) * 0.14).toFixed(4));
/** --shop-scale: the size every app and the shared header draw at, equal to the Dashboard's usual size; grows only on very wide monitors. */
const SHOP_SCALE = 1.03, SHOP_SCALE_WIDTH = 1860;
export const applyFluidScale = () => { if (typeof window === "undefined") return; const w = scaleWidth(), f = shopbotDocked ? dockedScale(w) : fluidScale(w), wide = +(f / fluidScale(PHONE_MAX)).toFixed(4); document.documentElement.style.setProperty("--fluid-scale", String(f)); document.documentElement.style.setProperty("--wide-scale", String(shopbotDocked ? wide : Math.max(1, wide))); document.documentElement.style.setProperty("--shop-scale", String(+Math.min(Math.max(1, wide), Math.max(SHOP_SCALE, w / SHOP_SCALE_WIDTH)).toFixed(4))); };
/** Applies Interface Size ? Text Size; also runs on resize because phones and wider screens use different text steps. */
export const applyUiSize = () => { if (typeof window === "undefined") return; document.documentElement.setAttribute("data-scale-ready", ""); applyDock(); applyFluidScale(); const z = String(+totalZoom().toFixed(4)); document.documentElement.style.setProperty("zoom", z); document.documentElement.style.setProperty("--ui-zoom", z); document.documentElement.dataset["textSize"] = getTextSize();
  // Log In, Create Account, Plans and Setup fit the screen in this same step, before the page is drawn: fitting a moment later made
  // the page show big and then jump smaller (owner, 2026-11-25).
  if (document.querySelector(".auth-split-page, .plans-page, .bsetup-page")) fitOnePage(true); };

export const getTax = (): Tax => { try { const t = JSON.parse(localStorage.getItem(TAX) || "null"); if (t && typeof t.rate === "number") return { on: !!t.on, rate: Math.min(100, Math.max(0, t.rate)) }; } catch { /* default */ } return { on: false, rate: 16 }; };
export const setTax = (t: Tax) => { localStorage.setItem(TAX, JSON.stringify(t)); window.dispatchEvent(new Event(EVT)); };
/** VAT rate in % to apply now, or 0 when VAT is off. */
export const vatRate = () => { const t = getTax(); return t.on ? t.rate : 0; };

export function usePrefs() {
  const [p, setP] = useState<{ size: number; textSize: TextSize; tax: Tax }>({ size: 1, textSize: "large", tax: { on: false, rate: 16 } });
  useEffect(() => { const f = () => setP({ size: getUiSize(), textSize: getTextSize(), tax: getTax() }); f(); window.addEventListener(EVT, f); window.addEventListener("storage", f); return () => { window.removeEventListener(EVT, f); window.removeEventListener("storage", f); }; }, []);
  return p;
}
