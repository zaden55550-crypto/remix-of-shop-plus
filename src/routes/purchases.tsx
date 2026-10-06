import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Banknote, ChevronLeft, ChevronRight, CreditCard, Menu as MenuIcon, MinusCircle, Plus, Receipt, RotateCcw, ShoppingCart } from "lucide-react";
import { toast } from "sonner";
import { ShopButton } from "@/components/ui/shop-button";
import { ProductSearch, useErp } from "@/components/shopbook/product-search";
import { run, useAccount } from "@/components/shopbook/selling";
import { Kpi, KpiRow } from "@/components/shopbook/kpi";
import { useLanguage } from "@/hooks/use-language";
import { lastBackup } from "@/lib/backup";
import { cn } from "@/lib/utils";
import * as erp from "@/lib/erp";
import * as fin from "@/lib/finance";

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

const MENUS = {
  Overview: [],
  Purchases: ["All Purchases", "New Purchase", "Drafts", "Completed", "Cancelled"],
  Suppliers: ["All Suppliers", "Add Supplier", "Balances", "History"],
  Payments: ["All Payments", "Make Payment", "Partial Payments", "History"],
  Returns: ["All Returns", "New Return", "Pending", "Completed", "History"],
  Reports: ["Purchase Report", "Supplier Report", "Payment Report", "Return Report"],
} as const;
type Menu = keyof typeof MENUS;
type Tr = (t: string) => string;
type Ctx = { s: erp.ErpState; money: (n: number) => string; tr: Tr; go: (m: Menu, sub?: string) => void };

// Drafts are unsaved work, not financial records, so they stay outside the ERP ledger.
type DraftLine = { productId: string; qty: string; cost: string; disc: string };
type Draft = { id: string; at: number; supplierId: string; lines: DraftLine[]; status: "draft" | "cancelled" };
const DKEY = "shopbook.purchaseDrafts";
const loadDrafts = (): Draft[] => { try { return JSON.parse(localStorage.getItem(DKEY) || "[]"); } catch { return []; } };
const saveDrafts = (d: Draft[]) => { localStorage.setItem(DKEY, JSON.stringify(d)); window.dispatchEvent(new Event("shopbook-drafts")); };
function useDrafts() {
  const [d, setD] = useState<Draft[]>([]);
  useEffect(() => { setD(loadDrafts()); const f = () => setD(loadDrafts()); window.addEventListener("shopbook-drafts", f); return () => window.removeEventListener("shopbook-drafts", f); }, []);
  return d;
}

const supName = (s: erp.ErpState, id?: string) => s.suppliers.find((x) => x.id === id)?.name ?? "—";
const purStatus = (p: erp.Purchase) => (p.items.every((i) => i.returned >= i.qty) ? "Cancelled" : p.pay.credit > 0.001 ? "Pending" : "Paid");
const methods = (pay: Record<erp.Method, number>) => erp.METHODS.filter((m) => pay[m] > 0.001);
const supplierPayments = (s: erp.ErpState) => s.payments.filter((p) => p.kind === "SUPPLIER PAYMENT");
function supplierStats(s: erp.ErpState, sup: erp.Supplier) {
  const pur = s.purchases.filter((p) => p.supplierId === sup.id);
  const purchases = pur.reduce((a, p) => a + p.total, 0);
  const paid = pur.reduce((a, p) => a + p.pay.cash + p.pay.mpesa + p.pay.bank, 0) + supplierPayments(s).filter((p) => p.source === sup.name).reduce((a, p) => a - p.amount, 0);
  const ids = new Set(pur.map((p) => p.id));
  const returns = s.purchaseReturns.filter((r) => ids.has(r.purchaseId)).reduce((a, r) => a + r.amount, 0);
  return { purchases, paid, returns, count: pur.length };
}

