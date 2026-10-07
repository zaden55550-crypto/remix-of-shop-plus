// Device preferences that are not business records: interface size and tax (VAT) setup.
import { useEffect, useState } from "react";

export const UI_SIZES = { Smaller: 0.88, Compact: 0.94, Default: 1, Larger: 1.1 } as const;
export type UiSize = keyof typeof UI_SIZES;
export type Tax = { on: boolean; rate: number };

const SIZE = "shopbook.uiSize";
const TAX = "shopbook.tax";
const EVT = "shopbook-prefs";

export const getUiSize = (): UiSize => { const v = typeof window === "undefined" ? null : localStorage.getItem(SIZE); return v && v in UI_SIZES ? (v as UiSize) : "Default"; };
export const setUiSize = (v: UiSize) => { localStorage.setItem(SIZE, v); applyUiSize(); window.dispatchEvent(new Event(EVT)); };
/** Scales the whole interface evenly so the one-row layouts keep their proportions. */
export const applyUiSize = () => { document.documentElement.style.setProperty("zoom", String(UI_SIZES[getUiSize()])); };

export const getTax = (): Tax => { try { const t = JSON.parse(localStorage.getItem(TAX) || "null"); if (t && typeof t.rate === "number") return { on: !!t.on, rate: Math.min(100, Math.max(0, t.rate)) }; } catch { /* default */ } return { on: false, rate: 16 }; };
export const setTax = (t: Tax) => { localStorage.setItem(TAX, JSON.stringify(t)); window.dispatchEvent(new Event(EVT)); };
/** VAT rate in % to apply now, or 0 when VAT is off. */
export const vatRate = () => { const t = getTax(); return t.on ? t.rate : 0; };

export function usePrefs() {
  const [p, setP] = useState<{ size: UiSize; tax: Tax }>({ size: "Default", tax: { on: false, rate: 16 } });
  useEffect(() => { const f = () => setP({ size: getUiSize(), tax: getTax() }); f(); window.addEventListener(EVT, f); window.addEventListener("storage", f); return () => { window.removeEventListener(EVT, f); window.removeEventListener("storage", f); }; }, []);
  return p;
}
