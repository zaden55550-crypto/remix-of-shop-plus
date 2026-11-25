// One device, more than one owner (owner, 2026-11-25): creating a new account on a device that already holds a business used to keep
// the earlier business's records, settings and Setup draft, so the new owner saw someone else's details. Now the earlier business is
// set aside untouched (never deleted), the new account starts empty, and when the earlier owner logs in with their business name or
// email the device swaps back. Device settings (language, interface size, theme, device id) stay in place for whoever uses the device.
// No imports from shopbook.ts: store.register calls this.
const SAVED = "zakrio.deviceBusinesses";
const ACCOUNT = "shopbook.account";
/** Keys that belong to the business on this device (records, account, settings, sessions, online sign-in). */
const ours = (k: string) => k.startsWith("shopbook") || k.startsWith("sb-");
/** Device preferences, not business data: they stay for whoever uses the device. */
const DEVICE_KEYS = new Set(["shopbook.deviceId", "shopbook.language", "shopbook.uiSize", "shopbook.textSize", "shopbook.theme", "shopbook.phoneLayout", "shopbook.rotateHint", "shopbook.shopbotSpot", "shopbook.planCurrency", "shopbook.hintsSeen"]);
const isBusinessKey = (k: string) => ours(k) && !DEVICE_KEYS.has(k);

type Saved = { name: string; email: string; savedAt: number; keys: Record<string, string> };
type Account = { businessId?: string; shopName?: string; email?: string; demo?: boolean; staff?: boolean };

const norm = (v: string) => v.trim().toLowerCase().replace(/\s+/g, "");
function readSaved(): Record<string, Saved> { try { const v = JSON.parse(localStorage.getItem(SAVED) || "{}"); return v && typeof v === "object" ? v : {}; } catch { return {}; } }
function writeSaved(v: Record<string, Saved>) { if (Object.keys(v).length) localStorage.setItem(SAVED, JSON.stringify(v)); else localStorage.removeItem(SAVED); }
function current(): Account | null { try { return JSON.parse(localStorage.getItem(ACCOUNT) || "null"); } catch { return null; } }

/** Moves the business on this device aside under its id, leaving a clean device. A sample shop or an employee's copy is never kept
 *  this way (the sample has its own parking, an employee's copy comes back from the server). Returns true when something was set aside. */
export function setAsideCurrentBusiness(): boolean {
  const a = current();
  if (!a || a.demo || a.staff) return false;
  const id = a.businessId || `device-${Date.now()}`;
  const keys: Record<string, string> = {};
  for (const k of Object.keys(localStorage)) if (isBusinessKey(k)) keys[k] = localStorage.getItem(k) ?? "";
  // Kept signed out: whoever comes back must log in again.
  delete keys["shopbook.session"];
  const all = readSaved();
  all[id] = { name: a.shopName ?? "", email: a.email ?? "", savedAt: Date.now(), keys };
  writeSaved(all); // written before anything is removed, so a full device never loses the business
  for (const k of Object.keys(localStorage)) if (isBusinessKey(k)) localStorage.removeItem(k);
  try { for (const k of Object.keys(sessionStorage)) if (ours(k)) sessionStorage.removeItem(k); } catch { /* none */ }
  return true;
}

/** The business set aside on this device whose name or email is `id`, if any. */
export function savedBusinessFor(id: string): string | null {
  const want = norm(id);
  if (!want) return null;
  for (const [bid, b] of Object.entries(readSaved())) if (norm(b.name) === want || (b.email && norm(b.email) === want)) return bid;
  return null;
}

/** Puts a set-aside business back (the one on the device now is set aside first). It comes back signed out; Log In then checks
 *  its own password as usual. */
export function restoreBusiness(bid: string): boolean {
  const all = readSaved();
  const b = all[bid];
  if (!b) return false;
  setAsideCurrentBusiness();
  const after = readSaved();
  for (const [k, v] of Object.entries(b.keys)) localStorage.setItem(k, v);
  delete after[bid];
  writeSaved(after);
  return true;
}

/** How many businesses are set aside on this device (for tests and support). */
export const savedBusinessCount = () => Object.keys(readSaved()).length;
