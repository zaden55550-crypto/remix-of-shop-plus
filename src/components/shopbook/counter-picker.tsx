// The till this device sells at, shown only in a shop that has more than one counter (Location.counters). The choice is kept per
// device and shop (erp.selectCounter); every sale, payment, cash event and return made here is tagged with it, so each counter has
// its own drawer and cash-up. A shop with one counter shows nothing and records exactly as before.
import { useEffect, useState } from "react";
import { Monitor, UserRound } from "lucide-react";
import { toast } from "sonner";
import { endCashier, switchCashier, tillCashier } from "@/lib/ready-setup";
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

/** Staff quick PIN at a shared till (ready-setup.ts): shown once any employee has a PIN. The cashier who switches in is the name
 *  recorded on sales from this device until someone else switches or they end their turn. */
export function CashierSwitch({ s }: { s: erp.ErpState }) {
  const { tr } = useLanguage();
  const [who, setWho] = useState<ReturnType<typeof tillCashier>>(null), [asking, setAsking] = useState(false), [pin, setPin] = useState("");
  useEffect(() => { const r = () => setWho(tillCashier()); r(); window.addEventListener("shopbook-cashier", r); return () => window.removeEventListener("shopbook-cashier", r); }, []);
  if (!s.employees.some((e) => e.active && e.pin)) return null;
  const tryPin = (v: string) => {
    setPin(v);
    if (v.length === 4) switchCashier(s, v).then((c) => { toast.success(`${tr("Cashier")}: ${c.name}`); setAsking(false); setPin(""); }, () => { toast.error(tr("Wrong PIN")); setPin(""); });
  };
  return <div className="cashier-switch">
    <UserRound aria-hidden />
    <span>{tr("Cashier")}: <b>{who?.name ?? tr("Admin")}</b></span>
    {asking
      ? <input autoFocus className="inventory-input" type="password" inputMode="numeric" maxLength={4} autoComplete="off" aria-label={tr("PIN")} placeholder="••••" value={pin} onChange={(e) => tryPin(e.target.value.replace(/\D/g, ""))} onBlur={() => { if (!pin) setAsking(false); }} />
      : <button type="button" className="bsetup-link-btn" onClick={() => setAsking(true)}>{tr("Switch cashier")}</button>}
    {who && !asking && <button type="button" className="bsetup-link-btn" onClick={endCashier}>{tr("End turn")}</button>}
  </div>;
}
