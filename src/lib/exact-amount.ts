import { findByCurrency } from "@/lib/world-data";

/**
 * Exact amounts on demand: any element with data-exact="KSh 1,032,000" shows that text in a small
 * floating tip when a mouse hovers it, or when a finger holds it (long-press, ~450ms). Short card
 * figures (1.03M) therefore never hide the real number. A long-press never also triggers the
 * card's own tap action. Purely visual; mounted once at the root.
 */

const HOLD_MS = 450;
const MOVE_TOLERANCE = 10;
const TOUCH_LINGER_MS = 2200;

export function startExactAmounts() {
  if (typeof window === "undefined") return () => {};
  const tip = document.createElement("div");
  tip.className = "exact-tip";
  tip.setAttribute("role", "tooltip");
  document.body.append(tip);

  let hold = 0;
  let linger = 0;
  let pressX = 0;
  let pressY = 0;
  let swallowClick = false;

  const source = (t: EventTarget | null) => (t instanceof Element ? t.closest<HTMLElement>("[data-exact]") : null);

  const show = (el: HTMLElement) => {
    const text = el.dataset["exact"];
    if (!text) return;
    tip.textContent = text;
    tip.dataset["on"] = "1";
    // The page carries an html zoom: fixed coordinates are in zoomed px, so divide it out.
    const z = parseFloat(getComputedStyle(document.documentElement).zoom) || 1;
    const r = el.getBoundingClientRect();
    const w = tip.offsetWidth * z;
    const h = tip.offsetHeight * z;
    const left = Math.min(Math.max(4, r.left + r.width / 2 - w / 2), window.innerWidth - w - 4);
    const above = r.top - h - 8;
    const top = above >= 4 ? above : r.bottom + 8;
    tip.style.left = `${left / z}px`;
    tip.style.top = `${top / z}px`;
  };
  const hide = () => {
    clearTimeout(linger);
    delete tip.dataset["on"];
  };
  const cancelHold = () => {
    clearTimeout(hold);
    hold = 0;
  };

  const over = (e: PointerEvent) => {
    if (e.pointerType !== "mouse") return;
    const el = source(e.target);
    if (el) show(el);
  };
  const out = (e: PointerEvent) => {
    if (e.pointerType !== "mouse") return;
    const el = source(e.target);
    if (el && !el.contains(e.relatedTarget as Node | null)) hide();
  };
  const down = (e: PointerEvent) => {
    if (e.pointerType === "mouse") return;
    const el = source(e.target);
    if (!el) return;
    pressX = e.clientX;
    pressY = e.clientY;
    swallowClick = false;
    cancelHold();
    hold = window.setTimeout(() => {
      hold = 0;
      swallowClick = true;
      show(el);
      navigator.vibrate?.(10);
    }, HOLD_MS);
  };
  const move = (e: PointerEvent) => {
    if (hold && Math.hypot(e.clientX - pressX, e.clientY - pressY) > MOVE_TOLERANCE) cancelHold();
  };
  const up = () => {
    cancelHold();
    if (tip.dataset["on"]) {
      clearTimeout(linger);
      linger = window.setTimeout(hide, TOUCH_LINGER_MS);
    }
  };
  // A completed long-press must not also open the card it sits on.
  const click = (e: MouseEvent) => {
    if (!swallowClick) return;
    swallowClick = false;
    e.preventDefault();
    e.stopPropagation();
  };
  const menu = (e: Event) => {
    if (source(e.target)) e.preventDefault();
  };

  document.addEventListener("pointerover", over);
  document.addEventListener("pointerout", out);
  document.addEventListener("pointerdown", down);
  document.addEventListener("pointermove", move, { passive: true });
  document.addEventListener("pointerup", up);
  document.addEventListener("pointercancel", up);
  document.addEventListener("click", click, true);
  document.addEventListener("contextmenu", menu);
  window.addEventListener("scroll", hide, { capture: true, passive: true });

  return () => {
    cancelHold();
    hide();
    tip.remove();
    document.removeEventListener("pointerover", over);
    document.removeEventListener("pointerout", out);
    document.removeEventListener("pointerdown", down);
    document.removeEventListener("pointermove", move);
    document.removeEventListener("pointerup", up);
    document.removeEventListener("pointercancel", up);
    document.removeEventListener("click", click, true);
    document.removeEventListener("contextmenu", menu);
    window.removeEventListener("scroll", hide, { capture: true });
  };
}

/** Big screens have room for every digit, so card figures are written in full there (2,639,600). */
export const wholeFigures = () => typeof window !== "undefined" && window.innerWidth >= 1024;

/** The short form: every digit up to 999,999, then 1.03M / 2.5B. Chart axes always use it. */
export function shortFigure(n: number): string {
  if (typeof n !== "number" || isNaN(n) || Object.is(n, -0) || Math.abs(n) < 0.0001) return "0";
  const abs = Math.abs(n);
  const short = (d: number) => (n / d).toFixed(2).replace(/\.?0+$/, "");
  if (abs >= 1_000_000_000) return short(1_000_000_000) + "B";
  if (abs >= 1_000_000) return short(1_000_000) + "M";
  return Math.round(n).toLocaleString();
}

/** Card figures: in full on big screens, short from a million up on smaller ones, where the exact
 *  amount is one hover or long-press away (data-exact). */
export function cardFigure(n: number): string {
  return wholeFigures() && Math.abs(n) >= 1_000_000 ? Math.round(n).toLocaleString() : shortFigure(n);
}

/** Resolves any global currency code to its exact symbol */
export function toCurrencySymbol(code: string): string {
  if (!code) return "";
  const upper = code.trim().toUpperCase();

  // 1. Common regional East African notations
  if (upper === "KES" || upper === "KSH" || code === "KSh") return "KSh";
  if (upper === "UGX" || upper === "USH" || code === "USh") return "USh";
  if (upper === "TZS" || upper === "TSH" || code === "TSh") return "TSh";
  if (upper === "RWF" || code === "FRw") return "FRw";
  if (upper === "SOS" || upper === "SH.SO." || code === "Sh.So.") return "Sh.So.";

  // 2. Curated world-data lookup (150+ countries)
  const fromWorld = findByCurrency(upper);
  if (fromWorld?.currencySymbol) return fromWorld.currencySymbol;

  // 3. Global ISO currencies ($ for USD, £ for GBP, € for EUR, ¥ for JPY, ₹ for INR, etc.)
  try {
    const parts = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: upper,
      currencyDisplay: "narrowSymbol",
    }).formatToParts(1);
    const sym = parts.find((p) => p.type === "currency")?.value;
    if (sym && sym !== upper) return sym;

    const partsFallback = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: upper,
      currencyDisplay: "symbol",
    }).formatToParts(1);
    const symFallback = partsFallback.find((p) => p.type === "currency")?.value;
    if (symFallback) return symFallback;
  } catch {
    // Graceful fallback
  }

  return code;
}
