// "Try a sample shop" (owner, 2026-11-23): from Log In, anyone can open a full sample business (TechPoint Electronics, built by
// demo.ts through the real ERP actions) without signing up, and tap around every app. It only starts on a device with no business
// of its own, so it can never mix with or overwrite real records. The sample account is marked `demo`, has no password and no online
// identity, so nothing from it is synced or backed up to the server. Leaving removes the sample account and its records.
import { clearDemoData, isDemo, isEmptyShop, loadDemoData } from "@/lib/demo";
import { store, type Account } from "@/lib/shopbook";

export const SAMPLE_NAME = "TechPoint Electronics (sample)";

export const inSampleShop = () => !!store.get()?.demo;

/** Why the sample shop can't start on this device, or null when it can. */
export function sampleBlocked(): string | null {
  const a = store.get();
  if (a?.demo) return null;
  if (a) return "This device already has a business. Open the sample shop in another browser or a private window.";
  if (!isEmptyShop() && !isDemo()) return "This device already has business records. Open the sample shop in another browser or a private window.";
  return null;
}

/** Opens the sample shop: creates the sample account and loads the sample records once, then signs in. */
export function startSampleShop() {
  const why = sampleBlocked();
  if (why) throw new Error(why);
  if (!store.get()?.demo) {
    const sample: Account = {
      shopName: SAMPLE_NAME, email: "", phone: "0712345678", currency: "KES", country: "KEN", password: "",
      plan: "trial", trialStart: Date.now(), industryFamilyId: "trade", businessTypes: ["Electronics Shop"], role: "owner", demo: true,
    };
    store.register(sample);
    if (!isDemo()) loadDemoData();
  }
  store.signIn(false);
}

/** Leaves the sample shop: its records and account are removed, so the device is empty again. */
export function leaveSampleShop() {
  if (!store.get()?.demo) return;
  if (isDemo()) clearDemoData(SAMPLE_NAME);
  for (const k of ["shopbook.erp", "shopbook.account", "shopbook.demo.backup", "shopbook.setupDraft", "shopbook.settings", "shopbook.activeShop", "shopbook.activeBusiness"]) { try { localStorage.removeItem(k); } catch { /* nothing to remove */ } }
  store.signOut();
  window.dispatchEvent(new Event("shopbook-erp"));
}
