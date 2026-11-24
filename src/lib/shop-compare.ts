// Compare shops (owner, 2026-11-24; Apps page › profile › Manage shops): every shop and warehouse of the open business side by side,
// each worked out from its own records through scopeToShop, so stock and sales are never mixed between locations. Read-only.
import { stockStatus, type ErpState } from "@/lib/erp";
import { isActiveLocation, listLocations } from "@/lib/locations";
import { scopeToShop } from "@/lib/shop-scope";

export type ShopFigures = {
  id: string; name: string; type: string;
  products: number; units: number; stockValue: number; low: number; out: number;
  salesToday: number; salesTodayCount: number; salesMonth: number;
};

const r2 = (n: number) => Math.round(n * 100) / 100;

/** One row per active location (shops first), plus the business total. `now` is for tests. */
export function compareShops(s: ErpState, now = Date.now()): { rows: ShopFigures[]; total: ShopFigures } {
  const day = new Date(now); day.setHours(0, 0, 0, 0);
  const month = new Date(day); month.setDate(1);
  const places = listLocations(s).filter(isActiveLocation).sort((a, b) => Number(a.type !== "shop") - Number(b.type !== "shop"));
  const rows = places.map((l) => {
    const v = scopeToShop(s, l.id);
    const live = v.products.filter((p) => !p.archived);
    const held = live.filter((p) => p.qty > 0);
    const today = v.sales.filter((x) => x.at >= day.getTime());
    return {
      id: l.id, name: l.name || l.code || l.id, type: l.type,
      products: held.length,
      units: r2(held.reduce((a, p) => a + p.qty, 0)),
      stockValue: r2(held.reduce((a, p) => a + p.qty * (p.buy || 0), 0)),
      low: live.filter((p) => stockStatus(p) === "LOW").length,
      out: live.filter((p) => stockStatus(p) === "OUT").length,
      salesToday: r2(today.reduce((a, x) => a + x.total, 0)),
      salesTodayCount: today.length,
      salesMonth: r2(v.sales.filter((x) => x.at >= month.getTime()).reduce((a, x) => a + x.total, 0)),
    };
  });
  const sum = (k: keyof ShopFigures) => r2(rows.reduce((a, r) => a + (r[k] as number), 0));
  // The business total counts each product once, however many locations hold it.
  const total: ShopFigures = { id: "all", name: "All shops", type: "all", products: s.products.filter((p) => !p.archived && p.qty > 0).length, units: sum("units"), stockValue: sum("stockValue"), low: sum("low"), out: sum("out"), salesToday: sum("salesToday"), salesTodayCount: sum("salesTodayCount"), salesMonth: sum("salesMonth") };
  return { rows, total };
}
