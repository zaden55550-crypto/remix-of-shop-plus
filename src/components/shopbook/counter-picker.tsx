// The till this device sells at, shown only in a shop that has more than one counter (Location.counters). The choice is kept per
// device and shop (erp.selectCounter); every sale, payment, cash event and return made here is tagged with it, so each counter has
// its own drawer and cash-up. A shop with one counter shows nothing and records exactly as before.
import { Monitor } from "lucide-react";
import * as erp from "@/lib/erp";
import { useLanguage } from "@/hooks/use-language";

export const counterName = (n: number, tr: (x: string) => string) => `${tr("Counter")} ${n}`;

export function CounterPicker({ s }: { s: erp.ErpState }) {
  const { tr } = useLanguage();
  const shop = erp.activeShop(s), count = erp.shopCounters(s, shop);
  if (count <= 1) return null;
  const now = erp.activeCounter(s), allowed = erp.allowedCounters(s, shop);
  return <label className="counter-picker" title={tr("Each counter has its own cash drawer and cash-up")}>
    <Monitor aria-hidden />
    <span>{tr("Selling at")}</span>
    <select className="inventory-input" value={now} aria-label={tr("Counter")} onChange={(e) => erp.selectCounter(shop, Number(e.target.value))}>
      {allowed.map((n) => <option key={n} value={n}>{counterName(n, tr)}</option>)}
    </select>
  </label>;
}
