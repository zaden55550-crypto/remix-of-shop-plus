// Inventory › Expiry: every batch in stock that has expired or expires soon (batches.ts), soonest first, with a one-tap write-off
// that records a Stock Out for that batch. Read from the whole open business, since a product's batches are counted across its
// locations. Nothing here changes stock except the write-off, which goes through the engine like every other movement.
import { useState } from "react";
import { toast } from "sonner";
import { ShopButton } from "@/components/ui/shop-button";
import { Empty } from "@/components/shopbook/erp-shell";
import { Kpi, KpiRow } from "@/components/shopbook/kpi";
import { useBusinessErp } from "@/components/shopbook/product-search";
import { expiringStock, writeOffBatch } from "@/lib/batches";
import { countLabel } from "@/lib/catalog";
import { cn } from "@/lib/utils";

const WINDOWS = [7, 30, 90, 365] as const;

export function ExpiryList({ tr, money }: { tr: (x: string, y?: string) => string; money: (n: number) => string }) {
  const s = useBusinessErp();
  const [days, setDays] = useState<number>(30);
  const [confirm, setConfirm] = useState<string | null>(null);
  const rows = expiringStock(s, days);
  const expired = rows.filter((r) => r.daysLeft < 0), soon = rows.filter((r) => r.daysLeft >= 0);
  const lost = expired.reduce((a, r) => a + r.value, 0);
  const writeOff = (r: (typeof rows)[number]) => {
    try { writeOffBatch(r.productId, r.batch, r.expiry); toast.success(tr("Written off as expired")); setConfirm(null); }
    catch (e) { toast.error(tr(e instanceof Error ? e.message : "Could not write off")); }
  };
  const when = (d: number) => (d < 0 ? tr("Expired {x} days ago", String(-d)) : d === 0 ? tr("Expires today") : tr("{x} days left", String(d)));

  return <div className="expiry-list">
    <KpiRow>
      <Kpi tone="bad" label={tr("Expired batches")} value={expired.length} />
      <Kpi tone="warn" label={tr("Expiring soon")} value={soon.length} />
      <Kpi tone="bad" label={tr("Expired stock value")} value={money(lost)} />
    </KpiRow>
    <div className="expiry-window" role="group" aria-label={tr("Show batches expiring within")}>
      <span>{tr("Show batches expiring within")}</span>
      {WINDOWS.map((d) => <button key={d} type="button" className={cn("expiry-chip", d === days && "is-on")} aria-pressed={d === days} onClick={() => setDays(d)}>{d} {tr("days")}</button>)}
    </div>
    {!rows.length ? <Empty>{tr("Nothing expires in this period. Batches appear here when you enter an expiry date on a purchase or stock-in.")}</Empty>
      : <div className="expiry-table" role="table" aria-label={tr("Expiry")}>
        <div className="expiry-row is-head" role="row"><span role="columnheader">{tr("Product")}</span><span role="columnheader">{tr("Batch")}</span><span role="columnheader">{tr("Expiry date")}</span><span role="columnheader">{tr("Left")}</span><span role="columnheader">{tr("Value")}</span><span role="columnheader" /></div>
        {rows.map((r) => { const k = `${r.productId}|${r.batch}|${r.expiry}`; return <div key={k} className={cn("expiry-row", r.daysLeft < 0 ? "is-expired" : r.daysLeft <= 7 && "is-near")} role="row">
          <span role="cell" className="expiry-name" translate="no">{r.name}</span>
          <span role="cell">{r.batch || "—"}</span>
          <span role="cell"><b>{new Date(`${r.expiry}T00:00:00`).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}</b><small>{when(r.daysLeft)}</small></span>
          <span role="cell">{countLabel(s, r.qty, r.unit)}</span>
          <span role="cell">{money(r.value)}</span>
          <span role="cell">{confirm === k
            ? <span className="expiry-confirm"><ShopButton variant="outline" className="inventory-save" onClick={() => setConfirm(null)}>{tr("Cancel")}</ShopButton><ShopButton className="inventory-save is-danger" onClick={() => writeOff(r)}>{tr("Write off")}</ShopButton></span>
            : <ShopButton variant="outline" className="inventory-save" onClick={() => setConfirm(k)}>{tr(r.daysLeft < 0 ? "Write off" : "Write off early")}</ShopButton>}</span>
        </div>; })}
      </div>}
  </div>;
}
