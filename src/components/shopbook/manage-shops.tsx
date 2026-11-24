// Manage shops (owner, 2026-11-24; Apps page › profile drawer): which shop the apps show (one shop or all shops together), and a side-by-
// side comparison of every shop and warehouse (stock, value, low stock, sales), each from its own records (src/lib/shop-compare.ts).
import { useMemo, useState } from "react";
import { Check, MapPin, Scale } from "lucide-react";
import { GlassPage } from "@/components/shopbook/glass-page";
import { businessView, useErp } from "@/components/shopbook/product-search";
import { moneyFor } from "@/components/shopbook/selling";
import { useLanguage } from "@/hooks/use-language";
import { selectShop, selectedShop } from "@/lib/erp";
import { isActiveLocation, listLocations } from "@/lib/locations";
import { compareShops } from "@/lib/shop-compare";
import { store } from "@/lib/shopbook";
import { cn } from "@/lib/utils";

export function ManageShops() {
  const { tr } = useLanguage();
  const whole = useErp();
  const view = useMemo(() => businessView(whole), [whole]);
  const shops = listLocations(view).filter((l) => isActiveLocation(l) && l.type === "shop");
  const chosen = selectedShop(whole);
  const [comparing, setComparing] = useState(false);
  const money = moneyFor(store.get()?.currency || "KSh");
  const pick = (id: string | null) => selectShop(id);
  return <div className="manage-shops">
    <p className="manage-shops-note">{tr("The apps show the shop you choose here. All shops shows everything together.")}</p>
    <div className="manage-shops-list" role="radiogroup" aria-label={tr("Shop shown in the apps")}>
      {[{ id: null as string | null, name: tr("All shops") }, ...shops.map((l) => ({ id: l.id as string | null, name: l.name || l.code || l.id }))].map((l) =>
        <button key={l.id ?? "all"} type="button" role="radio" aria-checked={chosen === l.id} className={cn(chosen === l.id && "is-on")} onClick={() => pick(l.id)}>
          <MapPin aria-hidden /><span>{l.name}</span>{chosen === l.id && <Check aria-hidden />}
        </button>)}
    </div>
    <button type="button" className="manage-shops-compare" onClick={() => setComparing(true)}><Scale aria-hidden /> {tr("Compare shops")}</button>
    {comparing && <GlassPage label={tr("Compare shops")} onClose={() => setComparing(false)}><CompareTable money={money} onClose={() => setComparing(false)} /></GlassPage>}
  </div>;
}

function CompareTable({ money, onClose }: { money: (n: number) => string; onClose: () => void }) {
  const { tr } = useLanguage();
  const whole = useErp();
  const { rows, total } = useMemo(() => compareShops(businessView(whole)), [whole]);
  const cols: { key: keyof typeof total; label: string; fmt?: (n: number) => string }[] = [
    { key: "salesToday", label: "Sales today", fmt: money }, { key: "salesTodayCount", label: "Sales" }, { key: "salesMonth", label: "This month", fmt: money },
    { key: "products", label: "Products in stock" }, { key: "units", label: "Units" }, { key: "stockValue", label: "Stock value (cost)", fmt: money },
    { key: "low", label: "Low" }, { key: "out", label: "Out" },
  ];
  const best = (k: keyof typeof total) => Math.max(...rows.map((r) => r[k] as number));
  return <div className="inventory-box dash-panel compare-shops">
    <div className="feature-panel-head"><h3>{tr("Compare shops")}</h3><button type="button" className="compare-shops-done" onClick={onClose}>{tr("Done")}</button></div>
    <p className="settings-note">{tr("Each shop and warehouse from its own records: sales, stock and what needs restocking.")}</p>
    <div className="compare-shops-scroll" data-own-scroll>
      <table>
        <thead><tr><th>{tr("Location")}</th>{cols.map((c) => <th key={c.key}>{tr(c.label)}</th>)}</tr></thead>
        <tbody>
          {rows.map((r) => <tr key={r.id}>
            <th><b translate="no">{r.name}</b><small>{tr(r.type === "shop" ? "Shop" : "Warehouse")}</small></th>
            {cols.map((c) => { const n = r[c.key] as number; const top = rows.length > 1 && n > 0 && n === best(c.key) && !["low", "out"].includes(c.key);
              return <td key={c.key} className={cn(top && "is-top", (c.key === "low" || c.key === "out") && n > 0 && "is-warn")}>{c.fmt ? c.fmt(n) : n.toLocaleString("en-KE")}</td>; })}
          </tr>)}
        </tbody>
        <tfoot><tr><th>{tr("All shops")}</th>{cols.map((c) => <td key={c.key}>{c.fmt ? c.fmt(total[c.key] as number) : (total[c.key] as number).toLocaleString("en-KE")}</td>)}</tr></tfoot>
      </table>
    </div>
  </div>;
}
