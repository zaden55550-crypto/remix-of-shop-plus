// Device preferences that are not business records: interface size and tax (VAT) setup.
import { useEffect, useState } from "react";

/** Whole-interface scale: 50% (left) to 200% (right), in 5% steps. */
export const UI_MIN = 0.5, UI_MAX = 2, UI_STEP = 0.05;
const LEGACY: Record<string, number> = { Smaller: 0.88, Compact: 0.94, Default: 1, Larger: 1.1 };
export type Tax = { on: boolean; rate: number };

const SIZE = "shopbook.uiSize";
const TAX = "shopbook.tax";
const EVT = "shopbook-prefs";

export const clampUi = (v: number) => Math.min(UI_MAX, Math.max(UI_MIN, Math.round(v * 100) / 100));
export const getUiSize = (): number => { const v = typeof window === "undefined" ? null : localStorage.getItem(SIZE); if (!v) return 1; if (v in LEGACY) return LEGACY[v]!; const n = Number(v); return Number.isFinite(n) && n > 0 ? clampUi(n) : 1; };
export const setUiSize = (v: number) => { localStorage.setItem(SIZE, String(clampUi(v))); applyUiSize(); window.dispatchEvent(new Event(EVT)); };
/** Scales the whole interface evenly so the one-row layouts keep their proportions. */
export const applyUiSize = () => { document.documentElement.style.setProperty("zoom", String(getUiSize())); };

export const getTax = (): Tax => { try { const t = JSON.parse(localStorage.getItem(TAX) || "null"); if (t && typeof t.rate === "number") return { on: !!t.on, rate: Math.min(100, Math.max(0, t.rate)) }; } catch { /* default */ } return { on: false, rate: 16 }; };
export const setTax = (t: Tax) => { localStorage.setItem(TAX, JSON.stringify(t)); window.dispatchEvent(new Event(EVT)); };
/** VAT rate in % to apply now, or 0 when VAT is off. */
export const vatRate = () => { const t = getTax(); return t.on ? t.rate : 0; };

export function usePrefs() {
  const [p, setP] = useState<{ size: number; tax: Tax }>({ size: 1, tax: { on: false, rate: 16 } });
  useEffect(() => { const f = () => setP({ size: getUiSize(), tax: getTax() }); f(); window.addEventListener(EVT, f); window.addEventListener("storage", f); return () => { window.removeEventListener(EVT, f); window.removeEventListener("storage", f); }; }, []);
  return p;
}