function Purchases() {
  const acct = useAccount("basic");
  const nav = useNavigate();
  const { tr, dir } = useLanguage();
  const s = useErp();
  const [menu, setMenu] = useState<Menu>("Overview");
  const [sub, setSub] = useState("");
  const [open, setOpen] = useState(false);
  const [lb, setLb] = useState(0);
  useEffect(() => { setLb(lastBackup()); }, [s]);
  if (!acct) return <main className="app-screen" />;
  const cur = acct.currency || "KSh";
  const money = (n: number) => `${cur} ${(Math.round(n * 100) / 100 || 0).toLocaleString("en-KE")}`;
  const go = (m: Menu, sm?: string) => { setMenu(m); setSub(sm ?? MENUS[m][0] ?? ""); setOpen(false); };
  const ctx: Ctx = { s, money, tr, go };
  return (
    <main dir={dir} className="inventory-screen flex w-full flex-col">
      <header className="sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur">
        <div className="inventory-header">
          <div className="flex shrink-0 items-center gap-1"><ShopButton variant="bare" className="h-auto w-auto p-0" aria-label={tr("Back")} onClick={() => nav({ to: "/apps" })}><ChevronLeft className="h-4 w-4 rtl:rotate-180" /></ShopButton><h1>{tr("Purchases").toUpperCase()}</h1></div>
          <p className="min-w-0 flex-1 truncate text-center text-sm font-semibold">{acct.shopName}</p>
          <div className="relative shrink-0">
            <ShopButton variant="bare" className="h-auto w-auto p-1" aria-label={tr("Menu")} onClick={() => setOpen(!open)}><MenuIcon className="h-5 w-5" /></ShopButton>
            {open && <div className="absolute end-0 top-9 z-30 w-48 rounded-xl border border-border bg-popover p-1 shadow-lg">
              {(Object.keys(MENUS) as Menu[]).map((m) => <ShopButton variant="bare" key={m} onClick={() => go(m)} className={cn("block w-full rounded-lg px-3 py-2 text-start text-xs font-medium hover:bg-muted", menu === m && "text-primary")}>{tr(m)}</ShopButton>)}
              <ShopButton variant="bare" onClick={() => nav({ to: "/apps" })} className="block w-full rounded-lg px-3 py-2 text-start text-xs font-medium text-muted-foreground hover:bg-muted">{tr("Apps")}</ShopButton>
            </div>}
          </div>
        </div>
        <p className="inventory-backup"><span className={cn("h-2 w-2 rounded-full", lb ? "bg-success" : "bg-warning")} />{lb ? `✓ ${tr("Backed up")} • ${Date.now() - lb < 60000 ? tr("now") : new Date(lb).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}` : tr("Not backed up yet")}</p>
        <Tabs items={Object.keys(MENUS)} value={menu} onChange={(m) => go(m as Menu)} tr={tr} />
        {MENUS[menu].length > 0 && <Tabs small items={[...MENUS[menu]]} value={sub} onChange={setSub} tr={tr} />}
      </header>
      <section className="inventory-content flex-1">
        {menu === "Overview" && <Overview {...ctx} />}
        {menu === "Purchases" && (sub === "New Purchase" ? <NewPurchase {...ctx} /> : sub === "Drafts" || sub === "Cancelled" ? <Drafts {...ctx} cancelled={sub === "Cancelled"} /> : <PurchaseList {...ctx} completed={sub === "Completed"} />)}
        {menu === "Suppliers" && (sub === "Add Supplier" ? <AddSupplier {...ctx} /> : sub === "History" ? <SupplierHistory {...ctx} /> : <SupplierList {...ctx} balances={sub === "Balances"} />)}
        {menu === "Payments" && (sub === "Make Payment" ? <MakePayment {...ctx} /> : <PaymentList {...ctx} partial={sub === "Partial Payments"} />)}
        {menu === "Returns" && (sub === "New Return" ? <NewReturn {...ctx} /> : sub === "Pending" ? <Empty>{tr("No pending returns. Returns complete as soon as they are saved.")}</Empty> : <ReturnList {...ctx} />)}
        {menu === "Reports" && <Reports {...ctx} view={sub} />}
      </section>
    </main>
  );
}

function Tabs({ items, value, onChange, tr, small }: { items: string[]; value: string; onChange: (v: string) => void; tr: Tr; small?: boolean }) {
  return <div role="tablist" className={cn("inventory-tabs", small && "inventory-tabs-sub")}>{items.map((k) => <ShopButton variant="bare" role="tab" aria-selected={value === k} key={k} onClick={() => onChange(k)} className="inventory-tab">{tr(k)}</ShopButton>)}</div>;
}
const Empty = ({ children }: { children: ReactNode }) => <p className="py-6 text-center text-[11px] text-muted-foreground">{children}</p>;
function Box({ title, action, children }: { title: string; action?: () => void; children: ReactNode }) {
  const { tr } = useLanguage();
  return <div className="inventory-box"><div className="inventory-box-heading"><h2>{title}</h2>{action && <ShopButton variant="bare" className="inventory-view-all" onClick={action}>{tr("View All")} ›</ShopButton>}</div>{children}</div>;
}
function Badge({ s }: { s: string }) {
  const { tr } = useLanguage();
  const tone = s === "Paid" || s === "Completed" ? "ok" : s === "Pending" || s === "Draft" ? "warn" : "bad";
  return <span className={cn("pur-badge", `pur-badge-${tone}`)}>{tr(s)}</span>;
}
const Dot = ({ tone }: { tone: "ok" | "warn" | "bad" }) => <span className={cn("inventory-dot", tone === "warn" && "inventory-dot-low", tone === "bad" && "inventory-dot-out")} />;
/** One record = one line; extra columns scroll sideways instead of wrapping. */
const Row = ({ children, onClick }: { children: ReactNode; onClick?: () => void }) => <div className={cn("pur-row", onClick && "cursor-pointer")} onClick={onClick}>{children}</div>;

