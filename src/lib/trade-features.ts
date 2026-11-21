// Trade features: every Trade business has every feature. The business types only decide which ones start switched on;
// the owner can switch any of them on or off (Business Setup, Settings › Features). Nothing here locks an app or a record.
//
// Only features that really change something are listed:
// - expiry:   batch and expiry fields on purchase lines, the Expiry list in Inventory and expiring-soon alerts.
// - counters: several tills per shop (Location.counters), a counter choice in POS, cash-up per counter.
// - vat:      the device's VAT setting (prefs.ts getTax/setTax), shown here so it can be switched on at setup.
// - barcodes: the existing "search barcodes" setting.
// Expiry and counters are saved per business in its settings (`features`, settings-config.ts); a feature never saved
// follows the business types. Records made while a feature was on stay as they are when it is switched off.
import { readSettings, saveSettings } from "@/lib/settings-config";
import { getTax, setTax } from "@/lib/prefs";

export const FEATURE_IDS = ["expiry", "counters", "vat", "barcodes"] as const;
export type FeatureId = (typeof FEATURE_IDS)[number];
export type Features = Record<FeatureId, boolean>;

export const FEATURE_INFO: Record<FeatureId, { name: string; hint: string }> = {
  expiry: { name: "Expiry dates & batches", hint: "Enter batch and expiry when buying; the earliest expiry is sold first and you are warned before stock expires" },
  counters: { name: "Counters (tills)", hint: "Several tills in one shop, each with its own cash drawer and cash-up" },
  vat: { name: "VAT on sales", hint: "Add VAT to sales on this device" },
  barcodes: { name: "Barcode scanning", hint: "Find products by barcode when selling and searching" },
};

/** Types whose goods expire: expiry dates start switched on. */
const EXPIRY_TYPES = new Set(["Pharmacy", "Supermarket", "Grocery Store", "Agrovet", "Butchery", "Mini-mart / Kiosk", "Cereals & Grains Shop", "Cosmetics & Beauty Shop", "Wines & Spirits", "General Merchandise Store"]);
/** Busy types with several tills: counters start switched on. */
const COUNTER_TYPES = new Set(["Supermarket", "Wholesale Business", "General Merchandise Store"]);

/** The starting choice for a business of these types (any one type is enough to switch a feature on). */
export function defaultFeatures(types: readonly string[]): Features {
  return {
    expiry: types.some((t) => EXPIRY_TYPES.has(t)),
    counters: types.some((t) => COUNTER_TYPES.has(t)),
    vat: false,
    barcodes: true,
  };
}

/** What a business is using now: its saved choices, then the starting choice for its types. VAT and barcodes are the existing settings. */
export function currentFeatures(types: readonly string[]): Features {
  const s = readSettings(), base = defaultFeatures(types), saved = s.features ?? {};
  return {
    expiry: typeof saved["expiry"] === "boolean" ? saved["expiry"] : base.expiry,
    counters: typeof saved["counters"] === "boolean" ? saved["counters"] : base.counters,
    vat: getTax().on,
    barcodes: s.searchBarcodes,
  };
}

/** Saves the open business's choices. Only the features passed change. */
export function saveFeatures(patch: Partial<Features>) {
  const s = readSettings();
  const { vat, barcodes, ...own } = patch;
  if (vat !== undefined) setTax({ ...getTax(), on: vat });
  saveSettings({ ...(barcodes !== undefined ? { searchBarcodes: barcodes } : {}), ...(Object.keys(own).length ? { features: { ...(s.features ?? {}), ...own } } : {}) });
}

/** One feature of the open business. `types` are the open business's types (businessTypesOf(forOpenBusiness(account))). */
export const featureOn = (id: FeatureId, types: readonly string[]) => currentFeatures(types)[id];

/** What a selling location is called for a business of these types: always the main type's own name (a Supermarket's shops are
 *  "Supermarket", a Shoe Shop's "Shoe Shop", Wines & Spirits' "Wines & Spirits"). Display only: the saved type stays "shop".
 *  No type, or General Trade, keeps "Shop". */
export function sellingPlaceName(types: readonly string[]): string {
  return placeName(types[0]);
}
/** One type's place name: its full name, a few long ones shortened; General Trade or nothing is "Shop". */
const SHORT_PLACE: Record<string, string> = { "Wholesale Business": "Wholesale", "Mitumba (Second-hand Clothes)": "Mitumba", "Mini-mart / Kiosk": "Mini-mart", "General Trade": "Shop" };
export function placeName(type: string | undefined): string {
  const t = type?.trim() ?? "";
  return t ? SHORT_PLACE[t] ?? t : "Shop";
}
