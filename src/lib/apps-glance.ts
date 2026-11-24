// Apps page extras (owner, 2026-11-24): today at a glance, the apps used most recently, and small badges for what is waiting.
// All read-only over the shown shop's records (useShopErp), never stored; only the recent-apps list is kept, on this device.
import { saleBalance, stockStatus, type ErpState } from "@/lib/erp";

export type Glance = { salesToday: number; salesCount: number; low: number; unpaid: number; ordersToReceive: number };

export function appsGlance(s: ErpState, now = Date.now()): Glance {
  const day = new Date(now); day.setHours(0, 0, 0, 0);
  const today = s.sales.filter((x) => x.at >= day.getTime());
  return {
    salesToday: Math.round(today.reduce((a, x) => a + x.total, 0) * 100) / 100,
    salesCount: today.length,
    low: s.products.filter((p) => !p.archived && stockStatus(p) !== "OK").length,
    unpaid: s.sales.filter((x) => saleBalance(s, x) > 0.001).length,
    ordersToReceive: s.purchaseOrders.filter((o) => o.status === "Sent" || o.status === "Partially Received").length,
  };
}

/** Badge number per app id (0 = no badge). */
export const appBadges = (g: Glance): Record<string, number> => ({ inventory: g.low, sales: g.unpaid, purchases: g.ordersToReceive });

const RECENT = "shopbook.recentApps";
export function recentApps(): string[] {
  try { const v = JSON.parse(localStorage.getItem(RECENT) || "[]"); return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(0, 3) : []; } catch { return []; }
}
export function noteAppOpened(id: string) {
  try { localStorage.setItem(RECENT, JSON.stringify([id, ...recentApps().filter((x) => x !== id)].slice(0, 3))); } catch { /* a hint only */ }
}