function Kpis({ s, money, tr, from = 0, to = Date.now() }: Omit<Ctx, "go"> & { from?: number; to?: number }) {
  const inR = (at: number) => at >= from && at <= to;
  const pur = s.purchases.filter((p) => inR(p.at));
  const total = pur.reduce((a, p) => a + p.total, 0);
  const credit = pur.reduce((a, p) => a + p.pay.credit, 0);
  const ret = s.purchaseReturns.filter((r) => inR(r.at)).reduce((a, r) => a + r.amount, 0);
  return <KpiRow>
    <Kpi icon={<ShoppingCart className="text-primary" />} label={tr("Purchases")} value={money(total)} />
    <Kpi icon={<Banknote className="text-warning" />} label={tr("Paid")} value={money(total - credit)} />
    <Kpi icon={<CreditCard className="text-primary" />} label={tr("Credit")} value={money(credit)} tone={credit > 0 ? "warn" : undefined} />
    <Kpi icon={<RotateCcw className="text-destructive" />} label={tr("Returns")} value={money(ret)} />
  </KpiRow>;
}

function PurRow({ p, s, money }: { p: erp.Purchase; s: erp.ErpState; money: (n: number) => string }) {
  const st = purStatus(p);
  return <Row><Dot tone={st === "Paid" ? "ok" : st === "Pending" ? "warn" : "bad"} /><b>{p.ref}</b><span className="pur-name">{supName(s, p.supplierId)}</span><span className="pur-amt">{money(p.total)}</span><Badge s={st} /></Row>;
}
function RetRow({ r, s, money, tr }: { r: erp.PurchaseReturn; s: erp.ErpState; money: (n: number) => string; tr: Tr }) {
  const pur = s.purchases.find((p) => p.id === r.purchaseId);
  const n = r.items.reduce((a, i) => a + i.qty, 0);
  return <Row><Dot tone="ok" /><b>{r.ref}</b><span className="pur-name">{supName(s, pur?.supplierId)}</span><span className="pur-muted">{n} {tr(n === 1 ? "item" : "items")}</span><span className="pur-amt">{money(r.amount)}</span><Badge s="Completed" /></Row>;
}

function Overview(c: Ctx) {
  const { s, money, tr, go } = c;
  const owed = s.suppliers.filter((x) => x.balance > 0.001).sort((a, b) => b.balance - a.balance);
  return (<>
    <Kpis {...c} />
    <Box title={tr("Recent Purchases")} action={() => go("Purchases")}>{s.purchases.length ? s.purchases.slice(0, 5).map((p) => <PurRow key={p.id} p={p} s={s} money={money} />) : <Empty>{tr("No purchases yet")}</Empty>}</Box>
    <Box title={tr("Outstanding Supplier Payments")} action={() => go("Payments", "Make Payment")}>{owed.length ? owed.slice(0, 5).map((x) => <Row key={x.id}><Dot tone="warn" /><span className="pur-name">{x.name}</span><span className="pur-amt">{money(x.balance)}</span><Badge s="Due" /></Row>) : <Empty>{tr("Nothing owed to suppliers")}</Empty>}</Box>
    <Box title={tr("Recent Returns")} action={() => go("Returns")}>{s.purchaseReturns.length ? s.purchaseReturns.slice(0, 5).map((r) => <RetRow key={r.id} r={r} s={s} money={money} tr={tr} />) : <Empty>{tr("No returns yet")}</Empty>}</Box>
  </>);
}

function Search({ q, setQ, tr, ph }: { q: string; setQ: (v: string) => void; tr: Tr; ph: string }) {
  return <div className="inventory-search mb-1.5"><input value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr(ph)} aria-label={tr(ph)} /></div>;
}

function PurchaseList({ s, money, tr, completed }: Ctx & { completed: boolean }) {
  const [q, setQ] = useState("");
  const list = s.purchases.filter((p) => (!completed || purStatus(p) !== "Cancelled") && `${p.ref} ${supName(s, p.supplierId)}`.toLowerCase().includes(q.toLowerCase()));
  return <><Search q={q} setQ={setQ} tr={tr} ph="Search purchases..." /><div className="inventory-box">{list.length ? list.map((p) => <PurRow key={p.id} p={p} s={s} money={money} />) : <Empty>{tr("No purchases yet")}</Empty>}</div></>;
}

