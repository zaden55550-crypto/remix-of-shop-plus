// Trade features: every Trade business has every feature. The business types only decide which ones start switched on;
// the owner can switch any of them on or off (Business Setup, Settings › Features). Nothing here locks an app or a record.
//
// Only features that really change something are listed:
// - expiry:   batch and expiry fields on purchase lines, the Expiry list in Inventory and expiring-soon alerts.
// - counters: several tills per shop (Location.counters), a counter choice in POS, cash-up per counter.
// - vat:      the device's VAT setting (prefs.ts getTax/setTax), shown here so it can be switched on at setup.
// - barcodes: the existing "search barcodes" setting.
// - weight:   a kg keypad at the till for weighed products (kg or money), and the price per kg on tiles, cart and receipts.
// - priceLevels: a product's wholesale price from a set quantity (6 and above…), and wholesale customers; applied at the till.
// Expiry and counters are saved per business in its settings (`features`, settings-config.ts); a feature never saved
// follows the business types. Records made while a feature was on stay as they are when it is switched off.
import { readSettings, saveSettings } from "@/lib/settings-config";
import { getTax, setTax } from "@/lib/prefs";

export const FEATURE_IDS = ["expiry", "counters", "vat", "barcodes", "weight", "priceLevels", "serials", "gas", "layby", "quotations", "breakdown", "prescriptions"] as const;
export type FeatureId = (typeof FEATURE_IDS)[number];
export type Features = Record<FeatureId, boolean>;

export const FEATURE_INFO: Record<FeatureId, { name: string; hint: string }> = {
  expiry: { name: "Expiry dates & batches", hint: "Enter batch and expiry when buying; the earliest expiry is sold first and you are warned before stock expires" },
  counters: { name: "Counters (tills)", hint: "Several tills in one shop, each with its own cash drawer and cash-up" },
  vat: { name: "VAT on sales", hint: "Add VAT to sales on this device" },
  barcodes: { name: "Barcode scanning", hint: "Find products by barcode when selling and searching" },
  weight: { name: "Selling by weight", hint: "A kg keypad at the till with quick ¼, ½ and 1 kg buttons, and the price per kg on receipts" },
  priceLevels: { name: "Wholesale & retail prices", hint: "A cheaper price from a set quantity, or for wholesale customers, chosen automatically at the till" },
  serials: { name: "Serial / IMEI numbers & warranty", hint: "Record each item's serial or IMEI when selling; it shows on the receipt with the warranty end date and can be searched later" },
  gas: { name: "Gas cylinder exchange", hint: "Refills and new cylinders with deposit, empty cylinders counted in stock, by size and brand" },
  layby: { name: "Deposits & lay-by", hint: "The customer pays part now and collects when the rest is paid; the goods are kept aside" },
  quotations: { name: "Quotations", hint: "Send a priced quotation and turn it into a sale or invoice when the customer agrees" },
  breakdown: { name: "Bale, carcass & sack breakdown", hint: "Buy a bale, carcass or sack, record the pieces or kilos you got and the waste, and see the true cost of each" },
  prescriptions: { name: "Prescriptions & controlled drugs", hint: "Keep the prescription with the sale and a register of controlled drugs" },
};

/** Types whose goods expire: expiry dates start switched on. */
const EXPIRY_TYPES = new Set(["Pharmacy", "Supermarket", "Grocery Store", "Agrovet", "Butchery", "Mini-mart / Kiosk", "Cereals & Grains Shop", "Cosmetics & Beauty Shop", "Wines & Spirits", "General Merchandise Store"]);
/** Busy types with several tills: counters start switched on. */
const COUNTER_TYPES = new Set(["Supermarket", "Wholesale Business", "General Merchandise Store"]);
/** Types that weigh what they sell (meat, grains, feeds, loose groceries): selling by weight starts switched on. */
const WEIGHT_TYPES = new Set(["Butchery", "Cereals & Grains Shop", "Agrovet", "Grocery Store", "Supermarket", "Mini-mart / Kiosk"]);
/** Types that sell both retail and wholesale: wholesale prices start switched on. */
/** Types that sell serial-numbered goods: serial / IMEI tracking starts switched on. */
/** Types that refill gas cylinders: gas cylinder exchange starts switched on. */
const GAS_TYPES = new Set(["Gas / LPG Dealer"]);
/** Starting switches for the last four features, by the types that usually need them. */
const LAYBY_TYPES = new Set(["Furniture Shop", "Electronics Shop", "Jewellery Shop", "Mobile Phones & Accessories"]);
const QUOTE_TYPES = new Set(["Hardware Shop", "Building Materials Shop", "Furniture Shop", "Wholesale Business", "Automotive Parts Shop", "Electronics Shop"]);
const BREAKDOWN_TYPES = new Set(["Butchery", "Mitumba (Second-hand Clothes)", "Cereals & Grains Shop"]);
const RX_TYPES = new Set(["Pharmacy"]);
const SERIAL_TYPES = new Set(["Mobile Phones & Accessories", "Electronics Shop", "Jewellery Shop"]);
const PRICE_LEVEL_TYPES = new Set(["Wholesale Business", "Hardware Shop", "Building Materials Shop", "Cereals & Grains Shop", "Agrovet", "Supermarket", "General Merchandise Store"]);

