// Whole-device backups exclude passwords, sessions and entitlement data.
import { assertCanRecord, commit, empty, load, type ErpState } from "@/lib/erp";
import { createOperation, getOutbox, persistErp } from "@/lib/outbox";
const KEY = "shopbook.erp";
const LAST = "shopbook.lastBackup";
export const BACKUP_KEYS = ["shopbook.purchaseDrafts", "shopbook.purchaseReturnDrafts", "shopbook.savedReports", "shopbook.uiSize", "shopbook.tax", "shopbook.theme", "shopbook.language", "shopbook.settings", "shopbook.importHistory", "shopbook.reconcile"] as const;
const ACTIVE_BUSINESS = "shopbook.activeBusiness", ACTIVE_SHOP = "shopbook.activeShop";
const BUSINESS_ID = /^[a-z0-9]{6,40}$/;
/** Every business-specific settings key on this device (settings-config.ts `businessSettingsKey`), whatever business it belongs to. */
const businessSettingKeys = () => Object.keys(localStorage).filter((k) => k.startsWith("shopbook.settings@"));
/** Version 3 adds each other business's settings, the business that was open, and the first business's country and industry.
 *  The records of every business are always in `data` (the whole ERP: businesses, their locations, payment settings and records). */
export function snapshot(shop: string) {
  const a = JSON.parse(localStorage.getItem("shopbook.account") || "null");
  const data = load();
  const businessSettings: Record<string, string> = Object.fromEntries(data.businesses.flatMap((b) => { const v = localStorage.getItem(`shopbook.settings@${b.id}`); return v === null ? [] : [[b.id, v]]; }));
  return {
    app: "SHOPBOOK", version: 3, shop, at: Date.now(), data, settings: Object.fromEntries(BACKUP_KEYS.map((k) => [k, localStorage.getItem(k)])),
    business: a ? { shopName: a.shopName, currency: a.currency, logo: a.logo, country: a.country, businessTypes: a.businessTypes, industryFamilyId: a.industryFamilyId } as { shopName: string; currency: string; logo?: string; country?: string | null; businessTypes?: string[] | null; industryFamilyId?: string | null } : null,
    businessSettings: businessSettings as Record<string, string> | undefined, activeBusiness: localStorage.getItem(ACTIVE_BUSINESS) as string | null | undefined,
  };
}
export function backupJson(shop: string) { return JSON.stringify(snapshot(shop)); }
export const lastBackup = () => Number(localStorage.getItem(LAST) || 0);
const object = (x: unknown): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x);
export function validateBackup(value: unknown): asserts value is ReturnType<typeof snapshot> {
  if (!object(value) || value["app"] !== "SHOPBOOK" || !object(value["data"])) throw new Error("This is not a Zakrio Systems backup file");
  const d = value["data"];
  for (const key of Object.keys(empty())) {
    const rows = d[key];
    if (key === "seq") { if (rows !== undefined && (!object(rows) || Object.values(rows).some((n) => typeof n !== "number" || !Number.isInteger(n) || n < 0))) throw new Error("Backup file is damaged"); continue; }
    if (rows === undefined && key !== "products") continue;
    if (!Array.isArray(rows) || rows.some((x) => !object(x) || typeof x["id"] !== "string")) throw new Error("Backup file is damaged");
    const ids = rows.map((x) => x["id"]); if (new Set(ids).size !== ids.length) throw new Error("Backup file has duplicate records");
  }
  const check = (x: unknown) => { if (typeof x === "number" && !Number.isFinite(x)) throw new Error("Backup file is damaged"); if (Array.isArray(x)) x.forEach(check); else if (object(x)) Object.values(x).forEach(check); };
  check(d);
  const required: Record<string, string[]> = { products: ["qty", "buy", "sell"], customers: ["balance"], suppliers: ["balance"], sales: ["total", "subtotal", "discount"], purchases: ["total"], expenses: ["amount"], payments: ["amount"], cash: ["amount"], payrolls: ["net", "paid", "salary", "commission", "deductions"], payrollPayments: ["amount"], commissions: ["amount"], movements: ["qty", "prev", "next"], employees: ["salary"] };
  for (const [key, fields] of Object.entries(required)) for (const x of (d[key] ?? []) as Record<string, unknown>[]) if (fields.some((f) => typeof x[f] !== "number")) throw new Error("Backup file is damaged");
  for (const key of ["sales", "purchases"]) for (const x of (d[key] ?? []) as Record<string, unknown>[]) {
    if (!Array.isArray(x["items"]) || !object(x["pay"]) || ["cash", "mpesa", "bank", "credit"].some((m) => typeof (x["pay"] as Record<string, unknown>)[m] !== "number") || Object.values(x["pay"]).some((v) => typeof v !== "number")) throw new Error("Backup file is damaged");
    if (x["items"].some((i) => !object(i) || typeof i["productId"] !== "string" || typeof i["qty"] !== "number" || typeof i["returned"] !== "number")) throw new Error("Backup file is damaged");
  }
  for (const x of (d["employees"] ?? []) as Record<string, unknown>[]) if (!object(x["rule"]) || typeof x["rule"]["value"] !== "number") throw new Error("Backup file is damaged");
  if (value["settings"] !== undefined && (!object(value["settings"]) || Object.entries(value["settings"]).some(([k, v]) => !BACKUP_KEYS.some((x) => x === k) || (v !== null && typeof v !== "string")))) throw new Error("Backup settings are damaged");
  const optionalText = (o: Record<string, unknown>, k: string) => o[k] === undefined || o[k] === null || typeof o[k] === "string";
  const business = value["business"];
  if (object(business) && (!optionalText(business, "country") || !optionalText(business, "industryFamilyId") || (business["businessTypes"] !== undefined && business["businessTypes"] !== null && (!Array.isArray(business["businessTypes"]) || business["businessTypes"].some((x) => typeof x !== "string"))))) throw new Error("Backup file is damaged");
  // Version 3: each other business's settings (an object, by business id) and the business that was open. Older files have neither.
  const settingsByBusiness = value["businessSettings"];
  if (settingsByBusiness !== undefined && (!object(settingsByBusiness) || Object.entries(settingsByBusiness).some(([id, raw]) => { if (!BUSINESS_ID.test(id) || typeof raw !== "string") return true; try { return !object(JSON.parse(raw)); } catch { return true; } }))) throw new Error("Backup settings are damaged");
  if (value["activeBusiness"] !== undefined && value["activeBusiness"] !== null && typeof value["activeBusiness"] !== "string") throw new Error("Backup file is damaged");
  if (business !== undefined && business !== null && (!object(business) || typeof business["shopName"] !== "string" || typeof business["currency"] !== "string" || (business["logo"] !== undefined && typeof business["logo"] !== "string"))) throw new Error("Backup business details are damaged");
  if (object(value["settings"])) for (const [key, raw] of Object.entries(value["settings"])) {
    if (raw === null) continue;
    if (typeof raw !== "string") throw new Error("Backup settings are damaged");
    if (["shopbook.purchaseDrafts", "shopbook.purchaseReturnDrafts", "shopbook.savedReports", "shopbook.tax", "shopbook.settings", "shopbook.importHistory"].includes(key)) {
      let parsed: unknown; try { parsed = JSON.parse(raw); } catch { throw new Error("Backup settings are damaged"); }
      if (key === "shopbook.tax" ? !object(parsed) || typeof parsed["rate"] !== "number" || typeof parsed["on"] !== "boolean" : key === "shopbook.settings" ? !object(parsed) : !Array.isArray(parsed)) throw new Error("Backup settings are damaged");
    }
  }
}
export function restoreJson(text: string) {
  // Restoring replaces records, so after the trial it waits for a plan like any other change.
  assertCanRecord();
  let f: unknown; try { f = JSON.parse(text); } catch { throw new Error("This is not a Zakrio Systems backup file"); }
  validateBackup(f);
  const keys: string[] = [KEY, "shopbook.account", ...BACKUP_KEYS, ACTIVE_BUSINESS, ACTIVE_SHOP, ...new Set([...businessSettingKeys(), ...Object.keys(f.businessSettings ?? {}).map((id) => `shopbook.settings@${id}`)])];
  const previous = keys.map((k) => [k, localStorage.getItem(k)] as const);
  try {
    const restored = { ...empty(), ...f.data }, before = load(), existing = getOutbox();
    const bootstrap = !existing.length && !localStorage.getItem("shopbook.syncInitialized") ? createOperation(empty(), before, true) : null;
    const operation = createOperation(before, restored);
    persistErp(restored, [...existing, ...(bootstrap ? [bootstrap] : []), ...(operation ? [operation] : [])]);
    if (f.settings) for (const key of BACKUP_KEYS) { const v = f.settings[key]; if (v === null) localStorage.removeItem(key); else if (typeof v === "string") localStorage.setItem(key, v); }
    const account = JSON.parse(localStorage.getItem("shopbook.account") || "null");
    if (account && f.business) {
      // Version 3 also carries the first business's country and industry; an older file leaves the account's own.
      const b = f.business, extra = Object.fromEntries((["country", "businessTypes", "industryFamilyId"] as const).filter((k) => b[k] !== undefined && b[k] !== null).map((k) => [k, b[k]]));
      localStorage.setItem("shopbook.account", JSON.stringify({ ...account, shopName: b.shopName, currency: b.currency, logo: b.logo, ...extra }));
    }
    // Each other business's settings come back with it; a version 3 file replaces them all, an older file leaves them as they are.
    if (f.businessSettings) {
      for (const key of businessSettingKeys()) localStorage.removeItem(key);
      for (const [id, raw] of Object.entries(f.businessSettings)) localStorage.setItem(`shopbook.settings@${id}`, raw);
    }
    // The open business comes back only if it is in the restored records; otherwise the first business opens. A chosen shop may not exist any more.
    const open = f.activeBusiness !== undefined ? f.activeBusiness : localStorage.getItem(ACTIVE_BUSINESS);
    if (open && restored.businesses.some((x) => x.id === open && x.active !== false)) localStorage.setItem(ACTIVE_BUSINESS, open); else localStorage.removeItem(ACTIVE_BUSINESS);
    localStorage.removeItem(ACTIVE_SHOP);
    commit((_s, c) => c.audit("BACKUP RESTORED", new Date().toISOString()));
    window.dispatchEvent(new Event("shopbook-prefs")); window.dispatchEvent(new Event("shopbook-language"));
  } catch (e) { for (const [k, v] of previous) { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } throw e; }
}