function NewPurchase({ s, money, tr, go, draft }: Ctx & { draft?: Draft }) {
  const [q, setQ] = useState("");
  const [lines, setLines] = useState<DraftLine[]>(draft?.lines ?? []);
  const [sup, setSup] = useState(draft?.supplierId ?? "");
  const [pay, setPay] = useState<Record<"cash" | "mpesa" | "bank", string>>({ cash: "", mpesa: "", bank: "" });
  const addLine = (p: erp.Product) => setLines((l) => (l.some((x) => x.productId === p.id) ? l : [...l, { productId: p.id, qty: "1", cost: String(p.buy), disc: "0" }]));
  const results = q.trim() ? erp.searchProducts(s, q).slice(0, 6) : [];
  const lt = (l: DraftLine) => Math.max(0, (+l.qty || 0) * (+l.cost || 0) - (+l.disc || 0));
  const subtotal = lines.reduce((a, l) => a + (+l.qty || 0) * (+l.cost || 0), 0);
  const discount = lines.reduce((a, l) => a + Math.min(+l.disc || 0, (+l.qty || 0) * (+l.cost || 0)), 0);
  const total = Math.round((subtotal - discount) * 100) / 100;
  const paidN = fin.ACCOUNTS.reduce((a, m) => a + (+pay[m] || 0), 0);
  const credit = Math.max(0, Math.round((total - paidN) * 100) / 100);
  const set = (i: number, k: keyof DraftLine, v: string) => setLines(lines.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
  const clear = () => { setLines([]); setPay({ cash: "", mpesa: "", bank: "" }); if (draft) saveDrafts(loadDrafts().filter((d) => d.id !== draft.id)); };
  const confirm = () => {
    if (!sup) { toast.error(tr("Choose a supplier")); return; }
    if (paidN > total + 0.001) { toast.error(tr("Paid amount is more than the total")); return; }
    const r = run(() => fin.confirmPurchase({
      // Line discounts are folded into the unit buying price so stock value and profit use the real cost.
      lines: lines.map((l) => ({ productId: l.productId, qty: +l.qty, cost: +l.qty > 0 ? Math.round((lt(l) / +l.qty) * 100) / 100 : 0 })),
      pay: { cash: +pay.cash || 0, mpesa: +pay.mpesa || 0, bank: +pay.bank || 0, credit }, supplierId: sup, updateCost: true,
    }), tr("Purchase recorded"));
    if (r) { clear(); go("Purchases", "All Purchases"); }
  };
  const saveDraft = () => {
    if (!lines.length) { toast.error(tr("Add products to the purchase")); return; }
    const d: Draft = { id: draft?.id ?? crypto.randomUUID(), at: Date.now(), supplierId: sup, lines, status: "draft" };
    saveDrafts([d, ...loadDrafts().filter((x) => x.id !== d.id)]); toast.success(tr("Draft saved")); setLines([]); go("Purchases", "Drafts");
  };
  return (<div className="inventory-form">
    <label className="inventory-field"><span>{tr("Supplier")} <span className="text-destructive">*</span></span>
      <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-1.5">
        <select className="inventory-input" value={sup} onChange={(e) => setSup(e.target.value)}><option value="">{tr("Select supplier")}</option>{s.suppliers.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
        <ShopButton className="inventory-save px-3" onClick={() => go("Suppliers", "Add Supplier")}><Plus className="h-3.5 w-3.5" />{tr("Add")}</ShopButton>
      </div></label>
    <div><p className="inventory-field mb-1">{tr("Items")}</p><ProductSearch q={q} setQ={setQ} tr={tr} onScan={(code) => { const p = erp.findByCode(s, code); if (p) addLine(p); else toast.error(tr("Product not found. Add it in Inventory first.")); }} />
      {results.map((p) => <button key={p.id} onClick={() => { addLine(p); setQ(""); }} className="pur-row w-full text-start"><span className="pur-name">{p.name}</span><span className="pur-muted">{tr("Stock")} {p.qty}</span></button>)}</div>
    {lines.length > 0 && <div className="pur-scroll"><div className="pur-line pur-line-head"><span>{tr("Product")}</span><span>{tr("Qty")}</span><span>{tr("Buying price")}</span><span>{tr("Discount")}</span><span>{tr("Total")}</span><span /></div>
      {lines.map((l, i) => <div key={l.productId} className="pur-line"><span className="truncate">{s.products.find((x) => x.id === l.productId)?.name}</span>
        <input className="inventory-input" inputMode="decimal" aria-label={tr("Quantity")} value={l.qty} onChange={(e) => set(i, "qty", e.target.value)} />
        <input className="inventory-input" inputMode="decimal" aria-label={tr("Buying price")} value={l.cost} onChange={(e) => set(i, "cost", e.target.value)} />
        <input className="inventory-input" inputMode="decimal" aria-label={tr("Discount")} value={l.disc} onChange={(e) => set(i, "disc", e.target.value)} />
        <span className="text-end tabular-nums">{lt(l).toLocaleString("en-KE")}</span>
        <button aria-label={tr("Remove")} onClick={() => setLines(lines.filter((_, j) => j !== i))}><MinusCircle className="h-4 w-4 text-destructive" /></button></div>)}</div>}
    {lines.length > 0 && <>
      <div className="pur-totals"><span>{tr("Subtotal")}</span><b>{money(subtotal)}</b><span>{tr("Discount")}</span><b>{money(discount)}</b><span>{tr("Total")}</span><b className="text-primary">{money(total)}</b></div>
      <p className="inventory-form-title">{tr("Payment Method")}</p>
      {fin.ACCOUNTS.map((m) => <div key={m} className="grid grid-cols-2 gap-1.5"><span className="inventory-input flex items-center">{tr(erp.METHOD_LABEL[m])}</span><input className="inventory-input" inputMode="decimal" placeholder="0" value={pay[m]} onChange={(e) => setPay({ ...pay, [m]: e.target.value })} /></div>)}
      <div className="grid grid-cols-2 gap-1.5"><span className="inventory-input flex items-center">{tr("Credit")}</span><span className={cn("inventory-input flex items-center tabular-nums", credit > 0 && "text-warning")}>{credit.toLocaleString("en-KE")}</span></div>
      <div className="grid grid-cols-[1fr_2fr] gap-1.5"><ShopButton variant="outline" className="inventory-save" onClick={saveDraft}>{tr("Save draft")}</ShopButton><ShopButton className="inventory-save" onClick={confirm}>{tr("Save Purchase")}</ShopButton></div>
    </>}
  </div>);
}

function Drafts(c: Ctx & { cancelled: boolean }) {
  const { s, money, tr, cancelled } = c;
  const drafts = useDrafts().filter((d) => d.status === (cancelled ? "cancelled" : "draft"));
  const [open, setOpen] = useState<Draft | null>(null);
  if (open) return <NewPurchase {...c} draft={open} />;
  const amt = (d: Draft) => d.lines.reduce((a, l) => a + Math.max(0, (+l.qty || 0) * (+l.cost || 0) - (+l.disc || 0)), 0);
  return <div className="inventory-box">{drafts.length ? drafts.map((d) => <Row key={d.id} onClick={cancelled ? undefined : () => setOpen(d)}><Dot tone={cancelled ? "bad" : "warn"} /><span className="pur-name">{supName(s, d.supplierId)}</span><span className="pur-muted">{d.lines.length} {tr("items")}</span><span className="pur-amt">{money(amt(d))}</span><Badge s={cancelled ? "Cancelled" : "Draft"} />
    {!cancelled && <button className="pur-muted" onClick={(e) => { e.stopPropagation(); saveDrafts(loadDrafts().map((x) => (x.id === d.id ? { ...x, status: "cancelled" as const } : x))); }}>{tr("Cancel")}</button>}</Row>) : <Empty>{tr(cancelled ? "No cancelled purchases" : "No drafts")}</Empty>}</div>;
}

function SupplierList({ s, money, tr, go, balances }: Ctx & { balances: boolean }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const list = s.suppliers.filter((x) => (!balances || x.balance > 0.001) && `${x.name} ${x.phone ?? ""}`.toLowerCase().includes(q.toLowerCase()));
  const sel = s.suppliers.find((x) => x.id === open);
  if (sel) return <SupplierDetail sup={sel} s={s} money={money} tr={tr} back={() => setOpen(null)} />;
  return (<>
    <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-1.5"><Search q={q} setQ={setQ} tr={tr} ph="Search suppliers..." /><ShopButton className="inventory-save px-3" onClick={() => go("Suppliers", "Add Supplier")}><Plus className="h-3.5 w-3.5" />{tr("Add Supplier")}</ShopButton></div>
    <div className="inventory-box">{list.length ? list.map((x) => { const st = supplierStats(s, x); return <Row key={x.id} onClick={() => setOpen(x.id)}><Dot tone={x.balance > 0.001 ? "warn" : "ok"} /><span className="pur-name">{x.name}</span><span className="pur-muted">{x.phone ?? "—"}</span><span className="pur-muted">{tr("Purchases")}: {money(st.purchases)}</span><span className={cn("pur-amt", x.balance > 0.001 && "text-warning")}>{tr("Balance")}: {money(x.balance)}</span><ChevronRight className="h-3.5 w-3.5 shrink-0" /></Row>; }) : <Empty>{tr("No suppliers yet")}</Empty>}</div>
  </>);
}

function SupplierDetail({ sup, s, money, tr, back }: Omit<Ctx, "go"> & { sup: erp.Supplier; back: () => void }) {
  const st = supplierStats(s, sup);
  const pur = s.purchases.filter((p) => p.supplierId === sup.id);
  const ids = new Set(pur.map((p) => p.id));
  return (<>
    <ShopButton variant="bare" className="inventory-view-all mb-1" onClick={back}>‹ {tr("Back")}</ShopButton>
    <Box title={sup.name}>{[["Phone", sup.phone], ["Email", sup.email], ["Address", sup.address], ["Business Information", sup.info], ["Notes", sup.notes]].filter(([, v]) => v).map(([k, v]) => <Row key={k}><span className="pur-muted">{tr(k!)}</span><span className="pur-name text-end">{v}</span></Row>)}</Box>
    <KpiRow className="mt-2"><Kpi label={tr("Purchases")} value={money(st.purchases)} /><Kpi label={tr("Paid")} value={money(st.paid)} /><Kpi label={tr("Balance")} value={money(sup.balance)} tone={sup.balance > 0 ? "warn" : undefined} /><Kpi label={tr("Returns")} value={money(st.returns)} /></KpiRow>
    <Box title={tr("Purchase history")}>{pur.length ? pur.map((p) => <PurRow key={p.id} p={p} s={s} money={money} />) : <Empty>{tr("No purchases yet")}</Empty>}</Box>
    <Box title={tr("Payment history")}>{supplierPayments(s).filter((p) => p.source === sup.name).map((p) => <Row key={p.id}><Dot tone="ok" /><b>{p.ref}</b><span className="pur-muted">{tr(erp.METHOD_LABEL[p.method])}</span><span className="pur-amt">{money(-p.amount)}</span><Badge s="Paid" /></Row>)}</Box>
    <Box title={tr("Return history")}>{s.purchaseReturns.filter((r) => ids.has(r.purchaseId)).map((r) => <RetRow key={r.id} r={r} s={s} money={money} tr={tr} />)}</Box>
  </>);
}

function AddSupplier({ tr, go }: Ctx) {
  const [f, setF] = useState({ name: "", phone: "", email: "", address: "", info: "", notes: "" });
  const field = (k: keyof typeof f, label: string, ph: string, req = false) => <label className="inventory-field"><span>{tr(label)}{req && <span className="text-destructive"> *</span>}</span><input className="inventory-input" placeholder={tr(ph)} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></label>;
  return <div className="inventory-form">
    {field("name", "Supplier Name", "Enter supplier name", true)}{field("phone", "Phone", "Enter phone number")}{field("email", "Email", "Enter email address")}{field("address", "Address", "Enter address")}{field("info", "Business Information", "Enter business information")}{field("notes", "Notes (Optional)", "Enter notes...")}
    <ShopButton className="inventory-save" onClick={() => { if (run(() => fin.addSupplier(f.name, f.phone, { email: f.email, address: f.address, info: f.info, notes: f.notes }), tr("Supplier added"))) go("Suppliers", "All Suppliers"); }}>{tr("Save Supplier")}</ShopButton>
  </div>;
}

function SupplierHistory({ s, money, tr }: Ctx) {
  const rows = [
    ...s.purchases.map((p) => ({ id: p.id, at: p.at, ref: p.ref, who: supName(s, p.supplierId), amt: p.total, st: "Purchase" })),
    ...supplierPayments(s).map((p) => ({ id: p.id, at: p.at, ref: p.ref, who: p.source ?? "—", amt: -p.amount, st: "Payment" })),
    ...s.purchaseReturns.map((r) => ({ id: r.id, at: r.at, ref: r.ref, who: supName(s, s.purchases.find((p) => p.id === r.purchaseId)?.supplierId), amt: r.amount, st: "Return" })),
  ].sort((a, b) => b.at - a.at);
  return <div className="inventory-box">{rows.length ? rows.map((r) => <Row key={r.id}><Dot tone={r.st === "Return" ? "bad" : "ok"} /><b>{r.ref}</b><span className="pur-name">{r.who}</span><span className="pur-muted">{tr(r.st)}</span><span className="pur-amt">{money(r.amt)}</span></Row>) : <Empty>{tr("No history yet")}</Empty>}</div>;
}

function PaymentList({ s, money, tr, partial }: Ctx & { partial: boolean }) {
  const [q, setQ] = useState("");
  const owed = new Set(s.suppliers.filter((x) => x.balance > 0.001).map((x) => x.name));
  const list = supplierPayments(s).filter((p) => (!partial || owed.has(p.source ?? "")) && `${p.ref} ${p.source}`.toLowerCase().includes(q.toLowerCase()));
  return <><Search q={q} setQ={setQ} tr={tr} ph="Search payments..." /><div className="inventory-box">{list.length ? list.map((p) => { const st = owed.has(p.source ?? "") ? "Pending" : "Paid"; return <Row key={p.id}><Dot tone={st === "Paid" ? "ok" : "warn"} /><b>{p.ref}</b><span className="pur-name">{p.source}</span><span className="pur-amt">{money(-p.amount)}</span><span className="pur-muted">{tr(erp.METHOD_LABEL[p.method])}</span><Badge s={st} /></Row>; }) : <Empty>{tr("No supplier payments yet")}</Empty>}</div></>;
}

function MakePayment({ s, money, tr, go }: Ctx) {
  const owed = s.suppliers.filter((x) => x.balance > 0.001);
  const [sup, setSup] = useState(owed[0]?.id ?? "");
  const [rows, setRows] = useState<{ m: erp.Method; a: string }[]>([{ m: "cash", a: "" }]);
  const [note, setNote] = useState("");
  const sel = s.suppliers.find((x) => x.id === sup);
  const total = rows.reduce((a, r) => a + (+r.a || 0), 0);
  const save = () => {
    if (!sel) { toast.error(tr("Choose a supplier")); return; }
    const picked = rows.filter((r) => +r.a > 0);
    if (!picked.length) { toast.error(tr("Enter an amount")); return; }
    if (total > sel.balance + 0.001) { toast.error(tr("Amount is more than the outstanding balance")); return; }
    for (const r of picked) if (run(() => fin.paySupplier(sel.id, +r.a, r.m)) === undefined) return;
    toast.success(tr("Payment recorded")); setRows([{ m: "cash", a: "" }]); setNote(""); go("Payments", "All Payments");
  };
  return <div className="inventory-form">
    <label className="inventory-field"><span>{tr("Supplier")} <span className="text-destructive">*</span></span><select className="inventory-input" value={sup} onChange={(e) => setSup(e.target.value)}><option value="">{tr("Select supplier")}</option>{owed.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
    <div className="pur-totals"><span>{tr("Outstanding Balance")}</span><b>{money(sel?.balance ?? 0)}</b></div>
    <p className="inventory-field">{tr("Payment Method")} <span className="text-destructive">*</span></p>
    {rows.map((r, i) => <div key={i} className="grid grid-cols-[1fr_1fr_auto] items-center gap-1.5">
      <select className="inventory-input" value={r.m} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, m: e.target.value as erp.Method } : x)))}>{fin.ACCOUNTS.map((m) => <option key={m} value={m}>{tr(erp.METHOD_LABEL[m])}</option>)}</select>
      <input className="inventory-input" inputMode="decimal" placeholder="0" value={r.a} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, a: e.target.value } : x)))} />
      <button aria-label={tr("Remove")} disabled={rows.length === 1} onClick={() => setRows(rows.filter((_, j) => j !== i))}><MinusCircle className="h-4 w-4 text-destructive" /></button></div>)}
    {rows.length < 3 && <ShopButton className="inventory-save w-fit px-3" onClick={() => setRows([...rows, { m: fin.ACCOUNTS.find((m) => !rows.some((r) => r.m === m)) ?? "cash", a: "" }])}><Plus className="h-3.5 w-3.5" />{tr("Add Payment Method")}</ShopButton>}
    <div className="pur-totals"><span>{tr("Total Payment")}</span><b>{money(total)}</b><span>{tr("Remaining Balance")}</span><b>{money(Math.max(0, (sel?.balance ?? 0) - total))}</b></div>
    <label className="inventory-field"><span>{tr("Notes (Optional)")}</span><input className="inventory-input" placeholder={tr("Enter notes...")} value={note} onChange={(e) => setNote(e.target.value)} /></label>
    <ShopButton className="inventory-save" onClick={save}>{tr("Save Payment")}</ShopButton>
  </div>;
}

