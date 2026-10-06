import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { ShopButton } from "@/components/ui/shop-button";
import { ProductSearch, useErp, inputCls } from "@/components/shopbook/product-search";
import { AppShell, Empty, Title, dt, moneyFor, run, useAccount, type Tr } from "@/components/shopbook/selling";
import { Kpi, KpiRow } from "@/components/shopbook/kpi";
import { useLanguage } from "@/hooks/use-language";
import * as erp from "@/lib/erp";
import * as fin from "@/lib/finance";
import { SupplierList } from "@/components/shopbook/suppliers";

export const Route = createFileRoute("/purchases")({
  head: () => ({ meta: [
    { title: "Purchases — SHOPBOOK ERP" },
    { name: "description", content: "Record supplier purchases, receive stock, pay suppliers and return goods." },
    { property: "og:title", content: "Purchases — SHOPBOOK ERP" },
    { property: "og:description", content: "Buy stock from suppliers with automatic stock and money updates." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: Purchases,
});

const TABS = ["New purchase", "Purchases", "Returns", "Suppliers"];
type P = { s: erp.ErpState; money: (n: number) => string; tr: Tr };
const supName = (s: erp.ErpState, id?: string) => s.suppliers.find((x) => x.id === id)?.name ?? "—";

function Purchases() {
  const acct = useAccount("basic");
  const { tr } = useLanguage();
  const s = useErp();
  const [tab, setTab] = useState(TABS[0]!);
  if (!acct) return <main className="app-screen" />;
  const money = moneyFor(acct.currency || "KSh");
  const t = fin.purchaseTotals(s);
  return (
    <AppShell title="Purchases" tabs={TABS} tab={tab} setTab={setTab}>
      <KpiRow>
        <Kpi label={tr("Purchases")} value={money(t.purchases)} />
        <Kpi label={tr("Orders")} value={s.purchases.length} />
        <Kpi label={tr("Payables")} value={money(t.payables)} tone={t.payables > 0 ? "warn" : undefined} />
        <Kpi label={tr("Purchase returns")} value={money(s.purchaseReturns.reduce((a, x) => a + x.amount, 0))} />
      </KpiRow>
      <div className="mt-4">
        {tab === "New purchase" && <NewPurchase s={s} money={money} tr={tr} />}
        {tab === "Purchases" && <List s={s} money={money} tr={tr} />}
        {tab === "Returns" && <Returns s={s} money={money} tr={tr} />}
        {tab === "Suppliers" && <SupplierList s={s} money={money} tr={tr} />}
      </div>
    </AppShell>
  );
}

function NewPurchase({ s, money, tr }: P) {
  const [q, setQ] = useState("");
  const [lines, setLines] = useState<{ productId: string; qty: string; cost: string }[]>([]);
  const [sup, setSup] = useState("");
  const [method, setMethod] = useState<erp.Method>("cash");
  const [paid, setPaid] = useState("");
  const [updateCost, setUpdateCost] = useState(true);
  const addLine = (p: erp.Product) => setLines((l) => (l.some((x) => x.productId === p.id) ? l : [...l, { productId: p.id, qty: "1", cost: String(p.buy) }]));
  const results = q.trim() ? erp.searchProducts(s, q).slice(0, 6) : [];
  const total = lines.reduce((a, l) => a + (+l.qty || 0) * (+l.cost || 0), 0);
  const paidN = paid === "" ? total : Math.min(+paid || 0, total);
  const confirm = () => {
    const pay: Record<erp.Method, number> = { cash: 0, mpesa: 0, bank: 0, credit: 0 };
    if (method !== "credit") pay[method] = Math.round(paidN * 100) / 100;
    pay.credit = Math.round((total - pay.cash - pay.mpesa - pay.bank) * 100) / 100;
    const r = run(() => fin.confirmPurchase({ lines: lines.map((l) => ({ productId: l.productId, qty: +l.qty, cost: +l.cost })), pay, supplierId: sup || undefined, updateCost }), tr("Purchase recorded"));
    if (r) { setLines([]); setPaid(""); }
  };
  return (<>
    <ProductSearch q={q} setQ={setQ} tr={tr} onScan={(code) => { const p = erp.findByCode(s, code); if (p) addLine(p); else toast.error(tr("Product not found. Add it in Inventory first.")); }} />
    {results.map((p) => <button key={p.id} onClick={() => { addLine(p); setQ(""); }} className="flex w-full justify-between border-b border-border py-2 text-start text-sm"><span>{p.name}</span><span className="text-muted-foreground">{tr("Stock")} {p.qty}</span></button>)}
    <Title>{tr("Items")}</Title>
    {lines.length === 0 ? <Empty>{tr("Search or scan products to add")}</Empty> : lines.map((l, i) => {
      const p = s.products.find((x) => x.id === l.productId);
      return (
        <div key={l.productId} className="grid grid-cols-[minmax(0,1fr)_64px_88px_auto] items-center gap-2 border-b border-border py-2 text-sm">
          <span className="truncate">{p?.name}</span>
          <input className={inputCls + " h-9 px-2"} inputMode="decimal" aria-label={tr("Quantity")} value={l.qty} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, qty: e.target.value } : x)))} />
          <input className={inputCls + " h-9 px-2"} inputMode="decimal" aria-label={tr("Cost")} value={l.cost} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, cost: e.target.value } : x)))} />
          <button aria-label={tr("Remove")} onClick={() => setLines(lines.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4 text-muted-foreground" /></button>
        </div>
      );
    })}
    {lines.length > 0 && <div className="mt-3 grid gap-2">
      <div className="flex justify-between text-sm font-bold"><span>{tr("Total")}</span><span>{money(total)}</span></div>
      <select className={inputCls} value={sup} onChange={(e) => setSup(e.target.value)}>
        <option value="">{tr("No supplier")}</option>
        {s.suppliers.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
      </select>
      <div className="grid grid-cols-2 gap-2">
        <select className={inputCls} value={method} onChange={(e) => setMethod(e.target.value as erp.Method)}>{erp.METHODS.map((m) => <option key={m} value={m}>{tr(erp.METHOD_LABEL[m])}</option>)}</select>
        {method !== "credit" && <input className={inputCls} inputMode="decimal" placeholder={tr("Amount paid")} value={paid} onChange={(e) => setPaid(e.target.value)} />}
      </div>
      {total - (method === "credit" ? 0 : paidN) > 0.001 && <p className="text-xs text-warning">{tr("Owed to supplier")}: {money(total - (method === "credit" ? 0 : paidN))}</p>}
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={updateCost} onChange={(e) => setUpdateCost(e.target.checked)} />{tr("Update product buying price")}</label>
      <ShopButton onClick={confirm}>{tr("Confirm purchase")}</ShopButton>
    </div>}
  </>);
}

