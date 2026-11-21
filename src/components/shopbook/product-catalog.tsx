import { useMemo, useState } from "react";
import { Check, ChevronRight, Plus } from "lucide-react";
import { ShopButton } from "@/components/ui/shop-button";
import { Dot, Empty, Tabs, type Tr } from "@/components/shopbook/erp-shell";
import { ProductSearch } from "@/components/shopbook/product-search";
import { clean } from "@/lib/format";
import { cn } from "@/lib/utils";
import * as erp from "@/lib/erp";

/** Column titles for ProductRow lists. */
export function ProductListHead({ tr, price = "Price" }: { tr: Tr; price?: string }) {
  return <div className="pos-head"><span>{tr("Product")}</span><span className="text-center">{tr("Stock")}</span><span className="text-end">{tr(price)}</span><span /></div>;
}

/** The one compact product row, as POS shows it: stock dot · name · stock · price · action icon.
 *  Callers own what a tap does — add to the cart (POS, Sales), add a line (Purchases), pick the product
 *  for a stock action (Inventory pickers) or open view/edit (All Products) — so browsing never sells. */
export function ProductRow({ p, tr, price, onPick, action = "add", count = 0, selected = false, disabled = false }: {
  p: erp.Product; tr: Tr; price: number; onPick: (from: HTMLElement) => void;
  action?: "add" | "select" | "view"; count?: number; selected?: boolean; disabled?: boolean;
}) {
  const st = erp.stockStatus(p);
  const Icon = action === "view" ? ChevronRight : action === "select" && selected ? Check : Plus;
  return <ShopButton variant="bare" aria-label={`${tr(action === "view" ? "Open" : action === "select" ? "Select" : "Add")} ${p.name}`} aria-pressed={action === "select" ? selected : undefined} disabled={disabled} onClick={(e) => onPick(e.currentTarget)} className={cn("pos-row pos-product-button", (count > 0 || selected) && "pos-row-on")}>
    <span className="flex min-w-0 items-center gap-1.5"><Dot tone={st === "OUT" ? "bad" : st === "LOW" ? "warn" : "ok"} /><span className="truncate" title={p.name} translate="no">{p.name}</span>{count > 0 && <span className="pos-chip">×{count}</span>}</span>
    <span className="text-center tabular-nums">{p.qty}</span>
    <span className="text-end tabular-nums">{clean(Math.round(clean(price) * 100) / 100).toLocaleString("en-KE")}</span>
    <span className="pos-add" aria-hidden="true"><Icon className="h-3.5 w-3.5" /></span>
  </ShopButton>;
}

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
    <ProductListHead tr={tr} />
    {list.length === 0 && <Empty>{s.products.length ? tr("No matching products") : tr("No products yet. Add products in Inventory.")}</Empty>}
    {list.map((p) => <ProductRow key={p.id} p={p} tr={tr} price={p.sell} disabled={p.qty <= 0} count={cart.find((l) => l.productId === p.id)?.qty ?? 0} onPick={(from) => add(p.id, from)} />)}
  </>;
}