function ReturnList({ s, money, tr }: Ctx) {
  const [q, setQ] = useState("");
  const list = s.purchaseReturns.filter((r) => `${r.ref} ${r.purchaseRef} ${supName(s, s.purchases.find((p) => p.id === r.purchaseId)?.supplierId)}`.toLowerCase().includes(q.toLowerCase()));
  return <><Search q={q} setQ={setQ} tr={tr} ph="Search returns..." /><div className="inventory-box">{list.length ? list.map((r) => <RetRow key={r.id} r={r} s={s} money={money} tr={tr} />) : <Empty>{tr("No returns yet")}</Empty>}</div></>;
}

const REASONS = ["Damaged", "Wrong item", "Faulty", "Excess stock", "Other"];
function NewReturn({ s, money, tr, go }: Ctx) {
  const [pid, setPid] = useState("");
  const [qty, setQty] = useState<Record<string, string>>({});
  const [refund, setRefund] = useState<erp.Method>("credit");
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const pur = s.purchases.find((x) => x.id === pid);
  const amount = pur ? pur.items.reduce((a, i) => a + (+(qty[i.productId] ?? 0) || 0) * i.cost, 0) : 0;
  const save = () => {
    if (!pur) { toast.error(tr("Choose purchase")); return; }
    if (!reason) { toast.error(tr("Select reason")); return; }
    if (run(() => fin.returnPurchase(pur.id, Object.entries(qty).map(([productId, v]) => ({ productId, qty: +v || 0 })), refund, note ? `${reason} — ${note}` : reason), tr("Return recorded")) !== undefined) { setQty({}); go("Returns", "All Returns"); }
  };
  return <div className="inventory-form">
    <label className="inventory-field"><span>{tr("Original Purchase")} <span className="text-destructive">*</span></span><select className="inventory-input" value={pid} onChange={(e) => { setPid(e.target.value); setQty({}); }}><option value="">{tr("Choose purchase")}</option>{s.purchases.filter((p) => purStatus(p) !== "Cancelled").map((p) => <option key={p.id} value={p.id}>{p.ref} - {supName(s, p.supplierId)}</option>)}</select></label>
    {pur && <><label className="inventory-field"><span>{tr("Supplier")}</span><span className="inventory-input flex items-center text-primary">{supName(s, pur.supplierId)}</span></label>
      <div className="inventory-box">{pur.items.map((i) => <div key={i.productId} className="pur-line pur-line-ret"><span className="truncate">{i.name}</span><span className="pur-muted">{i.qty - i.returned} {tr("left")}</span><input className="inventory-input" inputMode="decimal" placeholder="0" aria-label={tr("Quantity")} value={qty[i.productId] ?? ""} onChange={(e) => setQty({ ...qty, [i.productId]: e.target.value })} /><span className="text-end tabular-nums">{((+(qty[i.productId] ?? 0) || 0) * i.cost).toLocaleString("en-KE")}</span></div>)}</div>
      <label className="inventory-field"><span>{tr("Reason")} <span className="text-destructive">*</span></span><select className="inventory-input" value={reason} onChange={(e) => setReason(e.target.value)}><option value="">{tr("Select reason")}</option>{REASONS.map((r) => <option key={r} value={r}>{tr(r)}</option>)}</select></label>
      <label className="inventory-field"><span>{tr("Refund")}</span><select className="inventory-input" value={refund} onChange={(e) => setRefund(e.target.value as erp.Method)}><option value="credit">{tr("Reduce amount owed")}</option>{fin.ACCOUNTS.map((m) => <option key={m} value={m}>{tr("Refund")} • {tr(erp.METHOD_LABEL[m])}</option>)}</select></label>
      <label className="inventory-field"><span>{tr("Notes (Optional)")}</span><input className="inventory-input" placeholder={tr("Enter notes...")} value={note} onChange={(e) => setNote(e.target.value)} /></label>
      <div className="pur-totals"><span>{tr("Return amount")}</span><b className="text-primary">{money(amount)}</b></div>
      <ShopButton className="inventory-save" onClick={save}>{tr("Save Return")}</ShopButton></>}
  </div>;
}

