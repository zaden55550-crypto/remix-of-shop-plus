import { useEffect, useState } from "react";
export type Branch = { name: string; location: string };
export type SettingsConfig = { taxPin: string; country: string; city: string; website: string; description: string; branches: Branch[]; businessType: string; location: string; owner: string; phone: string; hours: string; receiptFooter: string; timezone: string; dateFormat: string; timeFormat: string; numberFormat: string; searchBarcodes: boolean; paper: string; copies: number; autoPrint: boolean; autosave: boolean; offline: boolean; autoSync: boolean; autoRetry: boolean; interfaceScale: number; textScale: number; iconScale: number; spacingScale: number; lowStock: number; notifications: boolean; lowStockAlerts: boolean; aiOn: boolean; aiBusiness: boolean; aiSummaries: boolean; aiTrends: boolean; aiGuidance: boolean; aiRecommendations: boolean; aiActions: boolean; hiddenApps: string[]; liveReceipt: boolean; features: Record<string, boolean> };
const KEY = "shopbook.settings";
export const DEFAULT_SETTINGS: SettingsConfig = { taxPin: "", country: "Kenya", city: "", website: "", description: "", branches: [], businessType: "Retail", location: "", owner: "Admin", phone: "", hours: "", receiptFooter: "", timezone: "Africa/Nairobi", dateFormat: "DD/MM/YYYY", timeFormat: "24-hour", numberFormat: "1,000,000", searchBarcodes: true, paper: "80mm", copies: 1, autoPrint: false, autosave: true, offline: true, autoSync: true, autoRetry: true, interfaceScale: 2, textScale: 2, iconScale: 2, spacingScale: 2, lowStock: 5, notifications: true, lowStockAlerts: true, aiOn: true, aiBusiness: true, aiSummaries: true, aiTrends: true, aiGuidance: true, aiRecommendations: true, aiActions: false, hiddenApps: [], liveReceipt: true, features: {} };

// How this device looks and syncs is the same whichever business is open. Everything else belongs to one business.
const DEVICE_KEYS = ["interfaceScale", "textScale", "iconScale", "spacingScale", "autosave", "offline", "autoSync", "autoRetry"] as const satisfies readonly (keyof SettingsConfig)[];
const isDeviceKey = (k: string) => (DEVICE_KEYS as readonly string[]).includes(k);
/** The business open on this device (erp.ts `activeBusiness`), read directly so this file needs nothing from the engine. The first business is null. */
function openBusiness(): string | null {
  try { const id = localStorage.getItem("shopbook.activeBusiness"); return id && id !== "biz-main" ? id : null; } catch { return null; }
}
/** Where a business's own settings are kept. The first business keeps `shopbook.settings`, so nothing saved before moves. */
export const businessSettingsKey = (business: string | null) => (business ? `${KEY}@${business}` : KEY);
const parse = (key: string) => { try { const v = JSON.parse(localStorage.getItem(key) || "{}"); return v && typeof v === "object" && !Array.isArray(v) ? v as Partial<SettingsConfig> : {}; } catch { return {}; } };
const pick = (o: Partial<SettingsConfig>, device: boolean) => Object.fromEntries(Object.entries(o).filter(([k]) => isDeviceKey(k) === device)) as Partial<SettingsConfig>;

/** The open business's settings, with this device's display and sync preferences. Another business starts from the defaults, never from the first business's tax PIN, branches or hours. */
export function readSettings(): SettingsConfig {
  try {
    const business = openBusiness(), base = parse(KEY);
    return business ? { ...DEFAULT_SETTINGS, ...pick(base, true), ...pick(parse(businessSettingsKey(business)), false) } : { ...DEFAULT_SETTINGS, ...base };
  } catch { return DEFAULT_SETTINGS; }
}
export function saveSettings(patch: Partial<SettingsConfig>) {
  const business = openBusiness();
  if (business) {
    localStorage.setItem(KEY, JSON.stringify({ ...parse(KEY), ...pick(patch, true) }));
    localStorage.setItem(businessSettingsKey(business), JSON.stringify({ ...parse(businessSettingsKey(business)), ...pick(patch, false) }));
  } else localStorage.setItem(KEY, JSON.stringify({ ...readSettings(), ...patch }));
  const next = readSettings();
  document.documentElement.style.setProperty("--shop-text-scale", String(.85 + next.textScale * .075)); document.documentElement.style.setProperty("--shop-icon-scale", String(.85 + next.iconScale * .075)); document.documentElement.style.setProperty("--shop-space-scale", String(.8 + next.spacingScale * .1)); window.dispatchEvent(new Event("shopbook-settings")); window.dispatchEvent(new Event("shopbook-prefs")); return next;
}
export function applySettings() { const s = readSettings(); document.documentElement.style.setProperty("--shop-text-scale", String(.85 + s.textScale * .075)); document.documentElement.style.setProperty("--shop-icon-scale", String(.85 + s.iconScale * .075)); document.documentElement.style.setProperty("--shop-space-scale", String(.8 + s.spacingScale * .1)); }
/** Re-reads when settings are saved and when another business is opened (selectBusiness sends shopbook-settings). */
export function useSettings() { const [s, setS] = useState(DEFAULT_SETTINGS); useEffect(() => { const f = () => setS(readSettings()); f(); window.addEventListener("shopbook-settings", f); return () => window.removeEventListener("shopbook-settings", f); }, []); return [s, (p: Partial<SettingsConfig>) => setS(saveSettings(p))] as const; }
