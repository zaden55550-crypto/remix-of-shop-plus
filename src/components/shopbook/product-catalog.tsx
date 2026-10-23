import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { ShopButton } from "@/components/ui/shop-button";
import { Dot, Empty, Tabs, type Tr } from "@/components/shopbook/erp-shell";
import { ProductSearch } from "@/components/shopbook/product-search";
import { clean } from "@/lib/format";
import { cn } from "@/lib/utils";
import * as erp from "@/lib/erp";

/** One catalog presentation for POS and Sales; drafts and checkout remain caller-owned. */
export function ProductCatalog({ s, cart, tr, add, onScan }: {
  s: erp.ErpState; cart: erp.CartLine[]; tr: Tr;
  add: (id: string, from: HTMLElement) => void; onScan: (code: string) => void;
}) {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("all");
  const cats = s.categories.filter((k) => s.products.some((p) => p.categoryId === k.id));
  const active = cats.some((k) => k.id === cat) ? cat : "all";
  const list = useMemo(() => erp.searchProducts(s, q).filter((p) => active === "all" || p.categoryId === active), [s, q, active]);
  return <>
    {cats.length > 0 && <Tabs small items={["all", ...cats.map((k) => k.id)]} value={active} onChange={setCat} tr={(k) => k === "all" ? tr("All") : cats.find((x) => x.id === k)?.name ?? k} />}
    <div className="mt-1.5"><ProductSearch q={q} setQ={setQ} tr={tr} onScan={onScan} /></div>
    <div className="pos-head"><span>{tr("Product")}</span><span className="text-center">{tr("Stock")}</span><span className="text-end">{tr("Price")}</span><span /></div>
    {list.length === 0 && <Empty>{s.products.length ? tr("No matching products") : tr("No products yet. Add products in Inventory.")}</Empty>}
    {list.map((p) => {
      const qty = cart.find((l) => l.productId === p.id)?.qty ?? 0;
      return <ShopButton variant="bare" key={p.id} aria-label={`${tr("Add")} ${p.name}`} disabled={p.qty <= 0} onClick={(e) => add(p.id, e.currentTarget)} className={cn("pos-row pos-product-button", qty > 0 && "pos-row-on")}>
        <span className="flex min-w-0 items-center gap-1.5"><Dot tone={p.qty <= 0 ? "bad" : p.qty <= (p.minStock ?? 5) ? "warn" : "ok"} /><span className="truncate" title={p.name}>{p.name}</span>{qty > 0 && <span className="pos-chip">×{qty}</span>}</span>
        <span className="text-center tabular-nums">{p.qty}</span>
        <span className="text-end tabular-nums">{clean(Math.round(clean(p.sell) * 100) / 100).toLocaleString("en-KE")}</span>
        <span className="pos-add" aria-hidden="true"><Plus className="h-3.5 w-3.5" /></span>
      </ShopButton>;
    })}
  </>;
}