/** The starting choice for a business of these types (any one type is enough to switch a feature on). */
export function defaultFeatures(types: readonly string[]): Features {
  return {
    expiry: true,
    counters: types.some((t) => COUNTER_TYPES.has(t)),
    vat: false,
    barcodes: true,
    weight: true,
    priceLevels: types.some((t) => PRICE_LEVEL_TYPES.has(t)),
    serials: types.some((t) => SERIAL_TYPES.has(t)),
    gas: types.some((t) => GAS_TYPES.has(t)),
    layby: true,
    quotations: types.some((t) => QUOTE_TYPES.has(t)),
    breakdown: types.some((t) => BREAKDOWN_TYPES.has(t)),
    prescriptions: types.some((t) => RX_TYPES.has(t)),
  };
}

/** What a business is using now: its saved choices, then the starting choice for its types. VAT and barcodes are the existing settings. */
/** Built into every business (owner's decision, 2026-11-22): always on, never shown as a switch. VAT is always available; whether a
 *  business charges it is its tax setting (Settings › Tax & Compliance), not a feature. */
export const BUILT_IN: readonly FeatureId[] = ["weight", "vat", "expiry", "layby", "barcodes"];
/** The only switches shown on Business Setup's line; every other switch is under "All features". */
export const PINNED: readonly FeatureId[] = ["counters", "prescriptions"];
export const isBuiltIn = (id: string) => (BUILT_IN as readonly string[]).includes(id);

export function currentFeatures(types: readonly string[]): Features {
  const s = readSettings(), base = defaultFeatures(types), saved = s.features ?? {};
  return {
    counters: typeof saved["counters"] === "boolean" ? saved["counters"] : base.counters,
    priceLevels: typeof saved["priceLevels"] === "boolean" ? saved["priceLevels"] : base.priceLevels,
    serials: typeof saved["serials"] === "boolean" ? saved["serials"] : base.serials,
    gas: typeof saved["gas"] === "boolean" ? saved["gas"] : base.gas,
    quotations: typeof saved["quotations"] === "boolean" ? saved["quotations"] : base.quotations,
    breakdown: typeof saved["breakdown"] === "boolean" ? saved["breakdown"] : base.breakdown,
    prescriptions: typeof saved["prescriptions"] === "boolean" ? saved["prescriptions"] : base.prescriptions,
    vat: getTax().on,
    barcodes: true,
    // Built in for everyone: an older saved "off" no longer hides them.
    weight: true, expiry: true, layby: true,
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

/* ===== The full feature list (owner's plan, 2026-11-22) =====
   Every feature is built in for every Trade business; the owner switches on what they use and the rest stays out of the way.
   A business type only suggests features (and, for the built ones, decides which start switched on, defaultFeatures above).
   Features not built yet are listed as "Coming soon" so owners see what is planned; they can't be switched on until they exist,
   and each is added to FEATURE_IDS (with its own saved switch) when it is built. */
/** Every planned feature is built (2026-11-22); a new idea goes here first and shows as Coming soon until it is. */
export type PlannedFeatureId = never;
export type AnyFeatureId = FeatureId | PlannedFeatureId;
export type FeatureGroupId = "selling" | "stock" | "compliance";
export type FeatureEntry = { id: AnyFeatureId; name: string; hint: string; built: boolean; suggestedFor: readonly string[] | "all" };

const SUGGEST: Record<AnyFeatureId, readonly string[] | "all"> = {
  barcodes: "all",
  counters: [...COUNTER_TYPES],
  weight: [...WEIGHT_TYPES],
  priceLevels: [...PRICE_LEVEL_TYPES],
  layby: [...LAYBY_TYPES],
  quotations: [...QUOTE_TYPES],
  expiry: [...EXPIRY_TYPES],
  serials: [...SERIAL_TYPES],
  gas: [...GAS_TYPES],
  breakdown: [...BREAKDOWN_TYPES],
  vat: [],
  prescriptions: [...RX_TYPES],
};
const PLANNED_INFO: Record<PlannedFeatureId, { name: string; hint: string }> = {};
export const FEATURE_GROUPS: readonly { id: FeatureGroupId; name: string; features: readonly AnyFeatureId[] }[] = [
  { id: "selling", name: "Selling", features: ["barcodes", "counters", "weight", "priceLevels", "layby", "quotations"] },
  { id: "stock", name: "Stock", features: ["expiry", "serials", "gas", "breakdown"] },
  { id: "compliance", name: "Tax & compliance", features: ["vat", "prescriptions"] },
];
const isBuilt = (id: AnyFeatureId): id is FeatureId => (FEATURE_IDS as readonly string[]).includes(id);
/** One feature's card details. */
export function featureEntry(id: AnyFeatureId): FeatureEntry {
  const info = isBuilt(id) ? FEATURE_INFO[id] : PLANNED_INFO[id];
  return { id, name: info.name, hint: info.hint, built: isBuilt(id), suggestedFor: SUGGEST[id] };
}
/** Whether a feature is suggested for a business of these types (any one type is enough). */
export function isSuggested(id: AnyFeatureId, types: readonly string[]): boolean {
  const s = SUGGEST[id];
  return s === "all" || types.some((t) => s.includes(t));
}

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
