// The cashier serving at this device's shared till (Staff quick PIN, ready-setup.ts). Kept apart from the ERP engine so the
// engine, the app launcher and the page gate can all read it without import cycles.
export const TILL_CASHIER = "shopbook.tillCashier";
export type TillCashier = { id: string; name: string; role?: string | undefined };
export function tillCashier(): TillCashier | null {
  try { const v = JSON.parse(localStorage.getItem(TILL_CASHIER) || "null"); return v && typeof v.id === "string" && typeof v.name === "string" ? v : null; } catch { return null; }
}
/** A cashier who isn't an admin or manager may use only the selling screens until their turn is ended. */
export const tillLimited = () => { const c = tillCashier(); return !!c && c.role !== "admin" && c.role !== "manager"; };
/** Apps a limited cashier may open (the launcher shows only these). */
export const TILL_APPS: readonly string[] = ["pos", "sales"];
const TILL_PAGES = new Set(["", "apps", "invite", ...TILL_APPS]);
/** Whether this page may open while a limited cashier is on the till: the selling screens, the Apps page and sign-in only. */
export function tillMayOpen(path: string) {
  if (!tillLimited()) return true;
  return TILL_PAGES.has(path.split(/[/?#]/).filter(Boolean)[0] ?? "");
}