function List({ s, money, tr }: P) {
  return s.purchases.length === 0 ? <Empty>{tr("No purchases yet")}</Empty> : <>{s.purchases.map((p) => (
    <div key={p.id} className="border-b border-border py-2.5 text-sm">
      <div className="flex justify-between"><b>{p.ref} • {supName(s, p.supplierId)}</b><span className="tabular-nums">{money(p.total)}</span></div>
      <p className="text-[11px] text-muted-foreground">{dt(p.at)} • {p.items.map((i) => `${i.name} × ${i.qty}`).join(", ")}{p.pay.credit > 0 ? ` • ${tr("Credit")} ${money(p.pay.credit)}` : ""}</p>
    </div>
  ))}</>;
}

function Returns({ s, money, tr }: P) {
  const [pid, setPid] = useState("");
  const [qty, setQty] = useState<Record<string, string>>({});
  const [refund, setRefund] = useState<erp.Method>("credit");
  const pur = s.purchases.find((x) => x.id === pid);
  return (<>
    <Title>{tr("Return to supplier")}</Title>
    <select className={inputCls} value={pid} onChange={(e) => { setPid(e.target.value); setQty({}); }}>
      <option value="">{tr("Choose purchase")}</option>
      {s.purchases.map((p) => <option key={p.id} value={p.id}>{p.ref} • {supName(s, p.supplierId)} • {money(p.total)}</option>)}
    </select>
    {pur && <div className="mt-2 grid gap-2">
      {pur.items.map((i) => <div key={i.productId} className="grid grid-cols-[minmax(0,1fr)_80px] items-center gap-2 text-sm"><span className="truncate">{i.name} ({i.qty - i.returned})</span><input className={inputCls + " h-9"} inputMode="decimal" value={qty[i.productId] ?? ""} placeholder="0" onChange={(e) => setQty({ ...qty, [i.productId]: e.target.value })} /></div>)}
      <select className={inputCls} value={refund} onChange={(e) => setRefund(e.target.value as erp.Method)}>
        <option value="credit">{tr("Reduce amount owed")}</option>
        {fin.ACCOUNTS.map((m) => <option key={m} value={m}>{tr("Refund")} • {tr(erp.METHOD_LABEL[m])}</option>)}
      </select>
      <ShopButton onClick={() => run(() => fin.returnPurchase(pur.id, Object.entries(qty).map(([productId, v]) => ({ productId, qty: +v || 0 })), refund), tr("Return recorded")) !== undefined && setQty({})}>{tr("Confirm return")}</ShopButton>
    </div>}
    <Title>{tr("Purchase returns")}</Title>
    {s.purchaseReturns.length === 0 ? <Empty>{tr("No returns yet")}</Empty> : s.purchaseReturns.map((r) => (
      <div key={r.id} className="flex justify-between border-b border-border py-2 text-sm"><span><b>{r.ref}</b><span className="block text-[11px] text-muted-foreground">{r.purchaseRef} • {dt(r.at)}</span></span><span>{money(r.amount)}</span></div>
    ))}
  </>);
}

