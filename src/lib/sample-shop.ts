// "Try a sample shop" (owner, 2026-11-23): from Log In, anyone can open a full sample business (TechPoint Electronics, built by
// demo.ts through the real ERP actions) without signing up, and tap around every app, on any device.
// A device that already has a business (the owner showing a visitor on their own laptop) keeps it safe: before the sample opens,
// everything the app keeps on this device (the business, its records, settings, waiting uploads and the online sign-in) is set aside
// untouched under one key, and put back exactly as it was when the sample is closed. The sample account is marked `demo`, has no
// password and no online identity, and sync and cloud backup skip it, so nothing from it reaches the server. If the browser is closed
// during the sample, the real business is put back automatically the next time the app opens.
import { isDemo, loadDemoData } from "@/lib/demo";
import { store, type Account } from "@/lib/shopbook";

export const SAMPLE_NAME = "TechPoint Electronics (sample)";
const PARKED = "zakrio.parkedBusiness";
/** Keys that belong to the business on this device (records, account, settings, sessions, online sign-in). */
const ours = (k: string) => k.startsWith("shopbook") || k.startsWith("sb-");

export const inSampleShop = () => !!store.get()?.demo;
const hasParked = () => { try { return localStorage.getItem(PARKED) !== null; } catch { return false; } };

/** Why the sample shop can't start on this device, or null when it can. Only an employee's device refuses (it holds the employer's copy). */
export function sampleBlocked(): string | null {
  if (store.get()?.staff) return "This device is signed in as an employee. Ask the owner to show the sample shop.";
  return null;
}

/** Sets this device's own business aside (untouched) so the sample can open on a clean slate. */
function parkBusiness() {
  if (hasParked()) return;
  const saved: Record<string, string> = {};
  for (const k of Object.keys(localStorage)) if (ours(k)) saved[k] = localStorage.getItem(k) ?? "";
  if (!Object.keys(saved).length) return;
  localStorage.setItem(PARKED, JSON.stringify(saved));
  for (const k of Object.keys(saved)) localStorage.removeItem(k);
  try { for (const k of Object.keys(sessionStorage)) if (ours(k)) sessionStorage.removeItem(k); } catch { /* none */ }
}
/** Removes the sample and puts the set-aside business back exactly as it was. */
function unparkBusiness() {
  for (const k of Object.keys(localStorage)) if (ours(k)) localStorage.removeItem(k);
  try { for (const k of Object.keys(sessionStorage)) if (ours(k)) sessionStorage.removeItem(k); } catch { /* none */ }
  const raw = localStorage.getItem(PARKED);
  if (raw) {
    // The business comes back signed out: a visitor leaving the sample must never land in the owner's business.
    try { for (const [k, v] of Object.entries(JSON.parse(raw) as Record<string, string>)) if (k !== "shopbook.session") localStorage.setItem(k, v); } catch { /* unreadable: keep it for support */ return; }
    localStorage.removeItem(PARKED);
  }
}

/** Opens the sample shop: sets the device's own business aside if there is one, then loads the sample and signs in for this tab. */
export function startSampleShop() {
  const why = sampleBlocked();
  if (why) throw new Error(why);
  if (!store.get()?.demo) {
    parkBusiness();
    const sample: Account = {
      shopName: SAMPLE_NAME, email: "", phone: "0712345678", currency: "KES", country: "KEN", password: "",
      plan: "trial", trialStart: Date.now(), industryFamilyId: "trade", businessTypes: ["Electronics Shop"], role: "owner", demo: true,
    };
    store.register(sample);
    if (!isDemo()) loadDemoData();
  }
  store.signIn(false);
}

/** Leaves the sample shop: its records and account are removed and the device's own business (if any) comes back. */
export function leaveSampleShop() {
  if (!store.get()?.demo && !hasParked()) return;
  unparkBusiness();
  store.signOut();
  window.dispatchEvent(new Event("shopbook-erp"));
  window.dispatchEvent(new Event("shopbook-session"));
}

/** On start: a sample left open when the browser closed (its tab-only session is gone) is closed and the real business put back. */
export function recoverAbandonedSample() {
  if (typeof window === "undefined") return;
  try {
    const a = store.get();
    if ((a?.demo && !store.signedIn()) || (!a?.demo && hasParked())) unparkBusiness();
  } catch { /* storage blocked */ }
}
recoverAbandonedSample();