const dayKey = (n: number) => new Date(n).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
function Reports({ s, money, tr, view }: Omit<Ctx, "go"> & { view: string }) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const f = from ? new Date(from).getTime() : 0;
  const t = to ? new Date(to).getTime() + 86399999 : Date.now();
  const inR = (at: number) => at >= f && at <= t;
  const pur = s.purchases.filter((p) => inR(p.at));
  const rets = s.purchaseReturns.filter((r) => inR(r.at));
  const byDate = useMemo(() => { const m = new Map<string, number>(); pur.forEach((p) => m.set(dayKey(p.at), (m.get(dayKey(p.at)) ?? 0) + p.total)); return [...m]; }, [pur]);
  const pays = s.payments.filter((p) => inR(p.at) && (p.kind === "SUPPLIER PAYMENT" || p.kind === "PURCHASE"));
  return (<>
    <div className="grid grid-cols-2 gap-1.5"><label className="inventory-field"><span>{tr("From Date")}</span><input type="date" className="inventory-input" value={from} onChange={(e) => setFrom(e.target.value)} /></label><label className="inventory-field"><span>{tr("To Date")}</span><input type="date" className="inventory-input" value={to} onChange={(e) => setTo(e.target.value)} /></label></div>
    <div className="mt-2"><Kpis s={s} money={money} tr={tr} from={f} to={t} /></div>
    {view === "Purchase Report" && <Box title={tr("Purchases by Date")}>{byDate.length ? byDate.map(([d, v]) => <Row key={d}><span className="pur-name">{d}</span><span className="pur-amt">{money(v)}</span></Row>) : <Empty>{tr("No purchases in this period")}</Empty>}</Box>}
    {view === "Supplier Report" && <Box title={tr("Supplier Report")}>{s.suppliers.length ? s.suppliers.map((x) => { const st = supplierStats(s, x); return <Row key={x.id}><span className="pur-name">{x.name}</span><span className="pur-muted">{tr("Purchases")}: {money(st.purchases)}</span><span className="pur-muted">{tr("Paid")}: {money(st.paid)}</span><span className={cn("pur-amt", x.balance > 0 && "text-warning")}>{tr("Outstanding")}: {money(x.balance)}</span><span className="pur-muted">{tr("Returns")}: {money(st.returns)}</span></Row>; }) : <Empty>{tr("No suppliers yet")}</Empty>}</Box>}
    {view === "Payment Report" && <Box title={tr("Payment Report")}>
      {fin.ACCOUNTS.map((m) => <Row key={m}><span className="pur-name">{tr(erp.METHOD_LABEL[m])}</span><span className="pur-amt">{money(pays.filter((p) => p.method === m).reduce((a, p) => a - p.amount, 0))}</span></Row>)}
      <Row><span className="pur-name">{tr("Credit")}</span><span className="pur-amt">{money(pur.reduce((a, p) => a + p.pay.credit, 0))}</span></Row>
      <Row><span className="pur-name">{tr("Mixed")}</span><span className="pur-amt">{pur.filter((p) => methods(p.pay).length > 1).length} {tr("purchases")}</span></Row>
    </Box>}
    {view === "Return Report" && <Box title={tr("Return Report")}>{rets.length ? rets.flatMap((r) => r.items.map((i) => <Row key={r.id + i.productId}><Receipt className="h-3.5 w-3.5 shrink-0 text-primary" /><span className="pur-name">{i.name}</span><span className="pur-muted">× {i.qty}</span><span className="pur-muted">{supName(s, s.purchases.find((p) => p.id === r.purchaseId)?.supplierId)}</span><span className="pur-amt">{money(i.amount)}</span><span className="pur-muted">{r.reason ?? "—"}</span></Row>)) : <Empty>{tr("No returns in this period")}</Empty>}</Box>}
  </>);
}
